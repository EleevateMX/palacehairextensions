import { expect, test } from "@playwright/test";
import { db, login, USERS } from "./helpers";
import { asServer, clearAppointmentsOn, clearSales, LOCATION, resourceOfType, SERVICES, staffId } from "./report-helpers";

const APRIL = { from: "2025-04-01", to: "2025-04-30" };
const MAY = { from: "2025-05-01", to: "2025-05-31" };
const qs = (p: { from: string; to: string }) => `desde=${p.from}&hasta=${p.to}`;

test("la propietaria registra un gasto y la utilidad operativa baja en ese importe", async ({ page }) => {
  await db.query(`delete from expenses where expense_date between $1 and $2`, [APRIL.from, APRIL.to]);
  await clearSales(APRIL.from, APRIL.to);
  await login(page, USERS.owner);
  await page.goto(`/finanzas?${qs(APRIL)}`);
  await expect(page.getByText("no es contabilidad formal")).toBeVisible();
  const profit = page.getByTestId("utilidad-operativa");
  const before = Number(await profit.getAttribute("data-cents"));

  const form = page.locator("form", { has: page.getByRole("button", { name: "Registrar gasto" }) });
  await form.getByLabel("Fecha").fill("2025-04-15");
  await form.getByLabel("Categoría").fill("Renta");
  await form.getByLabel("Tipo").selectOption("fixed");
  await form.getByLabel("Importe (pesos)").fill("1,234.50");
  await form.getByLabel("Descripción (opcional)").fill("Renta de abril (E2E)");
  await form.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(form.getByRole("status")).toHaveText("Gasto registrado.");

  await expect(profit).toHaveAttribute("data-cents", String(before - 123450));
  await expect(profit).toContainText(new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format((before - 123450) / 100));
  await expect(page.getByTestId("gasto").filter({ hasText: "Renta de abril (E2E)" })).toContainText("$1,234.50");
  const { rows } = await db.query(`select amount_cents, kind from expenses where description = 'Renta de abril (E2E)'`);
  expect(rows).toEqual([{ amount_cents: 123450, kind: "fixed" }]);

  // Importe inválido: error claro, sin registro.
  await form.getByLabel("Fecha").fill("2025-04-16");
  await form.getByLabel("Categoría").fill("Otros");
  await form.getByLabel("Importe (pesos)").fill("abc");
  await form.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(form.getByRole("alert")).toContainText("Importe inválido");

  // Eliminar el gasto restituye la utilidad.
  const item = page.getByTestId("gasto").filter({ hasText: "Renta de abril (E2E)" });
  await item.getByText("Editar o eliminar").click();
  page.once("dialog", (d) => d.accept());
  await item.getByRole("button", { name: "Eliminar" }).click();
  await expect(profit).toHaveAttribute("data-cents", String(before));
});

test("la rentabilidad por servicio lista un servicio completado", async ({ page }) => {
  const date = "2025-05-05"; // lunes
  await clearAppointmentsOn(date);
  const ana = await staffId(USERS.ana);
  const lava = await resourceOfType("lavacabezas");
  const [appt] = await asServer<{ id: string }>(`select public.create_appointment($1, null, $2::jsonb, null, 'reception', null) id`, [
    LOCATION,
    JSON.stringify([{ service_id: SERVICES.lavado, staff_id: ana, resource_ids: [lava], starts_at: `${date}T10:00:00-06:00` }]),
  ]);
  await asServer(`select public.complete_appointment($1)`, [appt!.id]);

  await login(page, USERS.owner);
  await page.goto(`/finanzas?${qs(MAY)}`);
  const row = page.getByTestId("rentabilidad-fila").filter({ hasText: "Lavado y peinado" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("$450.00");
  await expect(row).toContainText("100%");

  const csv = await page.request.get(`/finanzas/exportar/rentabilidad?${qs(MAY)}`);
  const text = (await csv.body()).subarray(3).toString("utf8");
  expect(text.split("\r\n")[0]).toBe("servicio,realizados,ingresos,materiales,costos_configurados,margen,margen_pct,minutos_promedio");
  expect(text).toContain("Lavado y peinado,1,450.00,0.00,0.00,450.00,100,45");
});
