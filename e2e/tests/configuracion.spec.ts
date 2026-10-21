import { expect, test } from "@playwright/test";
import { choose, db, login, USERS } from "./helpers";

const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

test.beforeEach(async ({ page }) => {
  // Confirmaciones de acciones destructivas (Desactivar, Quitar).
  page.on("dialog", (d) => d.accept());
});

test("configuración y personal funcionan a 360 px sin desplazamiento horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page, USERS.owner);
  const { rows } = await db.query(`select id from services order by name limit 1`);
  const { rows: people } = await db.query(`select id from staff_members where display_name = 'Ana (DEV)'`);
  for (const path of [
    "/configuracion",
    "/configuracion/horarios",
    "/configuracion/servicios",
    `/configuracion/servicios/${rows[0].id}`,
    "/configuracion/recursos",
    "/configuracion/cotizador",
    `/configuracion/comisiones?staff=${people[0].id}`,
    "/personal",
    `/personal/${people[0].id}`,
    "/personal/ausencias",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `desbordamiento horizontal en ${path}`).toBeLessThanOrEqual(0);
  }
});

test("recepción no puede abrir Configuración", async ({ page }) => {
  await login(page, USERS.reception);
  await expect(page.getByRole("link", { name: "Configuración" })).toHaveCount(0);
  for (const path of ["/configuracion", "/configuracion/servicios", "/configuracion/comisiones"]) {
    await page.goto(path);
    await expect(page.getByRole("alert").filter({ hasText: "No tienes permiso" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Guardar|Crear/ })).toHaveCount(0);
  }
});

test("la propietaria crea y edita un servicio y su personal capacitado", async ({ page }) => {
  const name = `Servicio E2E ${stamp()}`;
  await login(page, USERS.owner);
  await page.goto("/configuracion/servicios");
  await page.getByLabel("Nombre del servicio").fill(name);
  await page.getByLabel("Precio (MXN)").fill("800");
  await page.getByLabel("Duración (min)").fill("60");
  await page.getByRole("button", { name: "Crear y configurar" }).click();
  await expect(page).toHaveURL(/\/configuracion\/servicios\/[0-9a-f-]{36}\?nuevo=1/);
  const serviceId = page.url().match(/servicios\/([0-9a-f-]{36})/)![1]!;

  // Datos del servicio: precio, anticipo porcentual y activación.
  await page.getByLabel("Precio (MXN)").fill("1,250.50");
  await page.getByLabel("Limpieza (min)").fill("15");
  await page.locator('select[name="deposit_type"]').selectOption("percent");
  await page.getByLabel("Valor del anticipo").fill("30");
  await page.getByLabel("Activo", { exact: true }).check();
  await page.getByRole("button", { name: "Guardar servicio" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Servicio guardado." })).toBeVisible();

  // Personal capacitado con duración propia.
  await page.getByLabel("Capacitada: Ana (DEV)").check();
  await page.getByLabel("Duración de Ana (DEV)").fill("75");
  await page.getByLabel("Capacitada: Bea (DEV)").check();
  await page.getByLabel("Precio de Bea (DEV)").fill("900");
  await page.getByRole("button", { name: "Guardar personal capacitado" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Personal capacitado guardado (2)" })).toBeVisible();

  // Quitar a Bea.
  await page.reload();
  await expect(page.getByLabel("Capacitada: Bea (DEV)")).toBeChecked();
  await page.getByLabel("Capacitada: Bea (DEV)").uncheck();
  await page.getByRole("button", { name: "Guardar personal capacitado" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Personal capacitado guardado (1)" })).toBeVisible();

  // Material variable (cabello) y costo configurado.
  await page.locator('select[name="mode"]').selectOption("variable");
  await page.locator('select[name="material_role"]').selectOption("hair");
  await page.locator('form:has(select[name="mode"]) input[name="quantity"]').fill("2");
  await page.getByRole("button", { name: "Agregar material" }).click();
  await expect(page.getByText("Variable: se elige al reservar")).toBeVisible();
  await page.getByLabel("Concepto").fill("Mano de obra");
  await page.getByLabel("Importe (MXN)").fill("300");
  await page.getByRole("button", { name: "Agregar costo" }).click();
  await expect(page.getByText("Total por servicio: $300.00")).toBeVisible();

  const { rows: [svc] } = await db.query(`select price_cents, cleanup_min, deposit_type, deposit_value, is_active from services where id = $1`, [serviceId]);
  expect(svc).toEqual({ price_cents: 125050, cleanup_min: 15, deposit_type: "percent", deposit_value: 3000, is_active: true });
  const { rows: qualified } = await db.query(
    `select m.display_name, ss.duration_min from staff_services ss join staff_members m on m.id = ss.staff_id where ss.service_id = $1`,
    [serviceId],
  );
  expect(qualified).toEqual([{ display_name: "Ana (DEV)", duration_min: 75 }]);
  const { rows: mats } = await db.query(`select material_role, is_variable, quantity::float q from service_materials where service_id = $1`, [serviceId]);
  expect(mats).toEqual([{ material_role: "hair", is_variable: true, q: 2 }]);
});

test("validación: un servicio con valoración previa no puede reservarse en línea", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/configuracion/servicios");
  await page.getByRole("link", { name: "Instalación de extensiones de cinta" }).click();
  await page.getByLabel("Reservable en línea").check();
  await page.getByRole("button", { name: "Guardar servicio" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "no puede reservarse en línea" })).toBeVisible();
});

test("la propietaria crea una unidad de recurso y la desactiva", async ({ page }) => {
  const unit = `Estación E2E ${stamp()}`;
  await login(page, USERS.owner);
  await page.goto("/configuracion/recursos");
  await page.locator('select[name="resource_type_id"]').selectOption({ label: "Estación de trabajo" });
  await page.getByLabel("Nombre de la unidad").fill(unit);
  await page.getByRole("button", { name: "Crear unidad" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Recurso «${unit}» creado.` })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: unit });
  await expect(row.getByText("Activo")).toBeVisible();
  const { rows } = await db.query(
    `select r.is_active, t.code from resources r join resource_types t on t.id = r.resource_type_id where r.name = $1`,
    [unit],
  );
  expect(rows).toEqual([{ is_active: true, code: "estacion" }]);

  await row.getByRole("button", { name: "Desactivar" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: unit }).getByText("Inactivo")).toBeVisible();
  const { rows: after } = await db.query(`select is_active from resources where name = $1`, [unit]);
  expect(after[0].is_active).toBe(false);
});

test("la propietaria crea reglas de comisión (porcentaje y escalonada) y desactiva una", async ({ page }) => {
  const note = `E2E ${stamp()}`;
  await login(page, USERS.owner);
  await page.goto("/configuracion/comisiones");
  await choose(page, "Persona", "Bea (DEV)");
  await page.getByRole("button", { name: "Ver reglas" }).click();
  await expect(page.getByRole("heading", { name: "Reglas de Bea (DEV)" })).toBeVisible();

  const percent = page.locator("details").filter({ hasText: "% sobre servicios" });
  await percent.locator("summary").click();
  await percent.getByLabel("Porcentaje (%)").fill("12.5");
  await percent.getByLabel("Notas (opcional)").fill(note);
  await percent.getByRole("button", { name: "Crear regla" }).click();
  await expect(percent.getByRole("status")).toContainText("Regla de comisión creada.");
  await expect(page.getByRole("listitem").filter({ hasText: note }).first()).toContainText("12.5 % sobre servicios (todos los servicios)");

  const tiered = page.locator("details").filter({ hasText: "Escalonada por tramos" });
  await tiered.locator("summary").click();
  await tiered.getByLabel("Tasa (%) tramo 1").fill("5");
  await tiered.getByRole("button", { name: "Agregar tramo" }).click();
  await tiered.getByLabel("Desde (MXN) tramo 2").fill("10000");
  await tiered.getByLabel("Tasa (%) tramo 2").fill("8");
  await tiered.getByLabel("Notas (opcional)").fill(`${note} tramos`);
  await tiered.getByRole("button", { name: "Crear regla" }).click();
  await expect(tiered.getByRole("status")).toContainText("Regla de comisión creada.");
  await expect(page.getByRole("listitem").filter({ hasText: `${note} tramos` })).toContainText(/desde \$10,000\.00 → 8 %/);

  const { rows } = await db.query(
    `select r.rule from commission_rules r join staff_members m on m.id = r.staff_id where m.display_name = 'Bea (DEV)' and r.notes like $1 order by r.created_at`,
    [`${note}%`],
  );
  expect(rows.map((r) => r.rule)).toEqual([
    { kind: "percent_service", bps: 1250 },
    { kind: "tiered", base: "services", marginal: false, tiers: [{ fromCents: 0, bps: 500 }, { fromCents: 1_000_000, bps: 800 }] },
  ]);

  // Validación: porcentaje inválido.
  if ((await percent.getAttribute("open")) === null) await percent.locator("summary").click();
  await percent.getByLabel("Porcentaje (%)").fill("150");
  await percent.getByRole("button", { name: "Crear regla" }).click();
  await expect(percent.getByRole("alert")).toContainText("Porcentaje");

  const item = page.getByRole("listitem").filter({ hasText: `${note} tramos` });
  await item.getByRole("button", { name: "Desactivar" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `${note} tramos` }).getByText("Inactiva")).toBeVisible();
});

test("horarios: días especiales y validación de rangos traslapados", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/configuracion/horarios");
  const label = `Festivo E2E ${stamp()}`;
  const year = 2031 + Math.floor(Math.random() * 20);
  await page.getByLabel("Fecha").fill(`${year}-12-25`);
  await page.getByLabel("Motivo").fill(label);
  await page.getByRole("button", { name: "Agregar día especial" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: label })).toContainText("Cerrado");

  // Un rango traslapado se rechaza sin modificar el horario guardado.
  const before = await db.query(`select count(*)::int n from business_hours`);
  await page.getByRole("button", { name: "Agregar rango" }).nth(1).click(); // martes
  await page.getByLabel("Abre Martes 2").fill("12:00");
  await page.getByLabel("Cierra Martes 2").fill("15:00");
  await page.getByRole("button", { name: "Guardar horario semanal" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Martes: hay rangos que se traslapan" })).toBeVisible();
  const after = await db.query(`select count(*)::int n from business_hours`);
  expect(after.rows[0].n).toBe(before.rows[0].n);

  await page.getByRole("listitem").filter({ hasText: label }).getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: label })).toHaveCount(0);
});

test("cotizador: muestra el aviso de ejemplo y guarda la variación del rango", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/configuracion/cotizador");
  await expect(page.getByRole("note")).toContainText("Valores de EJEMPLO");
  await page.getByLabel("Variación ± (%)").fill("12");
  await page.getByRole("button", { name: "Guardar cotizador" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuración del cotizador guardada." })).toBeVisible();
  const { rows } = await db.query(`select quote_config from business_settings where id = 1`);
  expect(rows[0].quote_config.rangeBps).toBe(1200);
  expect(rows[0].quote_config.example).toBe(true);
  expect(Object.keys(rows[0].quote_config.techniques)).toContain("keratina");
  await page.getByLabel("Variación ± (%)").fill("15");
  await page.getByRole("button", { name: "Guardar cotizador" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuración del cotizador guardada." })).toBeVisible();
});
