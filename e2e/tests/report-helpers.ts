import { db } from "./helpers";

/** Utilidades de preparación para reportes, finanzas y portal (solo stack local). */
export const LOCATION = "00000000-0000-4000-8000-000000000001";
export const SERVICES = {
  valoracion: "00000000-0000-4000-8000-000000000301",
  mantenimiento: "00000000-0000-4000-8000-000000000303",
  lavado: "00000000-0000-4000-8000-000000000304",
};

export async function staffId(email: string): Promise<string> {
  const { rows } = await db.query(`select s.id from staff_members s join auth.users u on u.id = s.user_id where u.email = $1`, [email]);
  if (!rows[0]) throw new Error(`Sin personal ${email}`);
  return rows[0].id;
}

/** Ejecuta SQL con identidad de servidor (service_role): las RPC validan rol con los claims del JWT. */
export async function asServer<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r.rows as T[];
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Instantes del periodo local [desde, hasta] en la zona del salón. */
const bounds = (from: string, to: string) => [`${from}T00:00:00-06:00`, `${to}T23:59:59.999-06:00`];

/** Borra las ventas del periodo (y sus líneas/pagos) para que cada corrida empiece limpia. */
export async function clearSales(from: string, to: string) {
  const [a, b] = bounds(from, to);
  await db.query(
    `update appointment_deposits set applied_sale_id = null where applied_sale_id in (select id from sales where created_at between $1 and $2)`,
    [a, b],
  );
  await db.query(`delete from refunds where sale_id in (select id from sales where created_at between $1 and $2)`, [a, b]);
  await db.query(`delete from sales where created_at between $1 and $2`, [a, b]);
}

/** Crea una venta por la RPC real y la fecha en `iso`. */
export async function sale(p: Record<string, unknown>, iso: string): Promise<string> {
  const [r] = await asServer<{ r: { sale_id: string } }>(`select public.pos_checkout($1::jsonb) r`, [JSON.stringify({ location_id: LOCATION, ...p })]);
  await db.query(`update sales set created_at = $2 where id = $1`, [r!.r.sale_id, iso]);
  return r!.r.sale_id;
}

/** Borra citas de un día local (con sus dependencias) para reutilizar horarios entre corridas. */
export async function clearAppointmentsOn(date: string) {
  const [a, b] = bounds(date, date);
  const ids = `(select id from appointments where starts_at between '${a}' and '${b}')`;
  await db.query(`delete from maintenance_reminders where appointment_id in ${ids}`);
  await db.query(`delete from stock_reservations where appointment_id in ${ids}`);
  await db.query(`delete from appointment_deposits where appointment_id in ${ids}`);
  await db.query(`update sales set appointment_id = null where appointment_id in ${ids}`);
  await db.query(`delete from appointments where starts_at between $1 and $2`, [a, b]);
}

export async function resourceOfType(code: string): Promise<string> {
  const { rows } = await db.query(
    `select r.id from resources r join resource_types t on t.id = r.resource_type_id where t.code = $1 and r.location_id = $2 order by r.name limit 1`,
    [code, LOCATION],
  );
  return rows[0].id;
}

export const randomPhone = () => `55${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

/** Día hábil (lun–sáb) aleatorio entre `min` y `min + spread` días: reduce choques entre corridas. */
export function randomWorkday(min: number, spread: number): string {
  const d = new Date(Date.now() + (min + Math.floor(Math.random() * spread)) * 86_400_000);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
