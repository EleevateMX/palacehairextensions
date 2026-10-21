import { expect, test } from "@playwright/test";
import { db, login, USERS } from "./helpers";

test.use({ viewport: { width: 360, height: 780 } });
// Diseño móvil primero: ninguna pantalla del módulo debe desbordar a 360 px.
test("agenda y recepción sin scroll horizontal a 360 px", async ({ page }) => {
  const { rows } = await db.query(`select id, (starts_at at time zone 'America/Mexico_City')::date::text d from appointments where booking_status='confirmed' order by created_at desc limit 1`);
  await login(page, USERS.reception);
  const d = rows[0]?.d ?? new Date().toISOString().slice(0, 10);
  const urls = [`/agenda?date=${d}`, `/agenda?date=${d}&view=semana`, `/agenda?date=${d}&view=recursos`, `/agenda/nueva?date=${d}`, "/agenda/bloqueos", "/agenda/espera", "/recepcion"];
  if (rows[0]) urls.push(`/agenda/cita/${rows[0].id}`);
  for (const url of urls) {
    await page.goto(url);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, url).toBeLessThanOrEqual(360);
  }
});
