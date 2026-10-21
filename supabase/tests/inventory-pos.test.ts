import { calculateCommissions } from "@palace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { IDS, as, ana, createAppointment, installItem, owner, pool, reception, resetFixtures, setIdentity, stock, superQuery } from "./helpers";

beforeEach(resetFixtures);

const sellHair = (key?: string) => ({
  location_id: IDS.location,
  idempotency_key: key,
  lines: [{ kind: "product", variant_id: IDS.hairVariant, quantity: 1 }],
  payments: [{ method: "cash", amount_cents: 120000 }],
});

describe("Inventario y punto de venta", () => {
  it("Escenario 2: dos ventas simultáneas de la última unidad → solo una se completa", async () => {
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query("begin");
      await c2.query("begin");
      await setIdentity(c1, reception);
      await setIdentity(c2, reception);
      await c1.query(`select public.pos_checkout($1::jsonb)`, [JSON.stringify(sellHair())]);
      const second = c2.query(`select public.pos_checkout($1::jsonb)`, [JSON.stringify(sellHair())]).then(
        () => "ok",
        (e: Error) => e.message,
      );
      await new Promise((r) => setTimeout(r, 300));
      await c1.query("commit");
      expect(await second).toBe("INSUFFICIENT_STOCK");
      await c2.query("rollback");
    } finally {
      c1.release();
      c2.release();
    }
    expect(await stock(IDS.hairVariant)).toEqual({ onHand: 0, reserved: 0 });
  });

  it("Escenario 6: producto reservado para una cita no se puede vender; sin existencias la cita lo reporta", async () => {
    await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00", { materials: [{ variant_id: IDS.hairVariant, quantity: 1 }] })));
    await expect(as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb)`, [JSON.stringify(sellHair())]))).rejects.toThrow(
      "INSUFFICIENT_STOCK",
    );
    // Otra cita que necesita el mismo tono: falla, o se agenda marcada como "material faltante".
    await expect(
      as(reception, (c) => createAppointment(c, IDS.clientB, installItem(IDS.bea, "15:00", { materials: [{ variant_id: IDS.hairVariant, quantity: 1 }] }))),
    ).rejects.toThrow("INSUFFICIENT_STOCK");
    const id = await as(reception, (c) =>
      createAppointment(c, IDS.clientB, installItem(IDS.bea, "15:00", { materials: [{ variant_id: IDS.hairVariant, quantity: 1 }] }), { allowMissing: true }),
    );
    const [a] = await superQuery(`select materials_status from public.appointments where id = $1`, [id]);
    expect(a.materials_status).toBe("missing");
    const alerts = await superQuery(`select kind from public.ops_alerts where reference_id = $1`, [id]);
    expect(alerts[0].kind).toBe("materials_missing");
  });

  it("el precio se calcula en el servidor y el descuento manual requiere autorización", async () => {
    const tampered = { ...sellHair(), lines: [{ kind: "product", variant_id: IDS.hairVariant, quantity: 1, unit_price_cents: 1 }] };
    await expect(as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb)`, [JSON.stringify(tampered)]))).rejects.toThrow(
      "PRICE_OVERRIDE_NOT_AUTHORIZED",
    );
    const discounted = { ...sellHair(), lines: [{ kind: "product", variant_id: IDS.hairVariant, quantity: 1, discount_cents: 20000 }] };
    await expect(as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb)`, [JSON.stringify(discounted)]))).rejects.toThrow(
      "DISCOUNT_NOT_AUTHORIZED",
    );
    const ok = await as(owner, (c) =>
      c.query(`select public.pos_checkout($1::jsonb) as r`, [JSON.stringify({ ...discounted, payments: [{ method: "card", amount_cents: 100000, provider: "terminal", provider_ref: "T-1" }] })]),
    );
    expect(ok.rows[0].r.total_cents).toBe(100000);
  });

  it("idempotencia del cobro: la misma llave no duplica la venta ni descuenta dos veces", async () => {
    const a = await as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb) as r`, [JSON.stringify(sellHair("sale-1"))]));
    const b = await as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb) as r`, [JSON.stringify(sellHair("sale-1"))]));
    expect(b.rows[0].r.duplicate).toBe(true);
    expect(b.rows[0].r.sale_id).toBe(a.rows[0].r.sale_id);
    expect(await stock(IDS.hairVariant)).toEqual({ onHand: 0, reserved: 0 });
  });

  it("pagos divididos, parciales con saldo pendiente y propina", async () => {
    const p = {
      location_id: IDS.location,
      client_id: IDS.clientA,
      allow_balance: true,
      lines: [{ kind: "service", service_id: IDS.install, staff_id: IDS.ana }],
      payments: [
        { method: "cash", amount_cents: 200000, tip_cents: 10000, tip_staff_id: IDS.ana },
        { method: "card", amount_cents: 200000, provider: "terminal", provider_ref: "T-9" },
      ],
    };
    const r = await as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb) as r`, [JSON.stringify(p)]));
    expect(r.rows[0].r.balance_due_cents).toBe(100000);
    const left = await as(reception, (c) => c.query(`select public.pay_sale_balance($1, 'cash', 100000) as n`, [r.rows[0].r.sale_id]));
    expect(left.rows[0].n).toBe(0);
    // Pago incompleto sin permitir saldo → rechazado.
    await expect(
      as(reception, (c) =>
        c.query(`select public.pos_checkout($1::jsonb)`, [
          JSON.stringify({ ...p, allow_balance: false, payments: [{ method: "card", amount_cents: 100000, provider: "terminal", provider_ref: "T-10" }] }),
        ]),
      ),
    ).rejects.toThrow("PAYMENT_INCOMPLETE");
    // La misma referencia de terminal no puede registrarse dos veces.
    await expect(
      as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb)`, [JSON.stringify({ ...p, payments: [p.payments[1]] })])),
    ).rejects.toThrow("DUPLICATE_PAYMENT");
  });

  it("Escenario 7: venta con anticipo aplicado; el anticipo no se puede usar dos veces", async () => {
    const appt = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    const dep = await as(reception, (c) => c.query(`select public.record_appointment_deposit($1, 100000, 'transfer') as r`, [appt]));
    const depositId = dep.rows[0].r.deposit_id;
    const [line] = await superQuery(`select id from public.appointment_services where appointment_id = $1`, [appt]);
    const checkout = {
      location_id: IDS.location,
      client_id: IDS.clientA,
      appointment_id: appt,
      lines: [{ kind: "service", service_id: IDS.install, appointment_service_id: line.id, staff_id: IDS.ana }],
      payments: [
        { method: "deposit", amount_cents: 100000, deposit_id: depositId },
        { method: "card", amount_cents: 400000, provider: "terminal", provider_ref: "T-2" },
      ],
    };
    const r = await as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb) as r`, [JSON.stringify(checkout)]));
    expect(r.rows[0].r.balance_due_cents).toBe(0);
    const [d] = await superQuery(`select status from public.appointment_deposits where id = $1`, [depositId]);
    expect(d.status).toBe("applied");
    const [a] = await superQuery(`select payment_status from public.appointments where id = $1`, [appt]);
    expect(a.payment_status).toBe("paid");
    const again = { ...checkout, payments: [{ method: "deposit", amount_cents: 100000, deposit_id: depositId }, { method: "cash", amount_cents: 400000 }] };
    await expect(as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb)`, [JSON.stringify(again)]))).rejects.toThrow(
      "DEPOSIT_NOT_AVAILABLE",
    );
  });

  it("Escenario 8: devolución con reingreso a inventario (solo propietaria/administración)", async () => {
    const r = await as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb) as r`, [JSON.stringify(sellHair())]));
    const [line] = await superQuery(`select id from public.sale_lines where sale_id = $1`, [r.rows[0].r.sale_id]);
    await expect(
      as(reception, (c) => c.query(`select public.refund_sale_line($1, 1, true, 'Defecto', 'cash')`, [line.id])),
    ).rejects.toThrow("FORBIDDEN");
    const ref = await as(owner, (c) => c.query(`select public.refund_sale_line($1, 1, true, 'Defecto', 'cash') as r`, [line.id]));
    expect(ref.rows[0].r.refund_cents).toBe(120000);
    expect(await stock(IDS.hairVariant)).toEqual({ onHand: 1, reserved: 0 });
    const [s] = await superQuery(`select status from public.sales where id = $1`, [r.rows[0].r.sale_id]);
    expect(s.status).toBe("refunded");
    await expect(as(owner, (c) => c.query(`select public.refund_sale_line($1, 1, true, 'Otra vez', 'cash')`, [line.id]))).rejects.toThrow(
      "INVALID_QUANTITY",
    );
  });

  it("Escenario 9: comisión calculada sobre la base auditable neta de descuentos y devoluciones", async () => {
    await as(owner, (c) =>
      c.query(`select public.pos_checkout($1::jsonb)`, [
        JSON.stringify({
          location_id: IDS.location,
          lines: [
            { kind: "service", service_id: IDS.install, staff_id: IDS.ana, discount_cents: 50000 },
            { kind: "product", variant_id: IDS.hairVariant, staff_id: IDS.ana, quantity: 1 },
          ],
          payments: [{ method: "cash", amount_cents: 570000 }],
        }),
      ]),
    );
    const [prod] = await superQuery(`select id from public.sale_lines where kind = 'product'`);
    await as(owner, (c) => c.query(`select public.refund_sale_line($1, 1, true, 'Devolución', 'cash')`, [prod.id]));
    const rows = await as(ana, (c) => c.query(`select * from public.v_commissionable_lines`));
    // La estilista solo ve sus propias líneas.
    expect(rows.rows).toHaveLength(2);
    const lines = rows.rows.map((r) => ({
      lineId: r.line_id,
      kind: r.kind,
      staffId: r.staff_id,
      serviceId: r.service_id,
      grossCents: Number(r.gross_cents),
      discountCents: r.discount_cents + r.coupon_share_cents,
      refundedCents: r.refunded_cents,
    }));
    const [res] = calculateCommissions(lines, { [IDS.ana]: [{ kind: "percent_service", bps: 1000 }, { kind: "percent_product", bps: 1000 }] });
    expect(res!.netServicesCents).toBe(450000);
    expect(res!.netProductsCents).toBe(0);
    expect(res!.commissionCents).toBe(45000);
  });

  it("corte de caja: esperado = fondo + efectivo + anticipos en efectivo − devoluciones en efectivo", async () => {
    const sessionId = await as(reception, async (c) => (await c.query(`select public.open_cash_session($1, 50000) as id`, [IDS.location])).rows[0].id);
    await expect(as(reception, (c) => c.query(`select public.open_cash_session($1, 0)`, [IDS.location]))).rejects.toThrow("CASH_SESSION_ALREADY_OPEN");
    await as(reception, (c) => c.query(`select public.pos_checkout($1::jsonb)`, [JSON.stringify({ ...sellHair(), cash_session_id: sessionId })]));
    const r = await as(reception, (c) => c.query(`select public.close_cash_session($1, 168000) as r`, [sessionId]));
    expect(r.rows[0].r).toEqual({ expected_cents: 170000, counted_cents: 168000, difference_cents: -2000 });
  });

  it("los movimientos de inventario son inmutables y los ajustes requieren motivo", async () => {
    await expect(superQuery(`update public.stock_movements set quantity = 99`)).rejects.toThrow("IMMUTABLE_LEDGER");
    await expect(
      as({ userId: IDS.inventoryUser }, (c) => c.query(`select public.record_stock_movement($1, $2, 'adjustment', -1)`, [IDS.adhesiveVariant, IDS.location])),
    ).rejects.toThrow("NOTE_REQUIRED");
    await as({ userId: IDS.inventoryUser }, (c) =>
      c.query(`select public.record_stock_movement($1, $2, 'waste', 2, 'Caducado')`, [IDS.adhesiveVariant, IDS.location]),
    );
    expect(await stock(IDS.adhesiveVariant)).toEqual({ onHand: 8, reserved: 0 });
  });
});
