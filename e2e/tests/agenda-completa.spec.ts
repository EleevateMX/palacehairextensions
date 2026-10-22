import { expect, type Page, test } from "@playwright/test";
import { choose, db, login, USERS } from "./helpers";

// Pruebas de la agenda completa contra el stack local. Cada prueba usa su propio día hábil
// (a 10+ días) y lo limpia antes de empezar, así se pueden repetir sin chocar entre sí.

const LOCATION = "00000000-0000-4000-8000-000000000001";
const HAIR_TONE_4 = "00000000-0000-4000-8000-000000000411";
const TAPE = "00000000-0000-4000-8000-000000000421";
const SVC_INSTALL = "Instalación de extensiones de cinta";
const SVC_MAINT = "Mantenimiento de cinta";
const SVC_WASH = "Lavado y peinado";

/** Días hábiles (lun–sáb) distintos a partir de `from` días. */
function workdays(n: number, from = 10): string[] {
  const out: string[] = [];
  const d = new Date(Date.now() + from * 86_400_000);
  while (out.length < n) {
    if (d.getUTCDay() !== 0) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const DAYS = workdays(10);

/** Cancela citas, libera materiales y quita ocupaciones del día (solo BD local de pruebas). */
async function resetDay(date: string) {
  const range = `tstzrange(($1::date)::timestamp at time zone 'America/Mexico_City', ($1::date + 1)::timestamp at time zone 'America/Mexico_City')`;
  await db.query(
    `select app.release_reservation_internal(r.id, 'released') from stock_reservations r
       join appointments a on a.id = r.appointment_id
      where r.status = 'active' and (a.starts_at at time zone 'America/Mexico_City')::date = $1`,
    [date],
  );
  await db.query(`update appointment_allocations set active = false where active and occupied && ${range}`, [date]);
  await db.query(
    `update appointments set booking_status = 'cancelled', cancel_reason = 'e2e-reset'
      where booking_status in ('hold', 'confirmed') and (starts_at at time zone 'America/Mexico_City')::date = $1`,
    [date],
  );
}

/** Garantiza existencias disponibles suficientes para las pruebas. */
async function topUp(variant: string, min = 30) {
  const { rows } = await db.query(`select coalesce(on_hand - reserved, 0)::numeric avail from stock_levels where variant_id = $1 and location_id = $2`, [variant, LOCATION]);
  const missing = min - Number(rows[0]?.avail ?? 0);
  if (missing > 0) await db.query(`select app.apply_movement($1, $2, 'purchase', $3)`, [variant, LOCATION, missing]);
}

async function stockOf(variant: string) {
  const { rows } = await db.query(`select on_hand::numeric on_hand, reserved::numeric reserved from stock_levels where variant_id = $1 and location_id = $2`, [variant, LOCATION]);
  return { onHand: Number(rows[0].on_hand), reserved: Number(rows[0].reserved) };
}

async function book(page: Page, o: { date: string; services: string[]; client?: string; staff?: string; tone?: string }): Promise<string> {
  await page.goto(`/agenda/nueva?date=${o.date}`);
  await choose(page, "Clienta", o.client ?? "Demo Uno");
  await choose(page, "Servicio", o.services[0]!);
  if (o.services[1]) await choose(page, "Seguido de", o.services[1]);
  if (o.staff) await choose(page, "Especialista", o.staff);
  await page.getByRole("button", { name: "Buscar horarios" }).click();
  if (o.tone) await choose(page, "Tono de cabello", o.tone);
  await page.getByRole("button", { name: /^\d{2}:\d{2}/ }).first().click();
  await expect(page).toHaveURL(/creada=/);
  const id = new URL(page.url()).searchParams.get("creada");
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id!;
}

test.beforeAll(async () => {
  for (const d of DAYS) await resetDay(d);
  await topUp(HAIR_TONE_4);
  await topUp(TAPE);
});

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
});

test("agenda una visita de dos servicios consecutivos y aparece en la vista semanal", async ({ page }) => {
  const date = DAYS[0]!;
  await login(page, USERS.reception);
  const id = await book(page, { date, services: [SVC_MAINT, SVC_WASH] });

  const { rows } = await db.query(
    `select s.starts_at, s.ends_at, sv.name from appointment_services s join services sv on sv.id = s.service_id
      where s.appointment_id = $1 order by s.position`,
    [id],
  );
  expect(rows.map((r) => r.name)).toEqual([SVC_MAINT, SVC_WASH]);
  expect(new Date(rows[1].starts_at).getTime()).toBe(new Date(rows[0].ends_at).getTime());

  await page.goto(`/agenda?date=${date}&view=semana`);
  await expect(page.getByTestId("vista-semana").locator(`a[href="/agenda/cita/${id}"]`).first()).toBeVisible();
  await page.goto(`/agenda?date=${date}&view=recursos`);
  await expect(page.getByTestId("vista-recursos").locator(`a[href="/agenda/cita/${id}"]`).first()).toBeVisible();
});

test("instalación con tono elegido reserva el inventario de ese tono", async ({ page }) => {
  const date = DAYS[1]!;
  const before = await stockOf(HAIR_TONE_4);
  await login(page, USERS.reception);
  const id = await book(page, { date, services: [SVC_INSTALL], tone: "tono 4" });

  const { rows } = await db.query(`select variant_id, quantity::numeric q, status from stock_reservations where appointment_id = $1 order by quantity desc`, [id]);
  expect(rows).toContainEqual(expect.objectContaining({ variant_id: HAIR_TONE_4, status: "active" }));
  expect(Number(rows.find((r) => r.variant_id === HAIR_TONE_4).q)).toBe(3);
  expect((await stockOf(HAIR_TONE_4)).reserved).toBe(before.reserved + 3);
  const { rows: appt } = await db.query(`select materials_status, payment_status from appointments where id = $1`, [id]);
  expect(appt[0]).toEqual({ materials_status: "reserved", payment_status: "pending" });

  await page.goto(`/agenda/cita/${id}`);
  await expect(page.getByText("Material reservado")).toBeVisible();
  const materials = page.locator("section").filter({ has: page.getByRole("heading", { name: "Materiales reservados" }) });
  await expect(materials.getByText("Cinta 55 cm · tono 4")).toBeVisible();
});

test("llegó → en servicio → completar con cantidad real descuenta inventario y programa mantenimiento", async ({ page }) => {
  const date = DAYS[1]!;
  await login(page, USERS.reception);
  const id = await book(page, { date, services: [SVC_INSTALL], tone: "tono 4" });
  const before = await stockOf(HAIR_TONE_4);

  await page.goto(`/agenda/cita/${id}`);
  await page.getByRole("button", { name: "Llegó" }).click();
  await expect(page.getByLabel("Estados de la cita").getByText("Llegó")).toBeVisible();
  await page.getByRole("button", { name: "En servicio" }).click();
  await expect(page.getByLabel("Estados de la cita").getByText("En servicio")).toBeVisible();

  await page.getByLabel("Usado · Cinta 55 cm · tono 4").fill("2");
  await page.getByRole("button", { name: "Completar", exact: true }).click();
  await expect(page.getByLabel("Estados de la cita").getByText("Terminada")).toBeVisible();

  const { rows: moves } = await db.query(
    `select variant_id, quantity::numeric q from stock_movements
      where reference_type = 'appointment' and reference_id = $1 and movement_type = 'service_consumption'`,
    [id],
  );
  expect(moves.map((m) => [m.variant_id, Number(m.q)])).toEqual(expect.arrayContaining([[HAIR_TONE_4, -2], [TAPE, -1]]));
  const after = await stockOf(HAIR_TONE_4);
  expect(after.onHand).toBe(before.onHand - 2); // se usó 2 de 3 reservados
  expect(after.reserved).toBe(before.reserved - 3); // el sobrante se liberó
  const { rows: rem } = await db.query(`select technique, status from maintenance_reminders where appointment_id = $1`, [id]);
  expect(rem).toEqual([{ technique: "cinta", status: "pending" }]);
  const { rows: res } = await db.query(`select distinct status from stock_reservations where appointment_id = $1`, [id]);
  expect(res).toEqual([{ status: "consumed" }]);
});

test("cancelar una cita libera el material reservado e informa la política", async ({ page }) => {
  const date = DAYS[2]!;
  await login(page, USERS.reception);
  const before = await stockOf(HAIR_TONE_4);
  const id = await book(page, { date, services: [SVC_INSTALL], tone: "tono 4" });
  expect((await stockOf(HAIR_TONE_4)).reserved).toBe(before.reserved + 3);

  await page.goto(`/agenda/cita/${id}`);
  await page.getByLabel("Motivo de cancelación").fill("La clienta pidió cancelar");
  await page.getByRole("button", { name: "Cancelar cita" }).click();
  await expect(page.getByText(/Cita cancelada con anticipación/)).toBeVisible();

  expect((await stockOf(HAIR_TONE_4)).reserved).toBe(before.reserved);
  const { rows } = await db.query(`select booking_status, cancel_reason, materials_status from appointments where id = $1`, [id]);
  expect(rows[0]).toEqual({ booking_status: "cancelled", cancel_reason: "La clienta pidió cancelar", materials_status: "released" });
  const { rows: res } = await db.query(`select distinct status from stock_reservations where appointment_id = $1`, [id]);
  expect(res).toEqual([{ status: "released" }]);
  const { rows: al } = await db.query(`select count(*)::int n from appointment_allocations where appointment_id = $1 and active`, [id]);
  expect(al[0].n).toBe(0);
});

test("reprogramar mueve la cita a otro día conservando sus materiales", async ({ page }) => {
  const [from, to] = [DAYS[3]!, DAYS[4]!];
  await login(page, USERS.reception);
  const id = await book(page, { date: from, services: [SVC_MAINT] });

  await page.goto(`/agenda/cita/${id}`);
  await page.getByLabel("Nueva fecha").fill(to);
  await page.getByRole("button", { name: "Ver horarios" }).click();
  await page.getByRole("button", { name: /^Mover a/ }).first().click();
  await expect(page).toHaveURL(/reprogramada=1/);
  const newId = new URL(page.url()).pathname.split("/").pop()!;
  expect(newId).not.toBe(id);
  await expect(page.getByText("Cita reprogramada.")).toBeVisible();

  const { rows } = await db.query(
    `select id, booking_status, cancel_reason, rescheduled_from, (starts_at at time zone 'America/Mexico_City')::date::text d
       from appointments where id in ($1, $2)`,
    [id, newId],
  );
  const old = rows.find((r) => r.id === id);
  const neu = rows.find((r) => r.id === newId);
  expect(old).toMatchObject({ booking_status: "cancelled", cancel_reason: "rescheduled" });
  expect(neu).toMatchObject({ booking_status: "confirmed", rescheduled_from: id, d: to });
  const { rows: res } = await db.query(`select count(*)::int n from stock_reservations where appointment_id = $1 and status = 'active'`, [newId]);
  expect(res[0].n).toBe(1);
});

test("cambiar de especialista solo ofrece personal capacitado y actualiza la cita", async ({ page }) => {
  const date = DAYS[5]!;
  await login(page, USERS.reception);
  const id = await book(page, { date, services: [SVC_MAINT], staff: "Ana" });
  await page.goto(`/agenda/cita/${id}`);
  await expect(page.getByText("Especialista: Ana López")).toBeVisible();
  await choose(page, "Cambiar especialista", "Bea");
  await page.getByRole("button", { name: "Cambiar", exact: true }).click();
  await expect(page.getByText("Especialista: Bea Torres")).toBeVisible();
  const { rows } = await db.query(
    `select m.display_name from appointment_services s join staff_members m on m.id = s.staff_id where s.appointment_id = $1`,
    [id],
  );
  expect(rows).toEqual([{ display_name: "Bea Torres" }]);
  const { rows: al } = await db.query(
    `select m.display_name from appointment_allocations a join staff_members m on m.id = a.staff_id where a.appointment_id = $1 and a.active`,
    [id],
  );
  expect(al).toEqual([{ display_name: "Bea Torres" }]);
});

test("un bloqueo manual deja de ofrecer ese horario", async ({ page }) => {
  const date = DAYS[6]!;
  await login(page, USERS.reception);
  const search = async () => {
    await page.goto(`/agenda/nueva?date=${date}`);
    await choose(page, "Clienta", "Demo Uno");
    await choose(page, "Servicio", SVC_MAINT);
    await choose(page, "Especialista", "Ana");
    await page.getByRole("button", { name: "Buscar horarios" }).click();
  };
  await search();
  await expect(page.getByRole("button", { name: /^10:00/ })).toBeVisible();

  await page.goto(`/agenda/bloqueos?date=${date}`);
  await choose(page, "Bloquear a", "Ana");
  await page.getByLabel("Día").fill(date);
  await page.getByLabel("Desde").fill("10:00");
  await page.getByLabel("Hasta").fill("12:00");
  await page.getByLabel("Motivo").fill("Capacitación e2e");
  await page.getByRole("button", { name: "Crear bloqueo" }).click();
  await expect(page.getByText("Bloqueo creado")).toBeVisible();
  await expect(page.getByText("Capacitación e2e")).toBeVisible();

  await search();
  await expect(page.getByRole("button", { name: /^12:00/ })).toBeVisible();
  for (const t of ["10:00", "10:30", "11:00", "11:45"]) await expect(page.getByRole("button", { name: new RegExp(`^${t}`) })).toHaveCount(0);

  // Quitar el bloqueo vuelve a ofrecer el horario.
  await page.goto(`/agenda/bloqueos?date=${date}`);
  const row = page.getByRole("listitem").filter({ hasText: "Capacitación e2e" });
  await row.getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByText("Capacitación e2e")).toHaveCount(0);
  await search();
  await expect(page.getByRole("button", { name: /^10:00/ })).toBeVisible();
});

test("la estilista solo ve sus propias citas", async ({ page }) => {
  const date = DAYS[7]!;
  await login(page, USERS.reception);
  const mine = await book(page, { date, services: [SVC_MAINT], staff: "Ana", client: "Demo Uno" });
  const other = await book(page, { date, services: [SVC_WASH], staff: "Bea", client: "Demo Dos" });

  await page.context().clearCookies();
  await login(page, USERS.ana);
  await page.goto(`/agenda?date=${date}`);
  await expect(page.locator(`a[href="/agenda/cita/${mine}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/agenda/cita/${other}"]`)).toHaveCount(0);
  await expect(page.getByText("Clienta Demo Dos")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Nueva cita" })).toHaveCount(0);

  await page.goto(`/agenda/cita/${other}`);
  await expect(page.getByText("Cita no encontrada")).toBeVisible();

  // Puede registrar la asistencia de su propia cita, pero no cancelarla.
  await page.goto(`/agenda/cita/${mine}`);
  await expect(page.getByRole("button", { name: "Cancelar cita" })).toHaveCount(0);
  await page.getByRole("button", { name: "Llegó" }).click();
  await expect(page.getByLabel("Estados de la cita").getByText("Llegó")).toBeVisible();
  const { rows } = await db.query(`select attendance_status from appointments where id = $1`, [mine]);
  expect(rows[0].attendance_status).toBe("arrived");
});

test("lista de espera muestra huecos libres en el rango deseado", async ({ page }) => {
  const date = DAYS[8]!;
  await db.query(`update waitlist_entries set status = 'cancelled' where notes = 'e2e-espera'`);
  await login(page, USERS.reception);
  await page.goto("/agenda/espera");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Agregar" }) });
  await choose(page, "Clienta", "Demo Dos");
  await choose(page, "Servicio", SVC_MAINT);
  await form.getByLabel("Desde").fill(date);
  await form.getByLabel("Hasta").fill(date);
  await form.getByLabel("Notas").fill("e2e-espera");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Clienta agregada a la lista de espera.")).toBeVisible();
  const entry = page.getByTestId("espera-entrada").filter({ hasText: "e2e-espera" });
  await expect(entry.getByText(/Hay \d+ horarios? libres?/)).toBeVisible();
  await entry.getByRole("button", { name: "Marcar ofrecida" }).click();
  await expect(entry.getByText("Ofrecida")).toBeVisible();
  const { rows } = await db.query(`select status from waitlist_entries where notes = 'e2e-espera' and status <> 'cancelled'`);
  expect(rows).toEqual([{ status: "offered" }]);
});

test("sin existencias del tono avisa y permite crear la cita marcada con material faltante", async ({ page }) => {
  const date = DAYS[9]!;
  const TONE_613 = "00000000-0000-4000-8000-000000000412";
  const { rows: st } = await db.query(`select (on_hand - reserved)::numeric a from stock_levels where variant_id = $1 and location_id = $2`, [TONE_613, LOCATION]);
  test.skip(Number(st[0].a) >= 3, "El tono 613 tiene existencias suficientes en esta BD");
  await login(page, USERS.reception);
  await page.goto(`/agenda/nueva?date=${date}`);
  await choose(page, "Clienta", "Demo Dos");
  await choose(page, "Servicio", SVC_INSTALL);
  await page.getByRole("button", { name: "Buscar horarios" }).click();
  await choose(page, "Tono de cabello", "613");
  const slot = page.getByRole("button", { name: /^\d{2}:\d{2}/ }).first();
  await slot.click();
  await expect(page.getByText("No hay existencias suficientes disponibles.")).toBeVisible();
  await page.getByLabel("Crear aunque falte material").check();
  await slot.click();
  await expect(page).toHaveURL(/creada=/);
  const id = new URL(page.url()).searchParams.get("creada")!;
  const { rows } = await db.query(`select materials_status from appointments where id = $1`, [id]);
  expect(rows[0].materials_status).toBe("missing");
  const { rows: al } = await db.query(`select count(*)::int n from ops_alerts where reference_id = $1 and kind = 'materials_missing' and resolved_at is null`, [id]);
  expect(al[0].n).toBeGreaterThanOrEqual(1);
  await page.goto(`/agenda/cita/${id}`);
  await expect(page.getByLabel("Estados de la cita").getByText("Material faltante")).toBeVisible();
});
