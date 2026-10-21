import { beforeEach, describe, expect, it } from "vitest";
import { DAY, IDS, as, ana, at, createAppointment, installItem, owner, reception, resetFixtures, superQuery } from "./helpers";

// resetFixtures limpia todas las tablas operativas (incluidas ventas, citas y gastos).
beforeEach(resetFixtures);

const loc = IDS.location;

async function checkout(lines: unknown[], payments: unknown[], extra: Record<string, unknown> = {}) {
  const r = await as(owner, (c) =>
    c.query(`select public.pos_checkout($1::jsonb) r`, [JSON.stringify({ location_id: loc, lines, payments, ...extra })]),
  );
  return r.rows[0].r as { sale_id: string };
}

/** Mueve la venta al día de prueba (las ventas nacen con now()). */
async function moveSale(saleId: string, iso: string) {
  await superQuery(`update public.sales set created_at = $2 where id = $1`, [saleId, iso]);
}

describe("Permisos de los reportes", () => {
  it("reportes financieros solo para owner/admin; ocupación para todo el personal; anon sin acceso", async () => {
    for (const fn of ["report_sales_daily", "report_top_items", "report_staff_productivity"]) {
      await expect(as(reception, (c) => c.query(`select * from public.${fn}($1, $2, $2)`, [loc, DAY]))).rejects.toThrow("FORBIDDEN");
      await expect(as(ana, (c) => c.query(`select * from public.${fn}($1, $2, $2)`, [loc, DAY]))).rejects.toThrow("FORBIDDEN");
      await expect(as("anon", (c) => c.query(`select * from public.${fn}($1, $2, $2)`, [loc, DAY]))).rejects.toThrow(/permission denied/);
    }
    await expect(as(ana, (c) => c.query(`select public.report_booking_kpis($1, $2, $2)`, [loc, DAY]))).rejects.toThrow("FORBIDDEN");
    const kpis = await as(reception, (c) => c.query(`select public.report_booking_kpis($1, $2, $2) r`, [loc, DAY]));
    expect(kpis.rows[0].r.appointments_total).toBe(0);
    const occ = await as(ana, (c) => c.query(`select * from public.report_occupancy($1, $2, $2)`, [loc, DAY]));
    expect(occ.rows.length).toBeGreaterThan(0);
    await expect(as("anon", (c) => c.query(`select * from public.report_occupancy($1, $2, $2)`, [loc, DAY]))).rejects.toThrow(/permission denied/);
  });

  it("rechaza periodos inválidos", async () => {
    await expect(as(owner, (c) => c.query(`select * from public.report_sales_daily($1, '2030-02-01', '2030-01-01')`, [loc]))).rejects.toThrow(
      "INVALID_RANGE",
    );
    await expect(as(owner, (c) => c.query(`select * from public.report_sales_daily($1, '2028-01-01', '2030-01-01')`, [loc]))).rejects.toThrow(
      "INVALID_RANGE",
    );
  });
});

describe("Ventas por día, método y artículos", () => {
  it("agrupa por día local y método; artículos netos de devoluciones", async () => {
    const a = await checkout(
      [
        { kind: "service", service_id: IDS.install, staff_id: IDS.ana },
        { kind: "product", variant_id: IDS.hairVariant, quantity: 1 },
      ],
      [
        { method: "cash", amount_cents: 200000, tip_cents: 5000, tip_staff_id: IDS.ana },
        { method: "card", amount_cents: 420000 },
      ],
    );
    // 23:30 hora local del sábado = domingo en UTC: debe contar el sábado.
    await moveSale(a.sale_id, `${DAY}T23:30:00-06:00`);
    const days = (await as(owner, (c) => c.query(`select * from public.report_sales_daily($1, $2, ($2::date + 1))`, [loc, DAY]))).rows;
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ sales_count: "1", total_cents: "620000", tips_cents: "5000", cash_cents: "200000", card_cents: "420000" });
    expect(days[1]).toMatchObject({ sales_count: "0", total_cents: "0" });

    const top = (await as(owner, (c) => c.query(`select * from public.report_top_items($1, $2, $2)`, [loc, DAY]))).rows;
    expect(top.map((t) => [t.kind, t.name, Number(t.net_cents)])).toEqual([
      ["service", "Instalación de extensiones", 500000],
      ["product", "Cinta 55 cm tono 6", 120000],
    ]);

    // Propinas: la estilista solo ve las suyas; recepción (sin propinas propias) no ve nada.
    const mine = (await as(ana, (c) => c.query(`select * from public.report_tips_by_staff($1, $2, $2)`, [loc, DAY]))).rows;
    expect(mine).toEqual([{ staff_id: IDS.ana, tips_cents: "5000" }]);
    const rec = (await as(reception, (c) => c.query(`select * from public.report_tips_by_staff($1, $2, $2)`, [loc, DAY]))).rows;
    expect(rec).toEqual([]);
  });
});

describe("Ocupación y productividad", () => {
  it("ocupación = minutos reservados / (turno − ausencias y bloqueos)", async () => {
    // Turno 10:00–19:00 = 540 min. Instalación 120 min + 20 de limpieza (no ocupa a la estilista).
    const appt = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    await as(reception, (c) => c.query(`select public.block_time($1, $2, 'comida', $3)`, [at("14:00"), at("15:00"), IDS.ana]));
    await as(ana, (c) => c.query(`select public.complete_appointment($1)`, [appt]));
    await checkout([{ kind: "service", service_id: IDS.install, staff_id: IDS.ana }], [{ method: "cash", amount_cents: 500000 }]).then(
      (s) => moveSale(s.sale_id, at("13:30")),
    );

    const occ = (await as(ana, (c) => c.query(`select * from public.report_occupancy($1, $2, $2) where staff_id = $3`, [loc, DAY, IDS.ana]))).rows[0];
    expect(occ).toMatchObject({ scheduled_minutes: "540", unavailable_minutes: "60", booked_minutes: "120" });

    const prod = (await as(owner, (c) => c.query(`select * from public.report_staff_productivity($1, $2, $2)`, [loc, DAY]))).rows;
    const anaRow = prod.find((p) => p.staff_id === IDS.ana)!;
    expect(anaRow).toMatchObject({ completed_appointments: "1", services_count: "1", services_revenue_cents: "500000", booked_minutes: "120" });
    const bea = prod.find((p) => p.staff_id === IDS.bea)!;
    expect(bea).toMatchObject({ completed_appointments: "0", booked_minutes: "0", scheduled_minutes: "540" });
  });

  it("días festivos cerrados no suman turno", async () => {
    await superQuery(`insert into public.special_days (location_id, day, is_closed) values ($1, $2, true)`, [loc, DAY]);
    const occ = (await as(owner, (c) => c.query(`select * from public.report_occupancy($1, $2, $2) where staff_id = $3`, [loc, DAY, IDS.ana]))).rows[0];
    expect(occ.scheduled_minutes).toBe("0");
  });
});

describe("Cancelaciones, no-show y clientas nuevas", () => {
  it("calcula tasas y distingue clientas nuevas de recurrentes", async () => {
    // Clienta B ya había comprado antes del periodo → recurrente.
    const prev = await checkout([{ kind: "product", variant_id: IDS.adhesiveVariant, quantity: 1, unit_price_cents: 10000 }], [{ method: "cash", amount_cents: 10000 }], {
      client_id: IDS.clientB,
    });
    await moveSale(prev.sale_id, "2029-12-01T12:00:00-06:00");

    // Bea necesita su propia estación.
    await superQuery(
      `insert into public.resources (id, resource_type_id, location_id, name) values ('60000000-0000-0000-0000-000000000002', $1, $2, 'Estación 2')`,
      [IDS.estacionType, loc],
    );
    const a1 = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "10:00")));
    const b1 = await as(reception, (c) =>
      createAppointment(c, IDS.clientB, installItem(IDS.bea, "10:00", { resource_ids: ["60000000-0000-0000-0000-000000000002"] })),
    );
    const a3 = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "14:00")));
    const a4 = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "16:30")));

    await as(ana, (c) => c.query(`select public.complete_appointment($1)`, [a1]));
    await as(reception, (c) => c.query(`select public.complete_appointment($1)`, [b1]));
    await as(reception, (c) => c.query(`select public.set_attendance($1, 'no_show')`, [a3]));
    await as(reception, (c) => c.query(`select public.cancel_appointment($1, 'clienta')`, [a4]));

    const k = (await as(owner, (c) => c.query(`select public.report_booking_kpis($1, $2, $2) r`, [loc, DAY]))).rows[0].r;
    expect(k).toMatchObject({ appointments_total: 4, cancelled: 1, completed: 2, no_show: 1 });
    expect(Number(k.cancellation_rate_pct)).toBe(25);
    expect(Number(k.no_show_rate_pct)).toBe(33.3);
    expect(k.clients_new).toBe(1); // Clienta A
    expect(k.clients_returning).toBe(1); // Clienta B
  });
});
