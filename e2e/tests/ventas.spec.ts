import { expect, test } from "@playwright/test";
import { db, login, USERS } from "./helpers";
import { SEED, addStock, dbCheckout, ensureCashOpen, stockOf } from "./pos-helpers";

test.beforeAll(async () => {
  await ensureCashOpen();
  await addStock(SEED.variantRep, 5);
});

const sellRep = async (qty = 2) =>
  dbCheckout({
    cash_session_id: await ensureCashOpen(),
    lines: [{ kind: "product", variant_id: SEED.variantRep, quantity: qty }],
    payments: [{ method: "cash", amount_cents: 25000 * qty }],
  });

test("la propietaria devuelve una línea con reingreso a inventario; recepción no puede", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  const saleId = await sellRep(2);
  const before = await stockOf(SEED.variantRep);

  await login(page, USERS.reception);
  await page.goto(`/ventas/${saleId}`);
  await expect(page.getByTestId("sale-total")).toHaveText("$500.00");
  await expect(page.getByText(/^Devolver /)).toHaveCount(0);
  await expect(page.getByText("Devoluciones y cancelaciones: solo propietaria o administración.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar venta" })).toHaveCount(0);

  await page.context().clearCookies();
  await login(page, USERS.owner);
  await page.goto(`/ventas/${saleId}`);
  await page.getByText("Devolver Cinta de repuesto (40 pzas)").click();
  await page.getByLabel("Cantidad a devolver de Cinta de repuesto (40 pzas)").fill("1");
  await page.getByLabel("Motivo de devolución de Cinta de repuesto (40 pzas)").fill("Empaque dañado");
  await expect(page.getByLabel("Regresar Cinta de repuesto (40 pzas) al inventario")).toBeChecked();
  await page.getByRole("button", { name: "Registrar devolución" }).click();
  await expect(page.getByText("Devolución registrada por $250.00.")).toBeVisible();
  await expect(page.getByText("Devuelto 1 · $250.00")).toBeVisible();
  await expect(page.getByText(/Empaque dañado · reingresó a inventario/)).toBeVisible();

  expect(await stockOf(SEED.variantRep)).toBe(before + 1);
  const { rows } = await db.query(`select s.status, r.amount_cents, r.restocked, r.cash_session_id from sales s join refunds r on r.sale_id = s.id where s.id = $1`, [
    saleId,
  ]);
  expect(rows[0]).toMatchObject({ status: "partially_refunded", amount_cents: 25000, restocked: true });
  expect(rows[0].cash_session_id).toBeTruthy();
});

test("la propietaria cancela una venta completa con confirmación fuerte", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  const saleId = await sellRep(1);
  const before = await stockOf(SEED.variantRep);
  await login(page, USERS.owner);
  await page.goto(`/ventas/${saleId}`);
  await page.getByLabel("Motivo de la cancelación").fill("Error de captura");
  await page.getByLabel("Confirmación de cancelación").fill("no");
  await page.getByRole("button", { name: "Cancelar venta" }).click();
  await expect(page.getByText("Escribe CANCELAR para confirmar.")).toBeVisible();
  await page.getByLabel("Confirmación de cancelación").fill("CANCELAR");
  await page.getByRole("button", { name: "Cancelar venta" }).click();
  await expect(page.getByText(/Venta cancelada\./)).toBeVisible();
  await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();
  const { rows } = await db.query(`select status, void_reason from sales where id = $1`, [saleId]);
  expect(rows[0]).toEqual({ status: "voided", void_reason: "Error de captura" });
  expect(await stockOf(SEED.variantRep)).toBe(before + 1);
});

test("listado del día y exportación CSV con encabezado", async ({ page }) => {
  const saleId = await sellRep(1);
  const { rows } = await db.query(`select folio from sales where id = $1`, [saleId]);
  await login(page, USERS.reception);
  await page.goto("/ventas");
  await expect(page.locator(`a[href="/ventas/${saleId}"]:visible`).first()).toHaveText(String(rows[0].folio));
  const res = await page.request.get("/ventas/exportar");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="ventas-\d{4}-\d{2}-\d{2}\.csv"/);
  const body = await res.text();
  const [header, ...lines] = body.replace(/^﻿/, "").trim().split("\r\n");
  expect(header).toBe("Folio,Fecha,Clienta,Estado,Subtotal,Descuento,Total,IVA incluido,Propinas,Pagado,Saldo");
  expect(lines.some((l) => l.startsWith(`${rows[0].folio},`) && l.includes(",250.00,"))).toBe(true);
});

test("sin sesión el CSV no se entrega", async ({ request }) => {
  const res = await request.get("/ventas/exportar", { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(res.status());
});
