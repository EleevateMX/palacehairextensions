import { type Page, expect } from "@playwright/test";
import { db } from "./helpers";

/** Datos del seed de desarrollo (supabase/seed.sql). */
export const SEED = {
  location: "00000000-0000-4000-8000-000000000001",
  variant4: "00000000-0000-4000-8000-000000000411", // Cinta 55 cm · tono 4 · $1,400
  sku4: "CIN-55-04",
  variantRep: "00000000-0000-4000-8000-000000000421", // Cinta de repuesto · $250
  maintenance: "00000000-0000-4000-8000-000000000303", // Mantenimiento de cinta · $1,200
  wash: "00000000-0000-4000-8000-000000000304", // Lavado y peinado · $450
};

export const uniq = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

export async function staffId(email: string): Promise<string> {
  const { rows } = await db.query(`select s.id from staff_members s join auth.users u on u.id = s.user_id where u.email = $1`, [email]);
  return rows[0].id;
}

export async function stockOf(variant: string): Promise<number> {
  const { rows } = await db.query(`select on_hand - reserved as available from stock_levels where variant_id = $1 and location_id = $2`, [
    variant,
    SEED.location,
  ]);
  return Number(rows[0]?.available ?? 0);
}

/** Entrada de inventario (movimiento real vía la función atómica) para que las pruebas sean repetibles. */
export async function addStock(variant: string, qty: number) {
  await db.query(`select app.apply_movement($1, $2, 'purchase', $3, 'e2e', null, 'Entrada de prueba E2E')`, [variant, SEED.location, qty]);
}

export async function openSession() {
  const { rows } = await db.query(`select id from cash_sessions where location_id = $1 and status = 'open'`, [SEED.location]);
  return rows[0]?.id as string | undefined;
}

/** Garantiza una caja abierta (la abre recepción directamente en la BD si no hay). */
export async function ensureCashOpen(): Promise<string> {
  const current = await openSession();
  if (current) return current;
  const { rows } = await db.query(
    `insert into cash_sessions (location_id, opened_by, opening_float_cents)
     values ($1, (select id from staff_members where role = 'receptionist' limit 1), 0) returning id`,
    [SEED.location],
  );
  return rows[0].id;
}

/** Cierra cualquier caja abierta de la sucursal (preparación de pruebas de caja). */
export async function closeAnyOpenCash() {
  await db.query(
    `update cash_sessions set status = 'closed', closed_at = now(), expected_cash_cents = 0, counted_cash_cents = 0, difference_cents = 0
      where location_id = $1 and status = 'open'`,
    [SEED.location],
  );
}

/** Ejecuta pos_checkout como servidor (service_role) para preparar ventas. */
export async function dbCheckout(p: Record<string, unknown>): Promise<string> {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const { rows } = await c.query(`select public.pos_checkout($1::jsonb) as r`, [JSON.stringify({ location_id: SEED.location, ...p })]);
    await c.query("commit");
    return rows[0].r.sale_id;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

export async function salesCount(): Promise<number> {
  const { rows } = await db.query(`select count(*)::int n from sales`);
  return rows[0].n;
}

export async function choosePayment(page: Page, n: number, method: "Efectivo" | "Tarjeta" | "Transferencia" | "Tarjeta de regalo") {
  await page.getByLabel(`Método (pago ${n})`).selectOption({ label: method });
}

export async function selectByText(page: Page, label: string, text: string) {
  const select = page.getByLabel(label, { exact: true });
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  if (value === null) throw new Error(`Opción "${text}" no encontrada en ${label}`);
  await select.selectOption(value);
}

/** Pulsa "Cobrar" y espera el comprobante; devuelve el id de la venta. */
export async function charge(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Cobrar", exact: true }).click();
  await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}
