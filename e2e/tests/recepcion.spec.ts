import { expect, test } from "@playwright/test";
import { db, login, USERS } from "./helpers";

// El tablero muestra el día de HOY. Para no depender del horario real en que corre la prueba,
// la cita en servicio se inserta directamente en la BD local (sin ocupaciones, solo lectura del tablero).
const LOCATION = "00000000-0000-4000-8000-000000000001";
const SVC_MAINT = "00000000-0000-4000-8000-000000000303";

test("el tablero de recepción muestra la cita en servicio, estaciones libres y permite resolver alertas", async ({ page }) => {
  const { rows: who } = await db.query(
    `select (select id from clients where last_name = 'Demo Dos') client_id,
            (select id from staff_members where display_name = 'Bea (DEV)') staff_id`,
  );
  const { client_id, staff_id } = who[0];
  // Inicio = hace 30 min, sin salir del día local de hoy.
  const { rows: appt } = await db.query(
    `with t as (select greatest(now() - interval '30 minutes', date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City') s)
     insert into appointments (location_id, client_id, booking_status, attendance_status, starts_at, ends_at, notes)
     select $1, $2, 'confirmed', 'in_service', s, s + interval '90 minutes', 'e2e-recepcion' from t
     returning id, starts_at, ends_at`,
    [LOCATION, client_id],
  );
  const id = appt[0].id as string;
  await db.query(
    `insert into appointment_services (appointment_id, service_id, staff_id, starts_at, ends_at, price_cents) values ($1, $2, $3, $4, $5, 120000)`,
    [id, SVC_MAINT, staff_id, appt[0].starts_at, appt[0].ends_at],
  );
  const { rows: alert } = await db.query(
    `insert into ops_alerts (kind, severity, message) values ('e2e', 'warning', 'Alerta de prueba e2e') returning id`,
  );

  try {
    await login(page, USERS.reception);
    await page.goto("/recepcion");
    await expect(page.getByRole("heading", { name: "Recepción" })).toBeVisible();
    await expect(page.getByText(/Se actualiza cada 60 s/)).toBeVisible();
    const inService = page.getByTestId("en-servicio");
    await expect(inService.locator(`a[href="/agenda/cita/${id}"]`)).toBeVisible();
    await expect(inService.getByText("Clienta Demo Dos")).toBeVisible();
    await expect(page.getByText("Estaciones libres ahora")).toBeVisible();

    const row = page.getByRole("listitem").filter({ hasText: "Alerta de prueba e2e" });
    await row.getByRole("button", { name: "Marcar resuelta" }).click();
    await expect(page.getByText("Alerta de prueba e2e")).toHaveCount(0);
    const { rows } = await db.query(`select resolved_at from ops_alerts where id = $1`, [alert[0].id]);
    expect(rows[0].resolved_at).not.toBeNull();
  } finally {
    await db.query(`update appointments set booking_status = 'cancelled', cancel_reason = 'e2e-reset' where id = $1`, [id]);
    await db.query(`update ops_alerts set resolved_at = coalesce(resolved_at, now()) where id = $1`, [alert[0].id]);
  }
});

test("una estilista no tiene acceso al tablero de recepción", async ({ page }) => {
  await login(page, USERS.ana);
  await page.goto("/recepcion");
  await expect(page).toHaveURL(/\/dashboard/);
});
