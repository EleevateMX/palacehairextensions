import { expect, test } from "@playwright/test";
import { choose, db, login, USERS } from "./helpers";

test("técnica que siempre exige valoración muestra rango y «requiere valoración»", async ({ page }) => {
  await login(page, USERS.reception);
  await page.goto("/cotizador");
  await expect(page.getByText("Valores de ejemplo pendientes de validar")).toBeVisible();
  await page.getByLabel("Largo (cm)").fill("55");
  await choose(page, "Técnica", "Keratina");
  await choose(page, "Tono", "Tono 4");
  await page.getByRole("button", { name: "Cotizar" }).click();
  await expect(page.getByTestId("quote-range")).toContainText("$");
  await expect(page.getByText("Requiere valoración", { exact: true })).toBeVisible();
  await expect(page.getByText("La técnica Keratina requiere valoración")).toBeVisible();
  await expect(page.getByText(/Precio estimado sujeto a valoración/)).toBeVisible();
});

test("cinta con existencias suficientes no requiere valoración adicional", async ({ page }) => {
  await login(page, USERS.reception);
  await page.goto("/cotizador");
  await page.getByLabel("Largo (cm)").fill("55");
  await choose(page, "Volumen", "Medio");
  await choose(page, "Técnica", "Cinta adhesiva");
  await choose(page, "Tono", "Tono 4");
  await page.getByRole("button", { name: "Cotizar" }).click();
  // 60 cm/medio = 175 g → 4 paquetes de 50 g × $1,400 + mano de obra $1,500 + insumos $300 = $7,400 ± 15 %.
  await expect(page.getByTestId("quote-range")).toHaveText("$6,290.00 – $8,510.00");
  await expect(page.getByText("Existencias suficientes")).toBeVisible();
  await expect(page.getByText(/No requiere valoración adicional/)).toBeVisible();
  await expect(page.getByText("Requiere valoración", { exact: true })).toHaveCount(0);
  const href = await page.getByRole("link", { name: "Agendar valoración" }).getAttribute("href");
  expect(href).toMatch(/\/agenda\/nueva\?service=00000000-0000-4000-8000-000000000301/);
});

test("tono con pocas existencias pide valoración y se puede apartar para una clienta", async ({ page }) => {
  await login(page, USERS.reception);
  await page.goto("/cotizador");
  await page.getByLabel("Largo (cm)").fill("55");
  await choose(page, "Técnica", "Cinta adhesiva");
  await choose(page, "Tono", "Tono 613");
  await page.getByRole("button", { name: "Cotizar" }).click();
  await expect(page.getByText("Existencias insuficientes", { exact: true })).toBeVisible();
  await expect(page.getByText("Existencias insuficientes del tono seleccionado")).toBeVisible();

  await choose(page, "Clienta", "Demo Dos");
  await page.getByLabel("Paquetes").fill("1");
  await page.getByRole("button", { name: "Apartar tono" }).click();
  await expect(page.getByText("Se apartaron 1 para la clienta.")).toBeVisible();
  const { rows } = await db.query(
    `select r.id from stock_reservations r join clients c on c.id = r.client_id
      where c.last_name = 'Demo Dos' and r.variant_id = '00000000-0000-4000-8000-000000000412' and r.status = 'active'`,
  );
  expect(rows.length).toBeGreaterThanOrEqual(1);
  // Limpieza: libera con la función atómica (mantiene reserved consistente).
  for (const r of rows) await db.query(`select app.release_reservation_internal($1)`, [r.id]);
});
