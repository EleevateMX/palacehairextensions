import { beforeEach, describe, expect, it } from "vitest";
import { IDS, ana, as, at, createAppointment, installItem, owner, reception, resetFixtures, superQuery } from "./helpers";

beforeEach(resetFixtures);

const hours = (rows: [number, string, string][]) => JSON.stringify(rows.map(([weekday, starts, ends]) => ({ weekday, starts, ends })));

describe("Horario del negocio (replace_business_hours)", () => {
  it("reemplaza el horario semanal con varios rangos por día", async () => {
    const n = await as(owner, (c) =>
      c.query(`select public.replace_business_hours($1, $2::jsonb) n`, [IDS.location, hours([[1, "10:00", "14:00"], [1, "15:00", "19:00"], [6, "09:00", "13:00"]])]),
    );
    expect(n.rows[0].n).toBe(3);
    const rows = await superQuery(`select weekday, opens_at::text o, closes_at::text c from public.business_hours where location_id = $1 order by 1, 2`, [IDS.location]);
    expect(rows).toEqual([
      { weekday: 1, o: "10:00:00", c: "14:00:00" },
      { weekday: 1, o: "15:00:00", c: "19:00:00" },
      { weekday: 6, o: "09:00:00", c: "13:00:00" },
    ]);
  });

  it("rechaza traslapes y rangos invertidos sin borrar el horario vigente", async () => {
    await expect(
      as(owner, (c) => c.query(`select public.replace_business_hours($1, $2::jsonb)`, [IDS.location, hours([[2, "10:00", "14:00"], [2, "13:00", "18:00"]])])),
    ).rejects.toThrow("OVERLAPPING_RANGES");
    await expect(
      as(owner, (c) => c.query(`select public.replace_business_hours($1, $2::jsonb)`, [IDS.location, hours([[2, "18:00", "10:00"]])])),
    ).rejects.toThrow("INVALID_RANGE");
    await expect(
      as(owner, (c) => c.query(`select public.replace_business_hours($1, $2::jsonb)`, [IDS.location, hours([[7, "10:00", "11:00"]])])),
    ).rejects.toThrow("INVALID_WEEKDAY");
    const [{ n }] = await superQuery(`select count(*)::int n from public.business_hours where location_id = $1`, [IDS.location]);
    expect(n).toBe(7);
  });

  it("solo owner/admin; anon no puede ejecutarla", async () => {
    await expect(
      as(reception, (c) => c.query(`select public.replace_business_hours($1, '[]'::jsonb)`, [IDS.location])),
    ).rejects.toThrow("FORBIDDEN");
    await expect(as("anon", (c) => c.query(`select public.replace_business_hours($1, '[]'::jsonb)`, [IDS.location]))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("Turnos del personal (replace_staff_schedule)", () => {
  it("permite turnos partidos y la agenda respeta el descanso", async () => {
    await as(owner, (c) =>
      c.query(`select public.replace_staff_schedule($1, $2, $3::jsonb)`, [IDS.ana, IDS.location, hours([[6, "10:00", "13:00"], [6, "15:00", "19:00"]])]),
    );
    const rows = await superQuery(`select weekday, starts_at::text s from public.staff_schedules where staff_id = $1 order by 1, 2`, [IDS.ana]);
    expect(rows).toEqual([
      { weekday: 6, s: "10:00:00" },
      { weekday: 6, s: "15:00:00" },
    ]);
    // 2030-01-05 es sábado: 12:00–14:00 cae en el descanso → la BD rechaza la cita.
    await expect(as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "12:00")))).rejects.toThrow("STAFF_NOT_WORKING");
    const id = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "15:00")));
    expect(id).toBeTruthy();
  });

  it("recepción y estilistas no pueden cambiar turnos", async () => {
    await expect(
      as(ana, (c) => c.query(`select public.replace_staff_schedule($1, $2, '[]'::jsonb)`, [IDS.ana, IDS.location])),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      as(reception, (c) => c.query(`select public.replace_staff_schedule($1, $2, '[]'::jsonb)`, [IDS.ana, IDS.location])),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("Cancelación de ausencias (cancel_time_off)", () => {
  async function request(who: { userId: string }, staff?: string) {
    const r = await as(who, (c) =>
      c.query(`select public.request_time_off('vacation', $1, $2, 'Viaje', $3) id`, [at("10:00"), at("19:00"), staff ?? null]),
    );
    return r.rows[0].id as string;
  }

  it("la estilista cancela su solicitud pendiente, pero no la de otra persona", async () => {
    const mine = await request(ana);
    const other = await request(owner, IDS.bea);
    await expect(as(ana, (c) => c.query(`select public.cancel_time_off($1)`, [other]))).rejects.toThrow("FORBIDDEN");
    await as(ana, (c) => c.query(`select public.cancel_time_off($1)`, [mine]));
    const [{ status }] = await superQuery(`select status from public.staff_time_off where id = $1`, [mine]);
    expect(status).toBe("cancelled");
    await expect(as(ana, (c) => c.query(`select public.cancel_time_off($1)`, [mine]))).rejects.toThrow("TIME_OFF_NOT_PENDING");
  });

  it("owner cancela una ausencia aprobada y libera la agenda", async () => {
    const id = await request(ana);
    const decided = await as(owner, (c) => c.query(`select public.decide_time_off($1, true) r`, [id]));
    expect(decided.rows[0].r.status).toBe("approved");
    await expect(as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")))).rejects.toThrow("SLOT_TAKEN");
    await expect(as(ana, (c) => c.query(`select public.cancel_time_off($1)`, [id]))).rejects.toThrow("TIME_OFF_NOT_PENDING");
    await as(owner, (c) => c.query(`select public.cancel_time_off($1)`, [id]));
    const appt = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    expect(appt).toBeTruthy();
  });

  it("aprobar con citas en el periodo devuelve los conflictos y deja la solicitud pendiente", async () => {
    const appt = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    const id = await request(ana);
    const r = await as(owner, (c) => c.query(`select public.decide_time_off($1, true) r`, [id]));
    expect(r.rows[0].r.status).toBe("conflicts");
    expect(r.rows[0].r.conflicts.map((x: { appointment_id: string }) => x.appointment_id)).toContain(appt);
    const [{ status }] = await superQuery(`select status from public.staff_time_off where id = $1`, [id]);
    expect(status).toBe("requested");
  });
});

describe("Configuración por RLS (escrituras directas)", () => {
  it("owner edita servicios, recursos y personal capacitado; recepción no", async () => {
    await as(owner, (c) => c.query(`update public.services set price_cents = 550000 where id = $1`, [IDS.install]));
    const upd = await as(reception, (c) => c.query(`update public.services set price_cents = 1 where id = $1`, [IDS.install]));
    expect(upd.rowCount).toBe(0);
    await expect(
      as(reception, (c) => c.query(`insert into public.resources (resource_type_id, location_id, name) values ($1, $2, 'X')`, [IDS.estacionType, IDS.location])),
    ).rejects.toThrow(/row-level security/);
    await as(owner, (c) =>
      c.query(`insert into public.staff_services (staff_id, service_id, duration_min, price_cents) values ($1, $2, 150, 600000)`, [IDS.carla, IDS.install]),
    );
    await expect(
      as(reception, (c) => c.query(`delete from public.staff_services where staff_id = $1 returning 1`, [IDS.carla])).then((r) => r.rowCount),
    ).resolves.toBe(0);
    const [{ price_cents }] = await superQuery(`select price_cents from public.services where id = $1`, [IDS.install]);
    expect(price_cents).toBe(550000);
  });

  it("los costos configurados de servicio no son visibles para recepción", async () => {
    await as(owner, (c) => c.query(`insert into public.service_cost_items (service_id, label, amount_cents) values ($1, 'Mano de obra', 80000)`, [IDS.install]));
    const r = await as(reception, (c) => c.query(`select * from public.service_cost_items`));
    expect(r.rowCount).toBe(0);
  });
});
