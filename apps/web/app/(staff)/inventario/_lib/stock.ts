import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { cleanTerm, KINDS } from "./shared";

type DB = Awaited<ReturnType<typeof createClient>>;

export interface StockFilters {
  q?: string;
  kind?: string;
  tone?: string;
  length?: string;
  texture?: string;
  technique?: string;
  low?: string;
  inactive?: string;
}

export interface StockRow {
  variant_id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  variant_name: string;
  kind: string;
  technique: string | null;
  tone: string | null;
  length_cm: number | null;
  texture: string | null;
  unit: string;
  on_hand: number;
  reserved: number;
  available: number;
  min_stock: number;
  is_low: boolean;
  is_active: boolean;
  bin_location: string | null;
  price_cents: number;
  cost_cents: number | null;
  margin_pct: number | null;
}

/**
 * Existencias por variante en la sucursal, incluidas las variantes sin movimientos (existencia 0).
 * Lee con la sesión de la persona: RLS aplica. El costo solo se consulta si `withCost`
 * (y aun así v_variant_costs devuelve vacío a roles no autorizados).
 */
export async function loadStock(
  supabase: DB,
  locationId: string,
  f: StockFilters,
  withCost: boolean,
): Promise<{ rows: StockRow[]; error: boolean }> {
  let query = supabase
    .from("product_variants")
    .select(
      "id, product_id, sku, barcode, name, tone, length_cm, texture, unit, price_cents, min_stock, is_active, products!inner(name, kind, technique, is_active), stock_levels(location_id, on_hand, reserved, bin_location)",
    )
    .eq("stock_levels.location_id", locationId)
    .order("sku")
    .limit(1000);
  if (f.inactive !== "1") query = query.eq("is_active", true).eq("products.is_active", true);
  if (f.kind && KINDS.includes(f.kind)) query = query.eq("products.kind", f.kind);
  if (f.technique) query = query.ilike("products.technique", cleanTerm(f.technique));
  if (f.tone) query = query.ilike("tone", cleanTerm(f.tone));
  if (f.texture) query = query.ilike("texture", cleanTerm(f.texture));
  if (f.length && /^\d+(\.\d)?$/.test(f.length)) query = query.eq("length_cm", f.length);
  if (f.q) {
    const term = cleanTerm(f.q);
    if (term) {
      const { data: prods } = await supabase.from("products").select("id").ilike("name", `%${term}%`).limit(200);
      const ids = (prods ?? []).map((p: { id: string }) => p.id);
      const ors = [`name.ilike.%${term}%`, `sku.ilike.%${term}%`, `barcode.eq.${term}`, `tone.ilike.%${term}%`];
      if (ids.length) ors.push(`product_id.in.(${ids.join(",")})`);
      query = query.or(ors.join(","));
    }
  }
  const { data, error } = await query;
  if (error) return { rows: [], error: true };

  let costs = new Map<string, { cost_cents: number; margin_pct: number | null }>();
  if (withCost && (data ?? []).length) {
    const { data: c } = await supabase.from("v_variant_costs").select("variant_id, cost_cents, margin_pct");
    costs = new Map((c ?? []).map((r: any) => [r.variant_id, { cost_cents: r.cost_cents, margin_pct: r.margin_pct === null ? null : Number(r.margin_pct) }]));
  }

  let rows: StockRow[] = (data ?? []).map((v: any) => {
    const s = (v.stock_levels ?? [])[0];
    const onHand = Number(s?.on_hand ?? 0);
    const reserved = Number(s?.reserved ?? 0);
    const available = onHand - reserved;
    const min = Number(v.min_stock ?? 0);
    const c = costs.get(v.id);
    return {
      variant_id: v.id,
      product_id: v.product_id,
      sku: v.sku,
      barcode: v.barcode,
      product_name: v.products?.name ?? "",
      variant_name: v.name,
      kind: v.products?.kind ?? "",
      technique: v.products?.technique ?? null,
      tone: v.tone,
      length_cm: v.length_cm === null ? null : Number(v.length_cm),
      texture: v.texture,
      unit: v.unit,
      on_hand: onHand,
      reserved,
      available,
      min_stock: min,
      is_low: available <= min,
      is_active: v.is_active && v.products?.is_active,
      bin_location: s?.bin_location ?? null,
      price_cents: v.price_cents,
      cost_cents: c ? c.cost_cents : null,
      margin_pct: c ? c.margin_pct : null,
    };
  });
  if (f.low === "1") rows = rows.filter((r) => r.is_low);
  rows.sort((a, b) => a.product_name.localeCompare(b.product_name, "es") || a.sku.localeCompare(b.sku, "es"));
  return { rows, error: false };
}

/** Valores distintos para los filtros (tono, largo, textura, técnica). */
export async function filterValues(supabase: DB) {
  const [{ data: vs }, { data: ps }] = await Promise.all([
    supabase.from("product_variants").select("tone, length_cm, texture").limit(2000),
    supabase.from("products").select("technique").limit(2000),
  ]);
  const uniq = (xs: (string | null | undefined)[]) =>
    [...new Set(xs.filter((x): x is string => !!x && x.trim() !== ""))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  return {
    tones: uniq((vs ?? []).map((v: any) => v.tone)),
    lengths: uniq((vs ?? []).map((v: any) => (v.length_cm === null ? null : String(Number(v.length_cm))))),
    textures: uniq((vs ?? []).map((v: any) => v.texture)),
    techniques: uniq((ps ?? []).map((p: any) => p.technique)),
  };
}
