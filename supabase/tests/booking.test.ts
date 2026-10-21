import { beforeEach, describe, expect, it } from "vitest";
import {
  IDS, as, at, ana, createAppointment, installItem, owner, pool, reception, resetFixtures, setIdentity, stock, superQuery,
} from "./helpers";

beforeEach(resetFixtures);

describe("Agenda y capacidad", () => {
  it("Escenario 1: dos clientas reservan simultáneamente el último horario → solo una gana", async () => {
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query("begin");
      await c2.query("begin");
      await setIdentity(c1, reception);
      await setIdentity(c2, reception);
      // Misma estación (único recurso) a la misma hora con distintas estilistas.
      await createAppointment(c1, IDS.clientA, installItem(IDS.ana, "12:00"));
      // La segunda queda bloqueada esperando a la primera transacción.
      const second = createAppointment(c2, IDS.clientB, installItem(IDS.bea, "12:00")).then(
        () => "ok",
        (e: Error) => e.message,
      );
      await new Promise((r) => setTimeout(r, 300));
      await c1.query("commit");
      expect(await second).toBe("SLOT_TAKEN");
      await c2.query("rollback");
    } finally {
      c1.release();
      c2.release();
    }
    const rows = await superQuery(`select count(*)::int as n from public.appointments where booking_status = 'confirmed'`);
    expect(rows[0].n).toBe(1);
  });

  it("la limpieza de 20 min bloquea la estación: termina 15:00 → disponible 15:20", async () => {
    await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "13:00")));
    await expect(as(reception, (c) => createAppointment(c, IDS.clientB, installItem(IDS.bea, "15:10")))).rejects.toThrow("SLOT_TAKEN");
    await expect(as(reception, (c) => createAppointment(c, IDS.clientB, installItem(IDS.bea, "15:20")))).resolves.toBeTruthy();
  });

  it("idempotencia: la misma llave no duplica la cita", async () => {
    const a = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "10:00"), { key: "k-1" }));
    const b = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "10:00"), { key: "k-1" }));
    expect(b).toBe(a);
  });

  it("Escenario 14: no se puede agendar fuera de horario, en festivo, ni fuera del turno", async () => {
    await expect(as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "17:30")))).rejects.toThrow(
      "OUTSIDE_BUSINESS_HOURS",
    );
    await expect(as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "08:00")))).rejects.toThrow(
      "OUTSIDE_BUSINESS_HOURS",
    );
    await superQuery(`update public.staff_schedules set ends_at = '14:00' where staff_id = $1`, [IDS.ana]);
    await expect(as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "13:00")))).rejects.toThrow(
      "STAFF_NOT_WORKING",
    );
    await superQuery(`insert into public.special_days (location_id, day, label) values ($1, $2, 'Festivo')`, [IDS.location, "2030-01-05"]);
    await expect(as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.bea, "11:00")))).rejects.toThrow(
      "OUTSIDE_BUSINESS_HOURS",
    );
  });

  it("estilista no capacitada no puede tomar el servicio", async () => {
    await expect(as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.carla, "11:00")))).rejects.toThrow(
      "STAFF_NOT_QUALIFIED",
    );
  });

  it("Escenario 3: cancelar una cita libera agenda y material reservado", async () => {
    const id = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00", { materials: [{ variant_id: IDS.hairVariant, quantity: 1 }] })));
    expect(await stock(IDS.hairVariant)).toEqual({ onHand: 1, reserved: 1 });
    expect(await stock(IDS.adhesiveVariant)).toEqual({ onHand: 10, reserved: 1 });
    const r = await as(reception, (c) => c.query(`select public.cancel_appointment($1, 'Clienta canceló') as r`, [id]));
    expect(r.rows[0].r.status).toBe("cancelled");
    expect(r.rows[0].r.late_cancellation).toBe(false);
    expect(await stock(IDS.hairVariant)).toEqual({ onHand: 1, reserved: 0 });
    expect(await stock(IDS.adhesiveVariant)).toEqual({ onHand: 10, reserved: 0 });
    // El horario queda libre.
    await expect(as(reception, (c) => createAppointment(c, IDS.clientB, installItem(IDS.bea, "11:00")))).resolves.toBeTruthy();
  });

  it("Escenario 4: cambiar de estilista valida capacitación y disponibilidad", async () => {
    const id = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    const [line] = await superQuery(`select id from public.appointment_services where appointment_id = $1`, [id]);
    await expect(as(reception, (c) => c.query(`select public.reassign_appointment_service($1, $2)`, [line.id, IDS.carla]))).rejects.toThrow(
      "STAFF_NOT_QUALIFIED",
    );
    // Bea ocupada a esa hora por un bloqueo manual → no se puede.
    await as(reception, (c) => c.query(`select public.block_time($1, $2, 'Capacitación', $3)`, [at("12:00"), at("12:30"), IDS.bea]));
    await expect(as(reception, (c) => c.query(`select public.reassign_appointment_service($1, $2)`, [line.id, IDS.bea]))).rejects.toThrow("SLOT_TAKEN");
    await superQuery(`delete from public.appointment_allocations where kind = 'block'`);
    await as(reception, (c) => c.query(`select public.reassign_appointment_service($1, $2)`, [line.id, IDS.bea]));
    const [after] = await superQuery(`select staff_id from public.appointment_services where id = $1`, [line.id]);
    expect(after.staff_id).toBe(IDS.bea);
    // Ana queda libre a esa hora (con otra estación ocupada no aplicaría; aquí se valida solo la persona).
    const [alloc] = await superQuery(`select count(*)::int as n from public.v_busy_allocations where staff_id = $1`, [IDS.ana]);
    expect(alloc.n).toBe(0);
  });

  it("Escenario 5: vacaciones: con citas en el periodo no se aprueban; tras reasignar sí, y bloquean la agenda", async () => {
    const id = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    const toId = await as(ana, async (c) =>
      (await c.query(`select public.request_time_off('vacation', $1, $2, 'Vacaciones') as id`, ["2030-01-05T00:00:00-06:00", "2030-01-07T00:00:00-06:00"])).rows[0].id,
    );
    // La estilista no puede aprobarse a sí misma.
    await expect(as(ana, (c) => c.query(`select public.decide_time_off($1, true)`, [toId]))).rejects.toThrow("FORBIDDEN");
    const res = await as(owner, (c) => c.query(`select public.decide_time_off($1, true) as r`, [toId]));
    expect(res.rows[0].r.status).toBe("conflicts");
    expect(res.rows[0].r.conflicts[0].appointment_id).toBe(id);
    const [line] = await superQuery(`select id from public.appointment_services where appointment_id = $1`, [id]);
    await as(reception, (c) => c.query(`select public.reassign_appointment_service($1, $2)`, [line.id, IDS.bea]));
    const ok = await as(owner, (c) => c.query(`select public.decide_time_off($1, true) as r`, [toId]));
    expect(ok.rows[0].r.status).toBe("approved");
    await expect(
      as(reception, (c) => createAppointment(c, IDS.clientB, [{ service_id: IDS.install, staff_id: IDS.ana, resource_ids: [IDS.est1], starts_at: at("15:00") }])),
    ).rejects.toThrow("SLOT_TAKEN");
  });

  it("Escenario 15: pago confirmado tras expirar el apartado", async () => {
    // Caso A: el horario sigue libre → se recupera y confirma.
    const a = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "10:00"), { holdMinutes: 15 }));
    await superQuery(`update public.appointments set hold_expires_at = now() - interval '1 minute' where id = $1`, [a]);
    const ra = await as(reception, (c) =>
      c.query(`select public.record_appointment_deposit($1, 100000, 'online', 'mercadopago', 'pay-A') as r`, [a]),
    );
    expect(ra.rows[0].r.status).toBe("received");
    expect(ra.rows[0].r.appointment_status).toBe("confirmed");

    // Caso B: expira, otra clienta toma el horario, luego llega el pago → requiere reembolso + alerta.
    const b = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "14:00"), { holdMinutes: 15 }));
    await superQuery(`update public.appointments set hold_expires_at = now() - interval '1 minute' where id = $1`, [b]);
    await as(reception, (c) => createAppointment(c, IDS.clientB, installItem(IDS.bea, "14:00")));
    const rb = await as(reception, (c) =>
      c.query(`select public.record_appointment_deposit($1, 100000, 'online', 'mercadopago', 'pay-B') as r`, [b]),
    );
    expect(rb.rows[0].r.status).toBe("needs_refund");
    expect(rb.rows[0].r.appointment_status).toBe("expired");
    const alerts = await superQuery(`select kind from public.ops_alerts where reference_id = $1`, [b]);
    expect(alerts.map((x) => x.kind)).toContain("payment_after_expiry");

    // Webhook repetido del mismo pago: no duplica el anticipo.
    const dup = await as(reception, (c) =>
      c.query(`select public.record_appointment_deposit($1, 100000, 'online', 'mercadopago', 'pay-B') as r`, [b]),
    );
    expect(dup.rows[0].r.duplicate).toBe(true);
    const [n] = await superQuery(`select count(*)::int as n from public.appointment_deposits where provider_ref = 'pay-B'`);
    expect(n.n).toBe(1);
  });

  it("al completar la cita se consume el material real y se programa mantenimiento", async () => {
    const id = await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00", { materials: [{ variant_id: IDS.hairVariant, quantity: 1 }] })));
    const reservations = await superQuery(`select id, variant_id from public.stock_reservations where appointment_id = $1`, [id]);
    const adhesive = reservations.find((r) => r.variant_id === IDS.adhesiveVariant)!;
    await as(ana, (c) => c.query(`select public.set_attendance($1, 'in_service')`, [id]));
    // Se usaron 2 adhesivos (1 reservado + 1 extra).
    await as(ana, (c) =>
      c.query(`select public.complete_appointment($1, $2::jsonb)`, [id, JSON.stringify([{ reservation_id: adhesive.id, actual_qty: 2 }])]),
    );
    expect(await stock(IDS.adhesiveVariant)).toEqual({ onHand: 8, reserved: 0 });
    expect(await stock(IDS.hairVariant)).toEqual({ onHand: 0, reserved: 0 });
    const [m] = await superQuery(`select due_date::text from public.maintenance_reminders where appointment_id = $1`, [id]);
    expect(m.due_date).toBe("2030-02-16");
  });
});
