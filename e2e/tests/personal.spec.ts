import { type Page, expect, test } from "@playwright/test";
import { choose, db, login, USERS } from "./helpers";

const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

async function logout(page: Page) {
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Lunes a sábado aleatorio lejano (evita chocar con datos de corridas previas). */
function farWorkday(): string {
  const d = new Date(Date.now() + (400 + Math.floor(Math.random() * 2500)) * 86_400_000);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
});

test("todo el personal ve la lista; recepción no ve el alta", async ({ page }) => {
  await login(page, USERS.reception);
  await page.goto("/personal");
  await expect(page.getByText("Ana López")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dar de alta" })).toHaveCount(0);
  await page.goto("/personal/00000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("alert").filter({ hasText: "No tienes permiso" })).toBeVisible();
});

test("la propietaria da de alta a una persona que después puede entrar", async ({ page }) => {
  const email = `e2e-${stamp()}@palace.local`;
  const name = `Estilista E2E ${stamp()}`;
  await login(page, USERS.owner);
  await page.goto("/personal");
  await page.getByLabel("Correo de acceso").fill(email);
  await page.getByLabel("Nombre para mostrar").fill(name);
  await page.getByLabel("Rol").selectOption("stylist");
  await page.getByLabel("Agendable (aparece en la agenda)").check();
  await page.getByRole("button", { name: "Dar de alta" }).click();
  const pwd = (await page.getByTestId("temp-password").textContent())!.trim();
  expect(pwd).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{16}$/);
  await expect(page.getByRole("link", { name: name })).toBeVisible();

  // Duplicado: el mismo correo se rechaza.
  await page.getByLabel("Correo de acceso").fill(email);
  await page.getByLabel("Nombre para mostrar").fill(name);
  await page.getByRole("button", { name: "Dar de alta" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ya existe una cuenta con ese correo" })).toBeVisible();

  // Turno partido para la nueva persona.
  await page.getByRole("link", { name: name }).click();
  await page.getByRole("button", { name: "Agregar turno" }).first().click(); // lunes
  await page.getByLabel("Entra Lunes 1").fill("10:00");
  await page.getByLabel("Sale Lunes 1").fill("14:00");
  await page.getByRole("button", { name: "Agregar turno" }).first().click();
  await page.getByLabel("Entra Lunes 2").fill("16:00");
  await page.getByLabel("Sale Lunes 2").fill("20:00");
  await page.getByRole("button", { name: "Guardar turnos" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Turnos guardados (2 rangos)" })).toBeVisible();
  await page.getByLabel("Realiza: Lavado y peinado").check();
  await page.getByRole("button", { name: "Guardar servicios" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Servicios guardados (1)" })).toBeVisible();

  const { rows } = await db.query(
    `select m.role, m.is_bookable, m.email::text, (select count(*)::int from staff_schedules s where s.staff_id = m.id) shifts,
            (select count(*)::int from staff_services x where x.staff_id = m.id) services
       from staff_members m join auth.users u on u.id = m.user_id where u.email = $1`,
    [email],
  );
  expect(rows).toEqual([{ role: "stylist", is_bookable: true, email, shifts: 2, services: 1 }]);

  await logout(page);
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(pwd);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const card = page.getByTestId("usuario-actual");
  await expect(card).toContainText(name);
  await expect(card).toContainText("Estilista");
  // Una estilista no ve Configuración.
  await page.goto("/configuracion");
  await expect(page.getByRole("alert").filter({ hasText: "No tienes permiso" })).toBeVisible();
});

test("la estilista solicita vacaciones y la propietaria las aprueba", async ({ page }) => {
  const day = farWorkday();
  const reason = `Vacaciones E2E ${stamp()}`;
  // Repetible: el día elegido no debe tener ocupaciones previas de Ana (de otras corridas).
  await db.query(
    `update appointment_allocations set active = false
      where staff_id = (select id from staff_members where display_name = 'Ana López')
        and occupied && tstzrange(($1::date)::timestamp at time zone 'America/Mexico_City',
                                  ($1::date + 1)::timestamp at time zone 'America/Mexico_City')`,
    [day],
  );
  await login(page, USERS.ana);
  await page.goto("/personal/ausencias");
  await page.getByLabel("Tipo").selectOption("vacation");
  await page.getByLabel("Desde (fecha)").fill(day);
  await page.getByLabel("Hasta (fecha)").fill(day);
  await page.getByLabel("Motivo (opcional)").fill(reason);
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Solicitud enviada" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: reason })).toContainText("Pendiente");
  // La estilista no puede aprobar.
  await expect(page.getByRole("button", { name: /Aprobar ausencia/ })).toHaveCount(0);
  await logout(page);

  await login(page, USERS.owner);
  await page.goto("/personal/ausencias");
  const pending = page.getByTestId("pending-time-off").filter({ hasText: reason });
  await pending.getByRole("button", { name: "Aprobar ausencia de Ana López" }).click();
  await expect(page.getByTestId("approved-time-off").filter({ hasText: "Ana López" }).first()).toBeVisible();
  await expect(page.getByTestId("pending-time-off").filter({ hasText: reason })).toHaveCount(0);

  const { rows } = await db.query(
    `select t.status, (select count(*)::int from appointment_allocations a where a.time_off_id = t.id and a.active) blocks
       from staff_time_off t where t.reason = $1`,
    [reason],
  );
  expect(rows).toEqual([{ status: "approved", blocks: 1 }]);
});

test("aprobar una ausencia con citas muestra los conflictos con enlace a la cita", async ({ page }) => {
  const day = farWorkday();
  const reason = `Permiso E2E ${stamp()}`;
  // Cita de Ana ese día, creada con la función atómica como servidor (service_role).
  const c = await db.connect();
  let appointmentId: string;
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const { rows: [ids] } = await c.query(`
      select (select id from staff_members where display_name = 'Ana López') ana,
             (select id from clients order by created_at limit 1) client,
             (select id from locations order by name limit 1) loc,
             (select r.id from resources r join resource_types t on t.id = r.resource_type_id where t.code = 'lavacabezas' limit 1) res,
             (select id from services where name = 'Lavado y peinado') svc`);
    const items = [{ service_id: ids.svc, staff_id: ids.ana, resource_ids: [ids.res], starts_at: `${day}T12:00:00-06:00` }];
    const { rows: [appt] } = await c.query(`select public.create_appointment($1, $2, $3::jsonb) id`, [ids.loc, ids.client, JSON.stringify(items)]);
    appointmentId = appt.id;
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }

  await login(page, USERS.ana);
  await page.goto("/personal/ausencias");
  await page.getByLabel("Tipo").selectOption("permit");
  await page.getByLabel("Desde (fecha)").fill(day);
  await page.getByLabel("Hasta (fecha)").fill(day);
  await page.getByLabel("Motivo (opcional)").fill(reason);
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Solicitud enviada" })).toBeVisible();
  await logout(page);

  await login(page, USERS.owner);
  await page.goto("/personal/ausencias");
  const pending = page.getByTestId("pending-time-off").filter({ hasText: reason });
  await pending.getByRole("button", { name: "Aprobar ausencia de Ana López" }).click();
  await expect(pending.getByRole("alert").filter({ hasText: "tiene citas o bloqueos" })).toBeVisible();
  const link = pending.getByRole("link", { name: /Lavado y peinado/ });
  await expect(link).toHaveAttribute("href", `/agenda/cita/${appointmentId!}`);
  const { rows } = await db.query(`select status from staff_time_off where reason = $1`, [reason]);
  expect(rows[0].status).toBe("requested");

  // Se rechaza y deja de estar pendiente.
  await pending.getByRole("button", { name: "Rechazar ausencia de Ana López" }).click();
  await expect(page.getByTestId("pending-time-off").filter({ hasText: reason })).toHaveCount(0);
});

test("solo la propietaria puede asignar el rol de propietaria", async ({ page }) => {
  // Persona de administración creada por la propietaria; intenta dar de alta a otra propietaria.
  const email = `admin-${stamp()}@palace.local`;
  await login(page, USERS.owner);
  await page.goto("/personal");
  await page.getByLabel("Correo de acceso").fill(email);
  await page.getByLabel("Nombre para mostrar").fill("Admin E2E");
  await choose(page, "Rol", "Administración");
  await page.getByRole("button", { name: "Dar de alta" }).click();
  const pwd = (await page.getByTestId("temp-password").textContent())!.trim();
  await logout(page);

  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(pwd);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/personal");
  await expect(page.getByLabel("Rol").locator("option", { hasText: "Propietaria" })).toHaveCount(0);
  // Editar a la propietaria: la BD lo impide y se muestra el mensaje.
  await page.getByRole("link", { name: "Mariana Ríos" }).click();
  await page.getByLabel("Nombre para mostrar").fill("Cambio no permitido");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Solo la propietaria" })).toBeVisible();
  const { rows } = await db.query(`select count(*)::int n from staff_members where display_name = 'Cambio no permitido'`);
  expect(rows[0].n).toBe(0);
});
