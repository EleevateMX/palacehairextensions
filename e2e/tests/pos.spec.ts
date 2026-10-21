import { expect, test } from "@playwright/test";
import { db, login, USERS } from "./helpers";
import { SEED, addStock, charge, choosePayment, ensureCashOpen, salesCount, selectByText, staffId, stockOf, uniq } from "./pos-helpers";

test.beforeAll(async () => {
  await ensureCashOpen();
  await addStock(SEED.variant4, 10);
});

test("recepción vende producto + servicio con pago dividido (efectivo + tarjeta) y propina", async ({ page }) => {
  const before = await stockOf(SEED.variant4);
  const ref = uniq("T");
  await login(page, USERS.reception);
  await page.goto("/pos");
  // Escáner: SKU + Enter agrega el producto.
  await page.getByLabel("Código de barras o SKU").fill(SEED.sku4);
  await page.getByLabel("Código de barras o SKU").press("Enter");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await selectByText(page, "Servicio", "Mantenimiento de cinta");
  await page.getByRole("button", { name: "Agregar servicio" }).click();
  await selectByText(page, "Especialista de Mantenimiento de cinta", "Ana");
  // Recepción no ve controles de descuento.
  await expect(page.getByLabel(/^Descuento de/)).toHaveCount(0);
  await expect(page.getByTestId("total-preview")).toHaveText("$2,600.00");

  await page.getByLabel("Importe (pago 1)").fill("1000");
  await page.getByLabel("Efectivo recibido (pago 1)").fill("1200");
  await page.getByLabel("Propina (pago 1)").fill("100");
  await selectByText(page, "Propina para (pago 1)", "Ana");
  await expect(page.getByTestId("change")).toContainText("$100.00");
  await page.getByRole("button", { name: "Agregar pago" }).click();
  await choosePayment(page, 2, "Tarjeta");
  await page.getByLabel("Restante (pago 2)").click();
  await expect(page.getByLabel("Importe (pago 2)")).toHaveValue("1600.00");
  await page.getByLabel("Referencia de terminal (pago 2)").fill(ref);
  const saleId = await charge(page);

  await expect(page.getByTestId("sale-total")).toHaveText("$2,600.00");
  await expect(page.getByTestId("sale-payment")).toHaveCount(2);
  const { rows } = await db.query(`select total_cents, paid_cents, tip_cents, balance_due_cents, cash_session_id from sales where id = $1`, [saleId]);
  expect(rows[0]).toMatchObject({ total_cents: 260000, paid_cents: 260000, tip_cents: 10000, balance_due_cents: 0 });
  expect(rows[0].cash_session_id).toBeTruthy();
  const pays = await db.query(`select method, amount_cents, tip_cents, tip_staff_id, provider_ref from sale_payments where sale_id = $1 order by amount_cents`, [saleId]);
  expect(pays.rows).toEqual([
    { method: "cash", amount_cents: 100000, tip_cents: 10000, tip_staff_id: await staffId(USERS.ana), provider_ref: null },
    { method: "card", amount_cents: 160000, tip_cents: 0, tip_staff_id: null, provider_ref: ref },
  ]);
  const lines = await db.query(`select kind, staff_id from sale_lines where sale_id = $1 and kind = 'service'`, [saleId]);
  expect(lines.rows[0].staff_id).toBe(await staffId(USERS.ana));
  expect(await stockOf(SEED.variant4)).toBe(before - 1);
});

test("doble clic en «Cobrar» crea una sola venta (idempotencia)", async ({ page }) => {
  const before = await salesCount();
  await login(page, USERS.reception);
  await page.goto("/pos");
  await page.getByLabel("Buscar producto").fill("tono 4");
  await page.getByRole("button", { name: "Agregar Cinta 55 cm · tono 4" }).click();
  await page.getByLabel("Restante (pago 1)").click();
  await page.getByRole("button", { name: "Cobrar", exact: true }).dblclick();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("sale-total")).toHaveText("$1,400.00");
  // Margen para que cualquier segunda petición termine antes de contar.
  await page.waitForTimeout(1500);
  expect(await salesCount()).toBe(before + 1);
});

test("recepción no tiene descuento y el servidor lo rechaza; la propietaria sí lo aplica", async ({ page }) => {
  // El servidor rechaza un descuento enviado con la sesión de recepción aunque se manipule la petición.
  const { rows: users } = await db.query(`select id from auth.users where email = $1`, [USERS.reception]);
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: users[0].id, role: "authenticated" })]);
    await c.query("set local role authenticated");
    await expect(
      c.query(`select public.pos_checkout($1::jsonb)`, [
        JSON.stringify({
          location_id: SEED.location,
          lines: [{ kind: "service", service_id: SEED.wash, discount_cents: 10000 }],
          payments: [{ method: "cash", amount_cents: 35000 }],
        }),
      ]),
    ).rejects.toThrow("DISCOUNT_NOT_AUTHORIZED");
  } finally {
    await c.query("rollback");
    c.release();
  }

  await login(page, USERS.owner);
  await page.goto("/pos");
  await selectByText(page, "Servicio", "Mantenimiento de cinta");
  await page.getByRole("button", { name: "Agregar servicio" }).click();
  await page.getByLabel("Descuento de Mantenimiento de cinta").fill("200");
  await expect(page.getByTestId("total-preview")).toHaveText("$1,000.00");
  await page.getByLabel("Restante (pago 1)").click();
  const saleId = await charge(page);
  const { rows } = await db.query(`select total_cents, discount_cents, discount_authorized_by from sales where id = $1`, [saleId]);
  expect(rows[0]).toMatchObject({ total_cents: 100000, discount_cents: 20000 });
});

test("cupón válido aplica descuento a la venta", async ({ page }) => {
  const code = uniq("BIENVENIDA").toUpperCase();
  await db.query(`insert into coupons (code, kind, value) values ($1, 'percent', 1000)`, [code]);
  await login(page, USERS.reception);
  await page.goto("/pos");
  await selectByText(page, "Servicio", "Lavado y peinado");
  await page.getByRole("button", { name: "Agregar servicio" }).click();
  await page.getByLabel("Código de cupón").fill("CUPON-QUE-NO-EXISTE");
  await page.getByRole("button", { name: "Aplicar cupón" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Cupón inválido" })).toBeVisible();
  await page.getByLabel("Código de cupón").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Aplicar cupón" }).click();
  await expect(page.getByText(`Cupón ${code} aplicado`)).toBeVisible();
  await expect(page.getByTestId("total-preview")).toHaveText("$405.00");
  await page.getByLabel("Restante (pago 1)").click();
  const saleId = await charge(page);
  const { rows } = await db.query(`select s.total_cents, s.discount_cents, c.code, c.used_count from sales s join coupons c on c.id = s.coupon_id where s.id = $1`, [saleId]);
  expect(rows[0]).toMatchObject({ total_cents: 40500, discount_cents: 4500, code, used_count: 1 });
});

test("venta con saldo pendiente para una clienta y después se abona el saldo", async ({ page }) => {
  await login(page, USERS.reception);
  await page.goto("/pos");
  await selectByText(page, "Servicio", "Mantenimiento de cinta");
  await page.getByRole("button", { name: "Agregar servicio" }).click();
  await page.getByLabel("Importe (pago 1)").fill("500");
  // Sin marcar saldo pendiente no deja cobrar.
  await page.getByRole("button", { name: "Cobrar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Faltan $700.00" })).toBeVisible();
  await page.getByLabel("Dejar saldo pendiente").check();
  await page.getByRole("button", { name: "Cobrar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "selecciona a la clienta" })).toBeVisible();
  await page.getByLabel("Buscar clienta").fill("Demo Uno");
  await page.getByRole("button", { name: /Clienta Demo Uno/ }).click();
  await expect(page.getByTestId("selected-client")).toHaveText("Clienta Demo Uno");
  const saleId = await charge(page);
  await expect(page.getByTestId("sale-balance")).toHaveText("$700.00");

  // Aparece en cuentas pendientes.
  await page.goto("/ventas?pendientes=1");
  await expect(page.locator(`a[href="/ventas/${saleId}"]:visible`).first()).toBeVisible();
  await page.goto(`/ventas/${saleId}`);
  await expect(page.getByLabel("Importe del abono")).toHaveValue("700.00");
  await page.getByRole("button", { name: "Registrar abono" }).click();
  await expect(page.getByText("La cuenta quedó liquidada")).toBeVisible();
  await expect(page.getByTestId("sale-balance")).toHaveText("$0.00");
  const { rows } = await db.query(
    `select s.balance_due_cents, s.paid_cents, p.cash_session_id from sales s join sale_payments p on p.sale_id = s.id
      where s.id = $1 and p.amount_cents = 70000`,
    [saleId],
  );
  expect(rows[0]).toMatchObject({ balance_due_cents: 0, paid_cents: 120000 });
  expect(rows[0].cash_session_id).toBeTruthy();
});

test("se vende una tarjeta de regalo y después se usa como pago", async ({ page }) => {
  await login(page, USERS.reception);
  await page.goto("/pos");
  await page.getByLabel("Importe de la tarjeta de regalo").fill("300");
  await page.getByRole("button", { name: "Agregar tarjeta de regalo" }).click();
  await page.getByLabel("Restante (pago 1)").click();
  await charge(page);
  const code = (await page.getByTestId("gift-card-code").textContent())!.trim();
  expect(code).toMatch(/^[0-9A-F]{12}$/);

  await page.goto("/pos");
  await selectByText(page, "Servicio", "Lavado y peinado");
  await page.getByRole("button", { name: "Agregar servicio" }).click();
  await choosePayment(page, 1, "Tarjeta de regalo");
  await page.getByLabel("Código de tarjeta (pago 1)").fill(code.toLowerCase());
  await page.getByLabel("Consultar saldo (pago 1)").click();
  await expect(page.getByText("Saldo disponible: $300.00")).toBeVisible();
  await expect(page.getByLabel("Importe (pago 1)")).toHaveValue("300.00");
  await page.getByRole("button", { name: "Agregar pago" }).click();
  await page.getByLabel("Restante (pago 2)").click();
  await page.getByLabel("Referencia de terminal (pago 2)").fill(uniq("T"));
  const saleId = await charge(page);
  const { rows } = await db.query(`select balance_cents from gift_cards where code = $1`, [code]);
  expect(rows[0].balance_cents).toBe(0);
  const pays = await db.query(`select method, amount_cents from sale_payments where sale_id = $1 order by amount_cents desc`, [saleId]);
  expect(pays.rows).toEqual([
    { method: "gift_card", amount_cents: 30000 },
    { method: "card", amount_cents: 15000 },
  ]);
});

test("cobro desde una cita con anticipo aplica el anticipo y marca la cita pagada", async ({ page }) => {
  const ana = await staffId(USERS.ana);
  const { rows: cl } = await db.query(`select id from clients where last_name = 'Demo Uno' limit 1`);
  const { rows: ap } = await db.query(
    `insert into appointments (location_id, client_id, starts_at, ends_at, payment_status, deposit_required_cents)
     values ($1, $2, now() + interval '1 hour', now() + interval '150 minutes', 'deposit_paid', 30000) returning id`,
    [SEED.location, cl[0].id],
  );
  const appt = ap[0].id as string;
  await db.query(
    `insert into appointment_services (appointment_id, service_id, staff_id, starts_at, ends_at, price_cents)
     values ($1, $2, $3, now() + interval '1 hour', now() + interval '150 minutes', 120000)`,
    [appt, SEED.maintenance, ana],
  );
  const { rows: dep } = await db.query(
    `insert into appointment_deposits (appointment_id, amount_cents, method) values ($1, 30000, 'transfer') returning id`,
    [appt],
  );

  await login(page, USERS.reception);
  await page.goto(`/pos?appointment=${appt}`);
  await expect(page.getByTestId("selected-client")).toHaveText("Clienta Demo Uno");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByLabel("Especialista de Mantenimiento de cinta")).toHaveValue(ana);
  await expect(page.getByText("Anticipo recibido (Transferencia)")).toBeVisible();
  await page.getByLabel("Restante (pago 2)").click();
  await expect(page.getByLabel("Importe (pago 2)")).toHaveValue("900.00");
  const saleId = await charge(page);

  const { rows: d } = await db.query(`select status, applied_sale_id from appointment_deposits where id = $1`, [dep[0].id]);
  expect(d[0]).toEqual({ status: "applied", applied_sale_id: saleId });
  const { rows: a } = await db.query(`select payment_status from appointments where id = $1`, [appt]);
  expect(a[0].payment_status).toBe("paid");
  const { rows: s } = await db.query(`select appointment_id, client_id, total_cents from sales where id = $1`, [saleId]);
  expect(s[0]).toEqual({ appointment_id: appt, client_id: cl[0].id, total_cents: 120000 });
});
