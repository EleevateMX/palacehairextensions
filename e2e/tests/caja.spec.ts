import { expect, test } from "@playwright/test";
import { db, login, USERS } from "./helpers";
import { SEED, charge, closeAnyOpenCash, openSession, selectByText } from "./pos-helpers";

test.beforeAll(closeAnyOpenCash);

test("recepción abre caja con desglose, cobra en efectivo y cierra con contador: ve esperado, contado y diferencia", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, USERS.reception);

  // Sin caja abierta el punto de venta pide abrirla.
  await page.goto("/pos");
  await expect(page.getByText("La caja está cerrada")).toBeVisible();
  await page.getByRole("link", { name: "Abrir caja" }).click();
  await expect(page).toHaveURL(/\/pos\/caja\?next=/);
  await page.getByText("Contar el fondo por billetes y monedas").click();
  await page.getByLabel("Billetes de $500", { exact: true }).fill("1");
  await expect(page.getByTestId("opening-total")).toHaveText("$500.00");
  await page.getByRole("button", { name: "Abrir caja" }).click();
  await expect(page).toHaveURL(/\/pos$/);
  const sessionId = await openSession();
  expect(sessionId).toBeTruthy();
  const { rows: opened } = await db.query(`select opening_float_cents, opening_breakdown from cash_sessions where id = $1`, [sessionId]);
  expect(opened[0]).toEqual({ opening_float_cents: 50000, opening_breakdown: { "50000": 1 } });

  // Venta en efectivo de $450.
  await selectByText(page, "Servicio", "Lavado y peinado");
  await page.getByRole("button", { name: "Agregar servicio" }).click();
  await page.getByLabel("Restante (pago 1)").click();
  await charge(page);

  await page.goto("/pos/caja");
  await expect(page.getByText("Efectivo esperado")).toBeVisible();
  // 500 + 2×200 + billete de 20 + moneda de 20 = 940 (esperado 950 → faltan 10).
  await page.getByLabel("Billetes de $500", { exact: true }).fill("1");
  await page.getByLabel("Billetes de $200", { exact: true }).fill("2");
  await page.getByLabel("Billetes de $20", { exact: true }).fill("1");
  await page.getByLabel("Monedas de $20", { exact: true }).fill("1");
  await expect(page.getByTestId("counted-total")).toHaveText("$940.00");
  await page.getByRole("button", { name: "Cerrar caja" }).click();

  await expect(page).toHaveURL(new RegExp(`/pos/caja\\?corte=${sessionId}`));
  const result = page.getByTestId("cash-close-result");
  await expect(result).toContainText("Esperado$950.00");
  await expect(result).toContainText("Contado$940.00");
  await expect(result).toContainText(/Diferencia-\$10\.00/);
  await expect(result).toContainText("Faltante");
  const { rows } = await db.query(
    `select status, expected_cash_cents, counted_cash_cents, difference_cents, counted_breakdown from cash_sessions where id = $1`,
    [sessionId],
  );
  expect(rows[0]).toEqual({
    status: "closed",
    expected_cash_cents: 95000,
    counted_cash_cents: 94000,
    difference_cents: -1000,
    counted_breakdown: { "50000": 1, "20000": 2, "2000": 2 },
  });
  // Historial: recepción ve su propia caja.
  await expect(page.getByRole("link", { name: "Ver corte" }).first()).toBeVisible();
  expect(await openSession()).toBeUndefined();
  void SEED;
});
