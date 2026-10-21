import { expect, type Page, test } from "@playwright/test";
import { db, USERS } from "./helpers";
import { randomPhone, randomWorkday, staffId } from "./report-helpers";

// Servicio reservable en línea con anticipo (el seed no trae uno).
const DEPOSIT_SERVICE = "e2e00000-0000-4000-8000-000000000001";

test.beforeAll(async () => {
  const ana = await staffId(USERS.ana);
  await db.query(
    `insert into services (id, name, price_cents, duration_min, deposit_type, deposit_value, online_bookable)
     values ($1, 'Retoque con anticipo (E2E)', 80000, 60, 'fixed', 30000, true) on conflict (id) do nothing`,
    [DEPOSIT_SERVICE],
  );
  await db.query(`insert into staff_services (staff_id, service_id) values ($1, $2) on conflict do nothing`, [ana, DEPOSIT_SERVICE]);
  await db.query(
    `insert into service_resource_requirements (service_id, resource_type_id)
     select $1, id from resource_types where code = 'estacion' on conflict do nothing`,
    [DEPOSIT_SERVICE],
  );
});

/** Recorre el portal hasta el formulario de datos (servicio → fecha → primer horario). */
async function openForm(page: Page, serviceName: string, date = randomWorkday(10, 60)) {
  await page.goto("/reservar");
  await page.getByTestId("servicio").filter({ hasText: serviceName }).click();
  await page.getByLabel("Fecha").fill(date);
  await page.getByRole("button", { name: "Ver horarios" }).click();
  const slots = page.locator("section[aria-labelledby=horarios] a");
  await expect(slots.first()).toBeVisible();
  await slots.first().click();
  await expect(page.getByRole("heading", { name: "Tus datos" })).toBeVisible();
}

async function fill(page: Page, phone: string, opts: { privacy?: boolean } = {}) {
  await page.getByLabel("Nombre", { exact: true }).fill("Prueba Portal");
  await page.getByLabel("Teléfono celular").fill(phone);
  if (opts.privacy !== false) await page.getByRole("checkbox", { name: /aviso de privacidad/ }).check();
}

const clientCount = async (phone: string) =>
  Number((await db.query(`select count(*)::int n from clients where phone = $1`, [`+52${phone}`])).rows[0].n);

test("una clienta anónima reserva un servicio sin anticipo y queda confirmada con origen en línea", async ({ page }) => {
  const phone = randomPhone();
  await openForm(page, "Lavado y peinado");
  await fill(page, phone);
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page).toHaveURL(/\/reservar\/confirmacion\?id=/);
  await expect(page.getByRole("heading", { name: "¡Tu cita está confirmada!" })).toBeVisible();
  await expect(page.getByText("Lavado y peinado")).toBeVisible();

  const id = new URL(page.url()).searchParams.get("id");
  const { rows } = await db.query(
    `select a.source, a.booking_status, c.phone, c.acquisition_channel,
            (select array_agg(purpose::text order by purpose) from client_consents where client_id = c.id and granted) consents
       from appointments a join clients c on c.id = a.client_id where a.id = $1`,
    [id],
  );
  expect(rows[0]).toMatchObject({ source: "online", booking_status: "confirmed", phone: `+52${phone}`, acquisition_channel: "portal" });
  expect(rows[0].consents).toEqual(["privacy_notice", "appointment_reminders"]);
});

test("un servicio con anticipo queda como apartado con el aviso honesto de pago pendiente", async ({ page }) => {
  const phone = randomPhone();
  await openForm(page, "Retoque con anticipo (E2E)");
  await expect(page.getByText("El pago en línea aún no está habilitado")).toBeVisible();
  await fill(page, phone);
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page).toHaveURL(/\/reservar\/confirmacion\?id=/);
  const notice = page.getByTestId("pago-pendiente");
  await expect(notice).toContainText(/Apartado provisional hasta las \d{2}:\d{2}/);
  await expect(notice).toContainText("el pago en línea del anticipo aún no está habilitado; el salón te contactará para confirmarlo");
  await expect(notice).toContainText("$300.00");
  await expect(page.getByText("Pago pendiente")).toBeVisible();
  const id = new URL(page.url()).searchParams.get("id");
  const { rows } = await db.query(`select booking_status, deposit_required_cents, payment_status, source from appointments where id = $1`, [id]);
  expect(rows[0]).toEqual({ booking_status: "hold", deposit_required_cents: 30000, payment_status: "pending", source: "online" });
  // Nada simula un pago: no hay anticipos registrados.
  expect((await db.query(`select count(*)::int n from appointment_deposits where appointment_id = $1`, [id])).rows[0].n).toBe(0);
});

test("sin aceptar el aviso de privacidad se muestra error y no se crea nada", async ({ page }) => {
  const phone = randomPhone();
  await openForm(page, "Lavado y peinado");
  await fill(page, phone, { privacy: false });
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("Debes aceptar el aviso de privacidad.");
  await expect(page).toHaveURL(/\/reservar\?/);
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Prueba Portal"); // conserva lo escrito
  expect(await clientCount(phone)).toBe(0);
});

test("si el campo trampa viene lleno la solicitud se rechaza", async ({ page }) => {
  const phone = randomPhone();
  await openForm(page, "Lavado y peinado");
  await fill(page, phone);
  await page.locator('input[name="website"]').evaluate((el: HTMLInputElement) => {
    el.value = "http://spam.example";
  });
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("No pudimos procesar tu solicitud");
  expect(await clientCount(phone)).toBe(0);
});

test("el portal nunca muestra datos de clientas, ni con el teléfono de una existente", async ({ page }) => {
  await page.goto("/reservar");
  await expect(page.getByTestId("servicio").filter({ hasText: "Valoración de extensiones" })).toBeVisible();
  // La instalación exige valoración: se ofrece la valoración en su lugar.
  await expect(page.getByText("Requiere valoración")).toBeVisible();
  await expect(page.getByRole("link", { name: /Reservar valoración de extensiones/ })).toBeVisible();

  await openForm(page, "Lavado y peinado");
  await page.getByLabel("Nombre", { exact: true }).fill("Otra Persona");
  await page.getByLabel("Teléfono celular").fill("+520000000001"); // teléfono de "Clienta Demo Uno" (seed)
  await page.getByRole("checkbox", { name: /aviso de privacidad/ }).check();
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page).toHaveURL(/\/reservar\/confirmacion\?id=/);
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/Demo|Clienta|0000000001|Otra Persona/);

  // Confirmaciones de citas que no son en línea no se exponen.
  const { rows } = await db.query(`select id from appointments where source <> 'online' limit 1`);
  if (rows[0]) {
    await page.goto(`/reservar/confirmacion?id=${rows[0].id}`);
    await expect(page.getByText("No encontramos esa reserva")).toBeVisible();
  }
});
