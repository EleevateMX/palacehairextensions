import { expect, test } from "@playwright/test";
import { db, login, USERS } from "./helpers";

test("en el teléfono: entrar, abrir clientas y registrar una clienta", async ({ page }) => {
  const phone = `56${String(Date.now()).slice(-8)}`;
  await login(page, USERS.reception);
  await page.getByRole("link", { name: "Clientas" }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  await expect(page.getByRole("heading", { name: "Clientas" })).toBeVisible();
  await page.getByRole("link", { name: "Nueva clienta" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Móvil");
  await page.getByLabel("Apellidos").fill(`Prueba ${phone}`);
  await page.getByLabel(/^Teléfono/).fill(phone);
  await page.getByLabel(/^Aviso de privacidad/).check();
  // Sin desplazamiento horizontal en el formulario.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Registrar clienta" }).click();
  await expect(page.getByRole("heading", { name: `Móvil Prueba ${phone}` })).toBeVisible();
  const { rows } = await db.query(`select count(*)::int n from clients where phone = $1`, [`+52${phone}`]);
  expect(rows[0].n).toBe(1);
});
