import { expect, type Page, test } from "@playwright/test";
import { choose, db, login, USERS } from "./helpers";

const TONE_4 = "00000000-0000-4000-8000-000000000411";
const LOCATION = "00000000-0000-4000-8000-000000000001";

/** Teléfono de 10 dígitos único por ejecución. */
const uniquePhone = () => `55${String(Date.now()).slice(-8)}`;

/** Crea una clienta directamente en la BD con la función del servidor (identidad service_role). */
async function seedClient(firstName: string, lastName: string) {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const r = await c.query(`select public.create_client_with_consents($1::jsonb) as id`, [
      JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        phone: `+52${uniquePhone()}`,
        consents: { privacy_notice: true, appointment_reminders: true, photos_internal: false },
      }),
    ]);
    await c.query("commit");
    return r.rows[0].id as string;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

async function staffId(email: string) {
  const { rows } = await db.query(`select s.id from staff_members s join auth.users u on u.id = s.user_id where u.email = $1`, [email]);
  return rows[0].id as string;
}

async function switchUser(page: Page, email: string) {
  await page.context().clearCookies();
  await login(page, email);
}

test("recepción registra una clienta con consentimientos y edita su perfil capilar", async ({ page }) => {
  const phone = uniquePhone();
  await login(page, USERS.reception);
  await page.goto("/clientes");
  await page.getByRole("link", { name: "Nueva clienta" }).click();
  await expect(page).toHaveURL(/\/clientes\/nueva$/);
  await page.getByLabel("Nombre", { exact: true }).fill("Mariana");
  await page.getByLabel("Apellidos").fill(`Prueba ${phone}`);
  await page.getByLabel(/^Teléfono/).fill(`${phone.slice(0, 2)} ${phone.slice(2, 6)} ${phone.slice(6)}`);
  await page.getByLabel(/^Aviso de privacidad/).check();
  await page.getByLabel("Promociones por WhatsApp").check();
  await page.getByRole("button", { name: "Registrar clienta" }).click();
  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}\?tab=perfil/);
  await expect(page.getByRole("heading", { name: `Mariana Prueba ${phone}` })).toBeVisible();
  const id = page.url().match(/clientes\/([0-9a-f-]{36})/)![1]!;

  const { rows: client } = await db.query(`select phone from clients where id = $1`, [id]);
  expect(client[0].phone).toBe(`+52${phone}`);
  const { rows: consents } = await db.query(
    `select purpose::text, granted, source from client_consents where client_id = $1 order by purpose`,
    [id],
  );
  expect(consents).toHaveLength(6);
  expect(consents.every((c) => c.source === "recepcion")).toBe(true);
  const granted = Object.fromEntries(consents.map((c) => [c.purpose, c.granted]));
  expect(granted).toMatchObject({ privacy_notice: true, appointment_reminders: true, marketing_whatsapp: true, photos_marketing: false });

  // Edición del perfil capilar.
  await page.getByLabel("Tono", { exact: true }).fill("613");
  await choose(page, "Técnica de extensiones", "Microlink");
  await page.getByLabel("Largo (cm)").fill("60");
  await page.getByLabel("Preferencias de estilo").fill("Ondas suaves, sin flequillo");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText("Perfil actualizado.")).toBeVisible();
  const { rows: edited } = await db.query(`select hair_tone, extension_technique, extension_length_cm::float len, style_preferences from clients where id = $1`, [id]);
  expect(edited[0]).toMatchObject({ hair_tone: "613", extension_technique: "microlink", len: 60, style_preferences: "Ondas suaves, sin flequillo" });

  // La búsqueda la encuentra por teléfono.
  await page.goto(`/clientes?q=${phone.slice(2)}`);
  await expect(page.getByRole("link", { name: new RegExp(`Mariana Prueba ${phone}`) })).toBeVisible();
});

test("revocar un consentimiento agrega una fila al historial", async ({ page }) => {
  const id = await seedClient("Revoca", `Consentimiento ${Date.now()}`);
  await login(page, USERS.reception);
  await page.goto(`/clientes/${id}?tab=consentimientos`);
  const row = page.getByRole("list", { name: "Consentimientos vigentes" }).getByRole("listitem").filter({ hasText: "Recordatorios de citas" });
  await expect(row.getByText("Otorgado", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Revocar" }).click();
  await expect(row.getByText("Revocado", { exact: true })).toBeVisible();
  await expect(row.getByText("Consentimiento revocado.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Historial de consentimientos" }).getByRole("listitem")).toHaveCount(7);

  const { rows } = await db.query(
    `select granted, recorded_by from client_consents where client_id = $1 and purpose = 'appointment_reminders' order by recorded_at`,
    [id],
  );
  expect(rows.map((r) => r.granted)).toEqual([true, false]);
  expect(rows[1].recorded_by).toBe(await staffId(USERS.reception));
});

test("recepción no ve la nota sensible que registró la propietaria", async ({ page }) => {
  const id = await seedClient("Nota", `Sensible ${Date.now()}`);
  const secret = `Alergia a adhesivo ${Date.now()}`;
  await login(page, USERS.owner);
  await page.goto(`/clientes/${id}?tab=notas`);
  await page.getByLabel("Nota", { exact: true }).fill(secret);
  await choose(page, "Tipo de nota", "Sensible");
  await page.getByRole("button", { name: "Guardar nota" }).click();
  const notes = page.getByRole("list", { name: "Notas de la clienta" });
  await expect(notes.getByText(secret)).toBeVisible();
  await expect(notes.getByText("Sensible")).toBeVisible();

  await switchUser(page, USERS.reception);
  await page.goto(`/clientes/${id}?tab=notas`);
  await expect(page.getByText("Las notas sensibles no se muestran a tu rol.")).toBeVisible();
  await expect(page.getByText(secret)).toHaveCount(0);
  await expect(page.getByLabel("Tipo de nota")).toHaveCount(0);
  const { rows } = await db.query(`select count(*)::int n from client_notes where client_id = $1 and sensitivity = 'sensitive'`, [id]);
  expect(rows[0].n).toBe(1);
});

test("inventarios no ve clientas", async ({ page }) => {
  const id = await seedClient("Oculta", `Inventario ${Date.now()}`);
  await login(page, USERS.inventory);
  await page.goto("/clientes");
  await expect(page.getByText("Tu rol no tiene acceso a clientas")).toBeVisible();
  await expect(page.getByText("Demo Uno")).toHaveCount(0);
  await page.goto(`/clientes/${id}`);
  await expect(page.getByText("Tu rol no tiene acceso a clientas")).toBeVisible();
  await expect(page.getByText("Oculta")).toHaveCount(0);
});

test("apartar un tono desde el expediente reserva existencias y liberarlo las devuelve", async ({ page }) => {
  const id = await seedClient("Aparta", `Tono ${Date.now()}`);
  const reserved = async () =>
    Number((await db.query(`select reserved from stock_levels where variant_id = $1 and location_id = $2`, [TONE_4, LOCATION])).rows[0].reserved);
  const before = await reserved();

  await login(page, USERS.reception);
  await page.goto(`/clientes/${id}?tab=inventario`);
  await expect(page.getByText("Sin inventario apartado")).toBeVisible();
  await choose(page, "Producto o tono", "DEV-CIN-55-04");
  await page.getByLabel("Cantidad").fill("2");
  await page.getByRole("button", { name: "Apartar" }).click();
  await expect(page.getByText("Se apartaron 2 para la clienta.")).toBeVisible();
  const active = page.getByRole("list", { name: "Apartados activos" });
  await expect(active.getByText(/Cinta 55 cm · tono 4/)).toBeVisible();
  expect(await reserved()).toBe(before + 2);
  const { rows } = await db.query(`select id, quantity::float q from stock_reservations where client_id = $1 and status = 'active'`, [id]);
  expect(rows).toHaveLength(1);
  expect(rows[0].q).toBe(2);

  page.once("dialog", (d) => d.accept());
  await active.getByRole("button", { name: "Liberar" }).click();
  await expect(page.getByText("Sin inventario apartado")).toBeVisible();
  expect(await reserved()).toBe(before);
  const { rows: after } = await db.query(`select status::text from stock_reservations where id = $1`, [rows[0].id]);
  expect(after[0].status).toBe("released");
});

test("la propietaria anonimiza a una clienta", async ({ page }) => {
  const last = `Anonimizar ${Date.now()}`;
  const id = await seedClient("Borrar", last);
  await login(page, USERS.owner);
  await page.goto(`/clientes/${id}?tab=privacidad`);
  await expect(page.getByText("Derechos ARCO")).toBeVisible();
  await page.getByLabel("Escribe ANONIMIZAR para confirmar").fill("ANONIMIZAR");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Anonimizar clienta" }).click();
  await expect(page.getByText("Este expediente ya fue anonimizado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Anonimizada" })).toBeVisible();
  const { rows } = await db.query(`select first_name, last_name, phone, is_anonymized from clients where id = $1`, [id]);
  expect(rows[0]).toMatchObject({ first_name: "Anonimizada", last_name: null, phone: null, is_anonymized: true });
  await page.goto(`/clientes?q=${encodeURIComponent(last)}`);
  await expect(page.getByText("Sin resultados")).toBeVisible();
});

test("recepción no ve la pestaña de privacidad", async ({ page }) => {
  const id = await seedClient("Sin", `Privacidad ${Date.now()}`);
  await login(page, USERS.reception);
  await page.goto(`/clientes/${id}?tab=privacidad`);
  await expect(page.getByRole("link", { name: "Privacidad" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Anonimizar clienta" })).toHaveCount(0);
});
