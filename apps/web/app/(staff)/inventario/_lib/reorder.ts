import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { loadStock, type StockRow } from "./stock";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Factor de reabasto: se pide hasta `min_stock × REORDER_FACTOR` (configurable más adelante). */
export const REORDER_FACTOR = 2;

export interface Suggestion extends StockRow {
  pending: number;
  suggested: number;
  supplier_id: string | null;
  supplier_name: string | null;
}

/**
 * Variantes activas con disponible ≤ mínimo. Sugerido = mínimo × 2 − disponible − lo que ya viene
 * en órdenes abiertas (borrador, enviada o parcial), para no pedir dos veces.
 */
export async function reorderSuggestions(supabase: DB, locationId: string): Promise<Suggestion[]> {
  const { rows } = await loadStock(supabase, locationId, { low: "1" }, true);
  const low = rows.filter((r) => r.min_stock > 0);
  if (low.length === 0) return [];
  const ids = low.map((r) => r.variant_id);
  const [{ data: open }, { data: prods }] = await Promise.all([
    supabase
      .from("purchase_order_lines")
      .select("variant_id, qty_ordered, qty_received, purchase_orders!inner(status, location_id)")
      .in("variant_id", ids)
      .in("purchase_orders.status", ["draft", "sent", "partial"])
      .eq("purchase_orders.location_id", locationId),
    supabase.from("products").select("id, supplier_id, suppliers(name)").in("id", [...new Set(low.map((r) => r.product_id))]),
  ]);
  const pending = new Map<string, number>();
  for (const l of (open ?? []) as any[]) {
    pending.set(l.variant_id, (pending.get(l.variant_id) ?? 0) + Number(l.qty_ordered) - Number(l.qty_received));
  }
  const supplierBy = new Map((prods ?? []).map((p: any) => [p.id, { id: p.supplier_id as string | null, name: (p.suppliers?.name ?? null) as string | null }]));
  return low
    .map((r) => {
      const p = pending.get(r.variant_id) ?? 0;
      const s = supplierBy.get(r.product_id);
      const suggested = Math.max(0, Math.round((r.min_stock * REORDER_FACTOR - r.available - p) * 1000) / 1000);
      return { ...r, pending: p, suggested, supplier_id: s?.id ?? null, supplier_name: s?.name ?? null };
    })
    .filter((s) => s.suggested > 0);
}
