import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { db, login, USERS } from "./helpers";

// Datos únicos por corrida: el stack local se reutiliza entre ejecuciones.
const RUN = Date.now().toString(36).toUpperCase();
const SKU = `E2E-${RUN}`;
const PRODUCT = `Extensión E2E ${RUN}`;
const SUPPLIER = `Proveedora E2E ${RUN}`;
let variantId = "";

const section = (page: Page, title: string) => page.locator("section", { has: page.getByRole("heading", { name: title, exact: true }) });

async function chooseIn(scope: Locator, label: string, text: string) {
  const select = scope.getByLabel(label);
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  if (value === null) throw new Error(`Opción "${text}" no encontrada en ${label}`);
  await select.selectOption(value);
}

async function stockOf(id: string) {
  const { rows } = await db.query(`select on_hand, reserved from stock_levels where variant_id = $1`, [id]);
  return { onHand: Number(rows[0]?.on_hand ?? 0), reserved: Number(rows[0]?.reserved ?? 0) };
}

test.describe.serial("Inventario", () => {
  test("inventarios da de alta un producto con variante y registra la entrada inicial", async ({ page }) => {
    await login(page, USERS.inventory);
    await page.goto("/inventario/productos/nuevo");
    await page.getByLabel("Nombre del producto").fill(PRODUCT);
    await page.getByLabel("Técnica").fill("cinta");
    await page.getByLabel("Nueva categoría").fill("Extensiones E2E");
    await page.getByLabel("SKU").fill(SKU);
    await page.getByLabel("Nombre de la variante").fill(`Cinta 60 cm tono 8 ${RUN}`);
    await page.getByLabel("Tono / color").fill("8");
    await page.getByLabel("Largo (cm)").fill("60");
    await page.getByLabel("Textura").fill("lacio");
    await page.getByLabel("Costo (MXN)").fill("500");
    await page.getByLabel("Precio (MXN)").fill("1,000.00");
    await page.getByLabel("Existencia mínima").fill("2");
    await page.getByRole("button", { name: "Crear producto" }).click();
    await expect(page).toHaveURL(/\/inventario\/productos\/[0-9a-f-]{36}\?ok=creado/);
    await expect(page.getByText("Producto creado")).toBeVisible();

    const { rows } = await db.query(`select id, cost_cents, price_cents, min_stock from product_variants where sku = $1`, [SKU]);
    expect(rows[0]).toMatchObject({ cost_cents: 50000, price_cents: 100000 });
    variantId = rows[0].id;

    await page.goto(`/inventario/movimiento?variant=${variantId}`);
    const entry = section(page, "Entrada (inicial o compra)");
    await entry.getByLabel("Tipo de entrada").selectOption("initial");
    await entry.getByLabel("Cantidad").fill("10");
    await entry.getByLabel("Costo unitario (MXN)").fill("480");
    await entry.getByRole("button", { name: "Registrar entrada" }).click();
    await expect(entry.getByRole("status")).toContainText("Entrada inicial registrada");

    expect(await stockOf(variantId)).toEqual({ onHand: 10, reserved: 0 });
    const mv = await db.query(`select movement_type, quantity, on_hand_after, unit_cost_cents from stock_movements where variant_id = $1`, [variantId]);
    expect(mv.rows).toHaveLength(1);
    expect(mv.rows[0]).toMatchObject({ movement_type: "initial", unit_cost_cents: 48000 });
    expect(Number(mv.rows[0].quantity)).toBe(10);
    // Sin otra sucursal activa la transferencia se explica deshabilitada.
    await expect(page.getByTestId("transfer-disabled")).toBeVisible();
  });

  test("registra merma y ajuste; el ajuste sin motivo muestra error", async ({ page }) => {
    await login(page, USERS.inventory);
    await page.goto(`/inventario/movimiento?variant=${variantId}`);
    const waste = section(page, "Merma");
    await waste.getByLabel("Cantidad perdida").fill("1");
    await waste.getByLabel("Motivo").fill("Mechón dañado");
    await waste.getByRole("button", { name: "Registrar merma" }).click();
    await expect(waste.getByRole("status")).toContainText("Merma registrada");

    const adj = section(page, "Ajuste");
    await adj.getByLabel("Cantidad (+ suma, − resta)").fill("-1");
    await adj.getByRole("button", { name: "Registrar ajuste" }).click();
    await expect(adj.getByRole("alert")).toContainText("Escribe el motivo");
    expect((await stockOf(variantId)).onHand).toBe(9);

    await adj.getByLabel("Motivo del ajuste").fill("Error de captura");
    await adj.getByRole("button", { name: "Registrar ajuste" }).click();
    await expect(adj.getByRole("status")).toContainText("Ajuste registrado");
    expect((await stockOf(variantId)).onHand).toBe(8);
    const mv = await db.query(`select movement_type, quantity::float q from stock_movements where variant_id = $1 order by id`, [variantId]);
    expect(mv.rows.map((r) => [r.movement_type, r.q])).toEqual([
      ["initial", 10],
      ["waste", -1],
      ["adjustment", -1],
    ]);
  });

  test("el kardex muestra los movimientos con saldo y costo", async ({ page }) => {
    await login(page, USERS.inventory);
    await page.goto(`/inventario/kardex/${variantId}`);
    await expect(page.getByTestId("on-hand")).toHaveText("8");
    const rows = page.getByTestId("kardex-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Ajuste");
    await expect(rows.nth(0)).toContainText("Error de captura");
    await expect(rows.nth(1)).toContainText("Merma");
    await expect(rows.nth(2)).toContainText("Entrada inicial");
    await expect(rows.nth(2)).toContainText("$480.00");
    await expect(page.locator("thead").filter({ hasText: "Saldo" })).toContainText("Costo unitario");
  });

  test("conteo físico con diferencia aplica un count_adjustment", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await login(page, USERS.inventory);
    await page.goto("/inventario/conteos");
    const resume = page.getByRole("link", { name: "Continuar conteo" });
    if (await resume.isVisible()) await resume.click();
    else await page.getByRole("button", { name: "Iniciar conteo" }).click();
    await expect(page).toHaveURL(/\/inventario\/conteos\/[0-9a-f-]{36}/);
    const countId = page.url().split("/").pop()!.split("?")[0]!;
    await page.getByLabel(`Contado ${SKU}`).fill("6");
    await page.getByRole("button", { name: "Guardar conteo" }).click();
    await expect(page.getByTestId(`diff-${SKU}`)).toHaveText("-2");
    await page.getByRole("button", { name: "Aplicar conteo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Conteo aplicado" })).toBeVisible();

    expect((await stockOf(variantId)).onHand).toBe(6);
    const { rows } = await db.query(
      `select movement_type, quantity::float q from stock_movements where variant_id = $1 and reference_type = 'stock_count' and reference_id = $2`,
      [variantId, countId],
    );
    expect(rows).toEqual([{ movement_type: "count_adjustment", q: -2 }]);
    const { rows: c } = await db.query(`select status from stock_counts where id = $1`, [countId]);
    expect(c[0].status).toBe("applied");
  });

  test("orden de compra creada y recibida parcialmente sube existencias y queda 'partial'", async ({ page }) => {
    await login(page, USERS.inventory);
    await page.goto("/inventario/proveedores");
    const form = section(page, "Nuevo proveedor");
    await form.getByLabel("Nombre").fill(SUPPLIER);
    await form.getByLabel("Teléfono").fill("+52 999 000 0000");
    await form.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(form.getByRole("status")).toContainText("Proveedor creado");

    // Las sugerencias de reabasto prellenan la orden (semilla: DEV-CIN-55-613 está en su mínimo).
    await page.goto("/inventario/compras");
    await expect(section(page, "Sugerencias de reabasto")).toContainText("DEV-CIN-55-613");

    await page.goto("/inventario/compras/nueva");
    await chooseIn(page.locator("main"), "Proveedor", SUPPLIER);
    await page.getByLabel("Fecha esperada").fill("2030-01-15");
    await chooseIn(page.locator("main"), "Producto partida 1", SKU);
    await page.getByLabel("Cantidad partida 1").fill("5");
    await page.getByLabel("Costo unitario partida 1").fill("450");
    await page.getByRole("button", { name: "Crear orden" }).click();
    await expect(page).toHaveURL(/\/inventario\/compras\/[0-9a-f-]{36}$/);
    const poId = page.url().split("/").pop()!;
    await expect(page.getByText("Borrador")).toBeVisible();

    await page.getByRole("button", { name: "Marcar como enviada" }).click();
    await expect(page.getByText("Orden marcada como enviada")).toBeVisible();

    await page.getByLabel(`Recibir ${SKU}`).fill("2");
    await page.getByRole("button", { name: "Recibir", exact: true }).click();
    await expect(page.getByText("Recibido: 2")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Recibida parcial")).toBeVisible();

    const { rows } = await db.query(`select status from purchase_orders where id = $1`, [poId]);
    expect(rows[0].status).toBe("partial");
    expect((await stockOf(variantId)).onHand).toBe(8);
    const mv = await db.query(
      `select movement_type, quantity::float q, unit_cost_cents from stock_movements where reference_type = 'purchase_order' and reference_id = $1`,
      [poId],
    );
    expect(mv.rows).toEqual([{ movement_type: "purchase", q: 2, unit_cost_cents: 45000 }]);
  });

  test("ubicación física, edición de variante y apartado manual con liberación", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await login(page, USERS.inventory);
    const { rows } = await db.query(`select product_id from product_variants where id = $1`, [variantId]);
    await page.goto(`/inventario/productos/${rows[0].product_id}`);
    const item = page.getByTestId(`variant-${SKU}`);
    await item.getByLabel("Ubicación física").fill("Anaquel A2");
    await item.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(item.getByRole("status")).toContainText("Ubicación: Anaquel A2");
    const { rows: bin } = await db.query(`select bin_location from stock_levels where variant_id = $1`, [variantId]);
    expect(bin[0].bin_location).toBe("Anaquel A2");

    // Promo mayor que el precio: error y no se pierde lo capturado.
    await item.getByText("Editar variante").click();
    await item.getByLabel("Precio de promoción (MXN)").fill("2000");
    await item.getByRole("button", { name: "Guardar variante" }).click();
    await expect(item.getByRole("alert")).toContainText("menor al precio normal");
    await expect(item.getByLabel("Precio de promoción (MXN)")).toHaveValue("2000");
    await item.getByLabel("Precio de promoción (MXN)").fill("900");
    await item.getByLabel("Promoción termina").fill("2030-01-31");
    await item.getByRole("button", { name: "Guardar variante" }).click();
    await expect(item.getByRole("status").filter({ hasText: "Variante guardada" })).toBeVisible();
    const { rows: v } = await db.query(
      `select promo_price_cents, to_char(promo_ends_at at time zone 'America/Mexico_City', 'YYYY-MM-DD HH24:MI') ends, cost_cents from product_variants where id = $1`,
      [variantId],
    );
    expect(v[0]).toMatchObject({ promo_price_cents: 90000, ends: "2030-01-31 23:59", cost_cents: 50000 });

    await page.goto(`/inventario/kardex/${variantId}`);
    await page.getByLabel("Cantidad a apartar").fill("1");
    await page.getByLabel("Nota").fill("Apartado E2E");
    await page.getByRole("button", { name: "Apartar" }).click();
    await expect(page.getByText("Material apartado")).toBeVisible();
    expect(await stockOf(variantId)).toEqual({ onHand: 8, reserved: 1 });
    await page.getByRole("button", { name: "Liberar" }).click();
    await expect(page.getByText("Sin reservas activas")).toBeVisible();
    expect(await stockOf(variantId)).toEqual({ onHand: 8, reserved: 0 });
  });

  test("la estilista consulta el inventario sin costos y no puede dar de alta productos", async ({ page }) => {
    await login(page, USERS.ana);
    await page.goto(`/inventario?q=${SKU}`);
    const table = page.getByTestId("stock-table");
    await expect(table).toContainText(SKU);
    await expect(table.locator("thead")).toContainText("Disponible");
    await expect(table.locator("thead")).not.toContainText("Costo");
    await expect(table.locator("thead")).not.toContainText("Margen");
    await expect(page.getByRole("link", { name: "Nuevo producto" })).toHaveCount(0);
    await page.goto("/inventario/productos/nuevo");
    await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible();
    await expect(page.getByLabel("SKU")).toHaveCount(0);
    await page.goto("/inventario/movimiento");
    await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible();
    // El kardex no le muestra movimientos (RLS) ni costo.
    await page.goto(`/inventario/kardex/${variantId}`);
    await expect(page.getByTestId("kardex-row")).toHaveCount(0);
    await expect(page.getByText("$480.00")).toHaveCount(0);
  });

  test("recepción no ve costos ni en pantalla ni en el CSV", async ({ page }) => {
    await login(page, USERS.reception);
    await page.goto(`/inventario?q=${SKU}`);
    const table = page.getByTestId("stock-table");
    await expect(table).toContainText(SKU);
    await expect(table.locator("thead")).toContainText("Precio");
    await expect(table.locator("thead")).not.toContainText("Costo");
    const res = await page.request.get("/inventario/exportar");
    expect(res.status()).toBe(200);
    const header = (await res.text()).replace(/^﻿/, "").split("\r\n")[0];
    expect(header).toBe(
      "sku,producto,variante,tipo,tecnica,tono,largo_cm,textura,unidad,existencias,reservado,disponible,minimo,bajo_minimo,ubicacion,precio_mxn",
    );
  });

  test("inventarios exporta el CSV de existencias con costo", async ({ page }) => {
    await login(page, USERS.inventory);
    await page.goto(`/inventario?q=${SKU}`);
    await expect(page.getByTestId("stock-table").locator("thead")).toContainText("Costo");
    await expect(page.getByTestId("stock-table")).toContainText("$500.00");
    await page.goto("/inventario");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^inventario-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "");
    const [header, ...lines] = text.trim().split("\r\n");
    expect(header).toBe(
      "sku,producto,variante,tipo,tecnica,tono,largo_cm,textura,unidad,existencias,reservado,disponible,minimo,bajo_minimo,ubicacion,precio_mxn,costo_mxn,margen_pct",
    );
    const mine = lines.find((l) => l.startsWith(`${SKU},`));
    expect(mine).toContain(",8,0,8,2,no,");
    expect(mine).toContain(",1000.00,500.00,50");
  });
});
