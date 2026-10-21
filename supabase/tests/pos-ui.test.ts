import { beforeEach, describe, expect, it } from "vitest";
import { IDS, as, ana, createAppointment, installItem, owner, reception, resetFixtures, stock, superQuery } from "./helpers";

beforeEach(resetFixtures);

const openSession = (float = 50000, breakdown: Record<string, number> | null = null, who = reception) =>
  as(who, async (c) =>
    (await c.query(`select public.open_cash_session($1, $2, $3::jsonb) as id`, [IDS.location, float, breakdown ? JSON.stringify(breakdown) : null])).rows[0]
      .id as string,
  );

const checkout = (p: Record<string, unknown>, who = reception) =>
  as(who, async (c) => (await c.query(`select public.pos_checkout($1::jsonb) as r`, [JSON.stringify({ location_id: IDS.location, ...p })])).rows[0].r);

describe("Caja del punto de venta (UI)", () => {
  it("abre con desglose que debe sumar el fondo y lo guarda", async () => {
    await expect(openSession(50000, { "20000": 2 })).rejects.toThrow("BREAKDOWN_MISMATCH");
    await expect(openSession(50000, { abc: 1 })).rejects.toThrow("BREAKDOWN_INVALID");
    await expect(openSession(-1)).rejects.toThrow("INVALID_AMOUNT");
    const id = await openSession(50000, { "20000": 2, "5000": 2 });
    const [s] = await superQuery(`select opening_breakdown, opening_float_cents from public.cash_sessions where id = $1`, [id]);
    expect(s.opening_breakdown).toEqual({ "20000": 2, "5000": 2 });
    // Compatibilidad: la firma de dos argumentos sigue funcionando y no hay sobrecargas duplicadas.
    const fns = await superQuery(`select count(*)::int n from pg_proc where proname in ('open_cash_session', 'pay_sale_balance', 'close_cash_session')`);
    expect(fns[0].n).toBe(3);
  });

  it("la caja vigente es visible para recepción aunque la abriera la propietaria", async () => {
    const id = await openSession(10000, null, owner);
    const seen = await as(reception, async (c) => (await c.query(`select public.current_cash_session($1) as r`, [IDS.location])).rows[0].r);
    expect(seen.id).toBe(id);
    expect(seen.opened_by_name).toBe("Dueña");
    // Por RLS, la tabla solo le muestra sus propias cajas.
    const rows = await as(reception, (c) => c.query(`select id from public.cash_sessions`));
    expect(rows.rows).toHaveLength(0);
    // Una estilista no cobra ni consulta la caja.
    await expect(as(ana, (c) => c.query(`select public.current_cash_session($1)`, [IDS.location]))).rejects.toThrow("FORBIDDEN");
    await expect(as(ana, (c) => c.query(`select public.cash_session_summary($1)`, [id]))).rejects.toThrow("FORBIDDEN");
  });

  it("resumen por método y esperado; el abono en efectivo cuenta en la caja donde se recibe", async () => {
    const s1 = await openSession(50000);
    const sale = await checkout({
      cash_session_id: s1,
      client_id: IDS.clientA,
      allow_balance: true,
      lines: [{ kind: "service", service_id: IDS.install, staff_id: IDS.ana }],
      payments: [
        { method: "cash", amount_cents: 100000, tip_cents: 5000, tip_staff_id: IDS.ana },
        { method: "card", amount_cents: 200000, provider: "terminal", provider_ref: "UI-1" },
      ],
    });
    expect(sale.balance_due_cents).toBe(200000);
    const sum = await as(reception, async (c) => (await c.query(`select public.cash_session_summary($1) as r`, [s1])).rows[0].r);
    expect(sum.by_method.cash).toEqual({ amount_cents: 100000, tip_cents: 5000, count: 1 });
    expect(sum.by_method.card.amount_cents).toBe(200000);
    expect(sum.expected_cash_cents).toBe(155000);
    const closed = await as(reception, async (c) => (await c.query(`select public.close_cash_session($1, 155000, null, '{"50000": 3, "5000": 1}'::jsonb) as r`, [s1])).rows[0].r);
    expect(closed.difference_cents).toBe(0);

    // Nueva caja: el abono del saldo pendiente entra aquí, no en la caja ya cerrada.
    const s2 = await openSession(0);
    await expect(
      as(reception, (c) => c.query(`select public.pay_sale_balance($1, 'cash', 100000, null, $2)`, [sale.sale_id, s1])),
    ).rejects.toThrow("CASH_SESSION_NOT_OPEN");
    const left = await as(reception, async (c) => (await c.query(`select public.pay_sale_balance($1, 'cash', 100000, null, $2) as n`, [sale.sale_id, s2])).rows[0].n);
    expect(left).toBe(100000);
    await expect(as(reception, (c) => c.query(`select public.pay_sale_balance($1, 'cash', 100001, null, $2)`, [sale.sale_id, s2]))).rejects.toThrow(
      "INVALID_AMOUNT",
    );
    await expect(
      as(reception, (c) => c.query(`select public.pay_sale_balance('00000000-0000-0000-0000-00000000dead', 'cash', 1)`)),
    ).rejects.toThrow("NOT_FOUND");
    const sum2 = await as(reception, async (c) => (await c.query(`select public.cash_session_summary($1) as r`, [s2])).rows[0].r);
    expect(sum2.expected_cash_cents).toBe(100000);
    const [old] = await superQuery(`select expected_cash_cents from public.cash_sessions where id = $1`, [s1]);
    expect(old.expected_cash_cents).toBe(155000);
    // La referencia de terminal no se repite en abonos.
    await as(reception, (c) => c.query(`select public.pay_sale_balance($1, 'card', 50000, 'UI-2', $2)`, [sale.sale_id, s2]));
    await expect(
      as(reception, (c) => c.query(`select public.pay_sale_balance($1, 'card', 50000, 'UI-2', $2)`, [sale.sale_id, s2])),
    ).rejects.toThrow("DUPLICATE_PAYMENT");
  });

  it("devolución en efectivo resta del esperado; anticipos en efectivo de la ventana suman", async () => {
    const s = await openSession(0);
    const appt = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    await as(reception, (c) => c.query(`select public.record_appointment_deposit($1, 100000, 'cash')`, [appt]));
    const sale = await checkout({
      cash_session_id: s,
      lines: [{ kind: "product", variant_id: IDS.hairVariant, quantity: 1 }],
      payments: [{ method: "cash", amount_cents: 120000 }],
    });
    const [line] = await superQuery(`select id from public.sale_lines where sale_id = $1`, [sale.sale_id]);
    await as(owner, (c) => c.query(`select public.refund_sale_line($1, 1, true, 'Defecto', 'cash', $2)`, [line.id, s]));
    expect(await stock(IDS.hairVariant)).toEqual({ onHand: 1, reserved: 0 });
    const sum = await as(owner, async (c) => (await c.query(`select public.cash_session_summary($1) as r`, [s])).rows[0].r);
    expect(sum.cash_deposits_cents).toBe(100000);
    expect(sum.cash_refunds_cents).toBe(120000);
    expect(sum.expected_cash_cents).toBe(100000);
  });

  it("una caja cerrada solo la consultan owner/admin o quien la abrió o cerró", async () => {
    const s = await openSession(0, null, owner);
    await as(owner, (c) => c.query(`select public.close_cash_session($1, 0)`, [s]));
    await expect(as(reception, (c) => c.query(`select public.cash_session_summary($1)`, [s]))).rejects.toThrow("FORBIDDEN");
    const s2 = await openSession(0, null, owner);
    await as(reception, (c) => c.query(`select public.close_cash_session($1, 0)`, [s2]));
    const r = await as(reception, async (c) => (await c.query(`select public.cash_session_summary($1) as r`, [s2])).rows[0].r);
    expect(r.status).toBe("closed");
    expect(r.closed_by_name).toBe("Recepción");
  });

  it("al liquidar el saldo de una venta de cita, la cita queda pagada", async () => {
    const appt = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    const [line] = await superQuery(`select id from public.appointment_services where appointment_id = $1`, [appt]);
    const sale = await checkout({
      client_id: IDS.clientA,
      appointment_id: appt,
      allow_balance: true,
      lines: [{ kind: "service", service_id: IDS.install, appointment_service_id: line.id, staff_id: IDS.ana }],
      payments: [{ method: "cash", amount_cents: 100000 }],
    });
    await as(reception, (c) => c.query(`select public.pay_sale_balance($1, 'transfer', 400000)`, [sale.sale_id]));
    const [a] = await superQuery(`select payment_status from public.appointments where id = $1`, [appt]);
    expect(a.payment_status).toBe("paid");
  });

  it("el cupón no distingue mayúsculas (citext) y cuenta su uso", async () => {
    await superQuery(`insert into public.coupons (code, kind, value, max_uses) values ('Bienvenida10', 'percent', 1000, 1)`);
    const r = await checkout({
      coupon_code: "BIENVENIDA10",
      lines: [{ kind: "service", service_id: IDS.install }],
      payments: [{ method: "cash", amount_cents: 450000 }],
    });
    expect(r.total_cents).toBe(450000);
    await expect(
      checkout({ coupon_code: "bienvenida10", lines: [{ kind: "service", service_id: IDS.install }], payments: [{ method: "cash", amount_cents: 450000 }] }),
    ).rejects.toThrow("COUPON_INVALID");
    const fns = await superQuery(`select prosecdef, proconfig from pg_proc where proname = 'pos_checkout'`);
    expect(fns).toEqual([{ prosecdef: true, proconfig: ['search_path=""'] }]);
  });

  it("anon no ejecuta las funciones nuevas", async () => {
    await expect(as("anon", (c) => c.query(`select public.current_cash_session($1)`, [IDS.location]))).rejects.toThrow(/permission denied/);
    await expect(as("anon", (c) => c.query(`select public.cash_session_summary($1)`, [IDS.location]))).rejects.toThrow(/permission denied/);
  });
});
