import { expect, test } from "@playwright/test";
import { db, login, USERS } from "./helpers";
import { clearSales, sale, SERVICES, staffId } from "./report-helpers";

// Periodo fijo en el pasado, limpiado en cada corrida.
const FROM = "2025-03-01";
const TO = "2025-03-31";
const RANGE = `desde=${FROM}&hasta=${TO}`;

let ana: string;
let bea: string;

test.beforeAll(async () => {
  ana = await staffId(USERS.ana);
  bea = await staffId("bea@palace.local");
  await clearSales(FROM, TO);
  await db.query(`delete from commission_rules where staff_id in ($1, $2)`, [ana, bea]);
  await db.query(
    `insert into commission_rules (staff_id, rule) values ($1, '{"kind":"percent_service","bps":1000}'), ($2, '{"kind":"percent_service","bps":500}')`,
    [ana, bea],
  );
  // Ana: lavado $450 − $50 de descuento = $400 neto → 10% = $40.00; propina $30 aparte.
  await sale(
    {
      lines: [{ kind: "service", service_id: SERVICES.lavado, staff_id: ana, discount_cents: 5000 }],
      payments: [{ method: "cash", amount_cents: 40000, tip_cents: 3000, tip_staff_id: ana }],
    },
    "2025-03-10T12:00:00-06:00",
  );
  // Bea: mantenimiento $1,200 → 5% = $60.00 (pagado con tarjeta).
  await sale(
    { lines: [{ kind: "service", service_id: SERVICES.mantenimiento, staff_id: bea }], payments: [{ method: "card", amount_cents: 120000 }] },
    "2025-03-11T17:30:00-06:00",
  );
});

test.afterAll(async () => {
  await db.query(`delete from commission_rules where staff_id in ($1, $2)`, [ana, bea]);
});

test("la propietaria ve comisiones por estilista según su regla, ventas por método y más vendidos", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto(`/reportes?${RANGE}`);
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();

  const anaRow = page.getByTestId("comision-Ana López");
  await expect(anaRow.getByTestId("comision-total")).toHaveText("$40.00");
  await expect(anaRow).toContainText("$400.00"); // base neta de servicios
  await expect(anaRow).toContainText("$30.00"); // propinas aparte
  await expect(page.getByTestId("comision-Bea Torres").getByTestId("comision-total")).toHaveText("$60.00");

  // Ventas por día y método.
  await expect(page.getByText("$1,600.00").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Más vendidos" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Mantenimiento de cinta" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Productividad por estilista" })).toBeVisible();
  await expect(page.getByText("Tasa de cancelación")).toBeVisible();
});

test("la exportación CSV trae BOM UTF-8 y el encabezado esperado", async ({ page }) => {
  await login(page, USERS.owner);
  const res = await page.request.get(`/reportes/exportar/ventas?${RANGE}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.body();
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const lines = body.subarray(3).toString("utf8").split("\r\n");
  expect(lines[0]).toBe("fecha,tickets,total,efectivo,tarjeta,transferencia,tarjeta_regalo,anticipo_aplicado,en_linea,descuentos,propinas,devoluciones");
  expect(lines).toContain("2025-03-10,1,400.00,400.00,0.00,0.00,0.00,0.00,0.00,50.00,30.00,0.00");

  const com = await page.request.get(`/reportes/exportar/comisiones?${RANGE}`);
  const text = (await com.body()).subarray(3).toString("utf8");
  expect(text.split("\r\n")[0]).toBe("estilista,fecha,concepto,regla,bruto,descuento_y_devolucion,base_neta,comision");
  expect(text).toContain("Ana López,,TOTAL,,,,400.00,40.00");
});

test("la estilista solo ve sus comisiones y no puede abrir finanzas", async ({ page }) => {
  await login(page, USERS.ana);
  await page.goto(`/reportes?${RANGE}`);
  await expect(page.getByRole("heading", { name: "Mis comisiones" })).toBeVisible();
  await expect(page.getByTestId("comision-Ana López").getByTestId("comision-total")).toHaveText("$40.00");
  await expect(page.getByText("Bea Torres")).toHaveCount(0);
  await expect(page.getByText("Ventas por día")).toHaveCount(0);

  // Exportaciones ajenas: prohibidas; la de comisiones solo trae sus líneas.
  expect((await page.request.get(`/reportes/exportar/ventas?${RANGE}`)).status()).toBe(403);
  const mine = (await (await page.request.get(`/reportes/exportar/comisiones?${RANGE}`)).body()).toString("utf8");
  expect(mine).toContain("Ana López");
  expect(mine).not.toContain("Bea Torres");
  expect((await page.request.get(`/finanzas/exportar/gastos?${RANGE}`)).status()).toBe(403);

  await page.goto("/finanzas");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("recepción no tiene reportes", async ({ page }) => {
  await login(page, USERS.reception);
  await page.goto("/reportes");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("el dashboard muestra los indicadores ejecutivos", async ({ page }) => {
  await login(page, USERS.owner);
  await expect(page.getByText("Ocupación del día")).toBeVisible();
  await expect(page.getByText("Servicios hoy")).toBeVisible();
  await expect(page.getByText("Productos hoy")).toBeVisible();
  await expect(page.getByText("Cancelación (30 días)")).toBeVisible();
  await expect(page.getByText("Clientas nuevas (30 días)")).toBeVisible();
  await expect(page.getByText("Servicios más rentables del mes")).toBeVisible();
  await expect(page.getByText("Productividad de hoy")).toBeVisible();
});
