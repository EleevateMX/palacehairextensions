import { expect, test } from "@playwright/test";
import { choose, db, futureWorkday, login, USERS } from "./helpers";

test("recepción agenda una cita desde horarios válidos y aparece en la agenda", async ({ page }) => {
  const date = futureWorkday(8);
  // Prueba repetible: libera el día antes de agendar.
  await db.query(
    `update appointment_allocations set active = false where appointment_id in (
       select id from appointments where (starts_at at time zone 'America/Mexico_City')::date = $1)`,
    [date],
  );
  await db.query(
    `update appointments set booking_status = 'cancelled' where (starts_at at time zone 'America/Mexico_City')::date = $1`,
    [date],
  );
  await login(page, USERS.reception);
  await page.goto(`/agenda/nueva?date=${date}`);
  await choose(page, "Clienta", "Demo Uno");
  await choose(page, "Servicio", "Mantenimiento de cinta");
  await page.getByRole("button", { name: "Buscar horarios" }).click();
  const first = page.getByRole("button", { name: /^10:00/ });
  await expect(first).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(new RegExp(`/agenda\\?date=${date}`));
  await expect(page.getByText("Mantenimiento de cinta").first()).toBeVisible();
  const { rows } = await db.query(
    `select count(*)::int n from appointments a join appointment_services s on s.appointment_id = a.id
      where (a.starts_at at time zone 'America/Mexico_City')::date = $1 and a.booking_status = 'confirmed'`,
    [date],
  );
  expect(rows[0].n).toBeGreaterThanOrEqual(1);
});

test("rutas protegidas exigen sesión", async ({ page }) => {
  await page.goto("/inventario");
  await expect(page).toHaveURL(/\/login\?next=%2Finventario/);
});
