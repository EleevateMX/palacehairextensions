import { beforeEach, describe, expect, it } from "vitest";
import { IDS, as, ana, createAppointment, installItem, owner, reception, resetFixtures, superQuery } from "./helpers";

beforeEach(resetFixtures);

const adminUser = "20000000-0000-0000-0000-0000000000a1";
async function makeAdmin() {
  await superQuery(`insert into auth.users (id, email) values ($1, 'admin@palace.test')`, [adminUser]);
  await superQuery(
    `insert into public.staff_members (id, user_id, location_id, display_name, role) values ('30000000-0000-0000-0000-0000000000a1', $1, $2, 'Admin', 'admin')`,
    [adminUser, IDS.location],
  );
  return { userId: adminUser };
}

describe("Endurecimiento de roles", () => {
  it("administración no puede crear propietarias ni ascenderse; la propietaria sí", async () => {
    const admin = await makeAdmin();
    await expect(
      as(admin, (c) => c.query(`update public.staff_members set role = 'owner' where id = '30000000-0000-0000-0000-0000000000a1'`)),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      as(admin, (c) => c.query(`insert into public.staff_members (display_name, role) values ('X', 'owner')`)),
    ).rejects.toThrow("FORBIDDEN");
    await expect(as(admin, (c) => c.query(`update public.staff_members set display_name = 'Y' where id = $1`, [IDS.owner]))).rejects.toThrow(
      "FORBIDDEN",
    );
    await as(owner, (c) => c.query(`update public.staff_members set role = 'owner' where id = '30000000-0000-0000-0000-0000000000a1'`));
  });

  it("recepción no puede modificar personal", async () => {
    const r = await as(reception, (c) => c.query(`update public.staff_members set display_name = 'Z' where id = $1`, [IDS.ana]));
    expect(r.rowCount).toBe(0);
  });
});

describe("Reglas de comisión y gastos", () => {
  it("solo owner/admin administran reglas; cada estilista ve las suyas", async () => {
    await as(owner, (c) =>
      c.query(`insert into public.commission_rules (staff_id, rule) values ($1, '{"kind":"percent_service","bps":1000}'), ($2, '{"kind":"percent_service","bps":800}')`, [
        IDS.ana,
        IDS.bea,
      ]),
    );
    await expect(
      as(reception, (c) => c.query(`insert into public.commission_rules (staff_id, rule) values ($1, '{"kind":"percent_service","bps":5000}')`, [IDS.ana])),
    ).rejects.toThrow(/row-level security/);
    const mine = await as(ana, (c) => c.query(`select staff_id from public.commission_rules`));
    expect(mine.rows.map((r) => r.staff_id)).toEqual([IDS.ana]);
    await expect(
      superQuery(`insert into public.commission_rules (staff_id, rule) values ($1, '{"kind":"inventada"}')`, [IDS.ana]),
    ).rejects.toThrow(/check/);
  });

  it("gastos visibles solo para owner/admin", async () => {
    await as(owner, (c) =>
      c.query(`insert into public.expenses (location_id, expense_date, category, kind, amount_cents) values ($1, '2030-01-05', 'renta', 'fixed', 1500000)`, [
        IDS.location,
      ]),
    );
    const r = await as(reception, (c) => c.query(`select * from public.expenses`));
    expect(r.rows).toHaveLength(0);
  });
});

describe("Corte de caja con desglose", () => {
  it("el desglose debe sumar lo contado", async () => {
    const id = await as(reception, async (c) => (await c.query(`select public.open_cash_session($1, 50000) as id`, [IDS.location])).rows[0].id);
    await expect(
      as(reception, (c) => c.query(`select public.close_cash_session($1, 60000, null, '{"50000": 1}'::jsonb)`, [id])),
    ).rejects.toThrow("BREAKDOWN_MISMATCH");
    const r = await as(reception, (c) => c.query(`select public.close_cash_session($1, 60000, 'ok', '{"50000": 1, "10000": 1}'::jsonb) as r`, [id]));
    expect(r.rows[0].r.difference_cents).toBe(10000);
    const [s] = await superQuery(`select counted_breakdown from public.cash_sessions where id = $1`, [id]);
    expect(s.counted_breakdown).toEqual({ "50000": 1, "10000": 1 });
  });
});

describe("Finanzas", () => {
  it("resumen: ventas, CMV con costo histórico, materiales de servicio, gastos y utilidad", async () => {
    // Venta de un producto (costo 60,000; precio 120,000) y un servicio.
    await as(owner, (c) =>
      c.query(`select public.pos_checkout($1::jsonb)`, [
        JSON.stringify({
          location_id: IDS.location,
          lines: [
            { kind: "product", variant_id: IDS.hairVariant, quantity: 1 },
            { kind: "service", service_id: IDS.install, staff_id: IDS.ana },
          ],
          payments: [{ method: "cash", amount_cents: 620000 }],
        }),
      ]),
    );
    // Cita completada que consume 1 adhesivo (costo 5,000).
    const appt = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    await as(ana, (c) => c.query(`select public.complete_appointment($1)`, [appt]));
    await as(owner, (c) =>
      c.query(`insert into public.expenses (location_id, expense_date, category, kind, amount_cents) values ($1, current_date, 'renta', 'fixed', 100000)`, [
        IDS.location,
      ]),
    );
    const today = (await superQuery(`select (now() at time zone 'America/Mexico_City')::date::text d`))[0].d;
    const r = (await as(owner, (c) => c.query(`select public.finance_summary($1, $2, $2) r`, [IDS.location, today]))).rows[0].r;
    expect(r.total_sales_cents).toBe(620000);
    expect(r.cogs_products_cents).toBe(60000);
    expect(r.service_materials_cents).toBe(5000);
    expect(r.expenses_fixed_cents).toBe(100000);
    expect(r.gross_profit_cents).toBe(620000 - 60000 - 5000);
    expect(r.operating_profit_cents).toBe(620000 - 60000 - 5000 - 100000);
    expect(r.payments_by_method).toEqual({ cash: 620000 });
    await expect(as(reception, (c) => c.query(`select public.finance_summary($1, $2, $2)`, [IDS.location, today]))).rejects.toThrow("FORBIDDEN");
  });

  it("rentabilidad por servicio incluye materiales consumidos y costos configurados", async () => {
    await superQuery(`insert into public.service_cost_items (service_id, label, amount_cents) values ($1, 'Mano de obra', 80000)`, [IDS.install]);
    const appt = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    await as(ana, (c) => c.query(`select public.complete_appointment($1)`, [appt]));
    const rows = (await as(owner, (c) => c.query(`select * from public.service_profitability($1, '2030-01-01', '2030-01-31')`, [IDS.location]))).rows;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].services_count)).toBe(1);
    expect(Number(rows[0].revenue_cents)).toBe(500000);
    expect(Number(rows[0].materials_cents)).toBe(5000);
    expect(Number(rows[0].configured_costs_cents)).toBe(80000);
  });
});

describe("Portal público", () => {
  const base = {
    location_id: IDS.location,
    first_name: "Nueva",
    phone: "+525511112222",
    accept_privacy: true,
    accept_reminders: true,
    privacy_notice_version: "2026-10",
    items: [{ service_id: IDS.install, staff_id: IDS.ana, resource_ids: [IDS.est1], starts_at: "2030-01-05T11:00:00-06:00" }],
  };

  it("solo el servidor puede reservar; exige aviso de privacidad y teléfono válido", async () => {
    await expect(as(reception, (c) => c.query(`select public.portal_book($1::jsonb)`, [JSON.stringify(base)]))).rejects.toThrow("FORBIDDEN");
    await expect(
      as("service_role", (c) => c.query(`select public.portal_book($1::jsonb)`, [JSON.stringify({ ...base, accept_privacy: false })])),
    ).rejects.toThrow("PRIVACY_REQUIRED");
    await expect(
      as("service_role", (c) => c.query(`select public.portal_book($1::jsonb)`, [JSON.stringify({ ...base, phone: "5512" })])),
    ).rejects.toThrow("INVALID_PHONE");
  });

  it("servicio con anticipo queda como apartado y registra consentimientos", async () => {
    const r = (await as("service_role", (c) => c.query(`select public.portal_book($1::jsonb) r`, [JSON.stringify({ ...base, idempotency_key: "web-1" })]))).rows[0].r;
    expect(r.status).toBe("hold");
    expect(r.deposit_cents).toBe(100000);
    const consents = await superQuery(`select purpose, granted from public.client_consents where client_id = $1 order by purpose`, [r.client_id]);
    expect(consents).toEqual([
      { purpose: "privacy_notice", granted: true },
      { purpose: "appointment_reminders", granted: true },
    ]);
    // Reintento: misma llave, misma cita; la clienta existente se reutiliza por teléfono.
    const again = (await as("service_role", (c) => c.query(`select public.portal_book($1::jsonb) r`, [JSON.stringify({ ...base, idempotency_key: "web-1" })]))).rows[0].r;
    expect(again.appointment_id).toBe(r.appointment_id);
    expect(again.client_id).toBe(r.client_id);
  });

  it("rechaza servicios no reservables en línea", async () => {
    await superQuery(`update public.services set online_bookable = false where id = $1`, [IDS.install]);
    await expect(as("service_role", (c) => c.query(`select public.portal_book($1::jsonb)`, [JSON.stringify(base)]))).rejects.toThrow(
      "SERVICE_NOT_BOOKABLE_ONLINE",
    );
  });
});
