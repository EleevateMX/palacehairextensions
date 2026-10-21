import "server-only";
import type { AppRole } from "@/lib/roles";
import type { CurrentStaff } from "@/lib/staff";
import type { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Roles que registran movimientos, catálogo, conteos y compras (la BD lo vuelve a validar). */
export const WRITE_ROLES: AppRole[] = ["owner", "admin", "inventory"];
/** Roles que pueden reservar/liberar material manualmente (ver reserve_stock). */
export const RESERVE_ROLES: AppRole[] = ["owner", "admin", "receptionist", "inventory", "sales"];

export const canWrite = (s: CurrentStaff) => WRITE_ROLES.includes(s.role);
/** El costo es visible para los mismos roles que v_variant_costs. */
export const canSeeCost = canWrite;
export const canReserve = (s: CurrentStaff) => RESERVE_ROLES.includes(s.role);

export const KIND_LABEL: Record<string, string> = {
  hair_extension: "Extensión de cabello",
  retail: "Producto de reventa",
  supply: "Insumo",
  tool: "Herramienta",
};
export const KINDS = Object.keys(KIND_LABEL);

export const UNIT_LABEL: Record<string, string> = {
  piece: "Pieza",
  pack: "Paquete",
  gram: "Gramo",
  ml: "Mililitro",
  bundle: "Bulto / cortina",
  strand: "Mechón",
  meter: "Metro",
};
export const UNITS = Object.keys(UNIT_LABEL);

export const MOVEMENT_LABEL: Record<string, string> = {
  initial: "Entrada inicial",
  purchase: "Compra",
  sale: "Venta",
  service_consumption: "Consumo en servicio",
  adjustment: "Ajuste",
  waste: "Merma",
  customer_return: "Devolución de clienta",
  supplier_return: "Devolución a proveedor",
  transfer_out: "Transferencia (salida)",
  transfer_in: "Transferencia (entrada)",
  count_adjustment: "Ajuste por conteo",
};

export const RESERVATION_SOURCE_LABEL: Record<string, string> = {
  appointment: "Cita",
  pos_cart: "Carrito de caja",
  online_order: "Pedido en línea",
  manual: "Manual",
};

export const PO_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  partial: "Recibida parcial",
  received: "Recibida",
  cancelled: "Cancelada",
};

export const COUNT_STATUS_LABEL: Record<string, string> = { open: "Abierto", applied: "Aplicado", cancelled: "Cancelado" };

/** Técnicas sugeridas (catálogo configurable en el cotizador). */
export const TECHNIQUES = ["cinta", "keratina", "microlink", "cosida", "clip", "halo"];

/** Cantidad numeric(12,3): hasta 3 decimales. */
export const QTY_RE = /^-?\d{1,9}(\.\d{1,3})?$/;

/** Muestra una cantidad sin ceros de relleno ("2.500" → "2.5"). */
export const qty = (v: unknown) => {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(n);
};

export const centsToPesosInput = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);

/** Desplazamiento (minutos) de una zona horaria en un instante dado. */
function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Fin del día local (23:59:59) de la sucursal → ISO UTC. */
export function endOfLocalDayIso(date: string, tz: string): string {
  const naive = new Date(`${date}T23:59:59Z`);
  const off = tzOffsetMinutes(tz, naive);
  return new Date(naive.getTime() - off * 60000).toISOString();
}

/** ISO → fecha local YYYY-MM-DD de la sucursal. */
export function localDate(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function dateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export interface Loc {
  id: string;
  name: string;
  timezone: string;
}

/** Sucursal de trabajo con su zona horaria, más el total de sucursales activas. */
export async function workingLocation(supabase: DB, staff: CurrentStaff): Promise<{ location: Loc | null; locations: Loc[] }> {
  const { data } = await supabase.from("locations").select("id, name, timezone").eq("is_active", true).order("name");
  const locations = (data ?? []) as Loc[];
  const location = locations.find((l) => l.id === staff.locationId) ?? locations[0] ?? null;
  return { location, locations };
}

export interface VariantOption {
  id: string;
  sku: string;
  name: string;
  product_name: string;
}

/** Variantes activas para listas de selección. */
export async function variantOptions(supabase: DB): Promise<VariantOption[]> {
  const { data } = await supabase
    .from("product_variants")
    .select("id, sku, name, products!inner(name)")
    .eq("is_active", true)
    .order("sku")
    .limit(1000);
  return (data ?? []).map((v: any) => ({ id: v.id, sku: v.sku, name: v.name, product_name: v.products?.name ?? "" }));
}

/** Escapa términos para filtros PostgREST `or()` / `ilike`. */
export const cleanTerm = (q: string) => q.replace(/[%,()*:."\\]/g, " ").trim();

/** Partidas máximas por orden de compra capturadas desde el formulario. */
export const MAX_PO_LINES = 30;
