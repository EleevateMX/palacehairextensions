import "server-only";
import { dayRange } from "@/lib/day";
import { isIsoDate, todayLocal } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

export const SALE_STATUSES = ["completed", "partially_refunded", "refunded", "voided"] as const;

export interface SalesFilter {
  from: string;
  to: string;
  status: (typeof SALE_STATUSES)[number] | "";
  pending: boolean;
}

export type SalesSearchParams = { desde?: string; hasta?: string; estado?: string; pendientes?: string };

export function parseSalesFilter(sp: SalesSearchParams): SalesFilter {
  const today = todayLocal();
  let from = isIsoDate(sp.desde) ? sp.desde : today;
  let to = isIsoDate(sp.hasta) ? sp.hasta : from;
  if (to < from) [from, to] = [to, from];
  const status = (SALE_STATUSES as readonly string[]).includes(sp.estado ?? "") ? (sp.estado as SalesFilter["status"]) : "";
  return { from, to, status, pending: sp.pendientes === "1" };
}

export function filterToQuery(f: SalesFilter): string {
  const qs = new URLSearchParams({ desde: f.from, hasta: f.to });
  if (f.status) qs.set("estado", f.status);
  if (f.pending) qs.set("pendientes", "1");
  return qs.toString();
}

export interface SaleRow {
  id: string;
  folio: number;
  created_at: string;
  status: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  tax_cents: number;
  tip_cents: number;
  paid_cents: number;
  balance_due_cents: number;
  client: { first_name: string; last_name: string | null } | null;
}

/**
 * Ventas de la sucursal según el filtro. "Cuentas pendientes" muestra todas las ventas con
 * saldo, sin importar la fecha (lo que importa es cobrarlas).
 */
export async function loadSales(supabase: DB, locationId: string, f: SalesFilter, limit = 500) {
  let q = supabase
    .from("sales")
    .select(
      "id, folio, created_at, status, subtotal_cents, discount_cents, total_cents, tax_cents, tip_cents, paid_cents, balance_due_cents, client:clients(first_name, last_name)",
    )
    .eq("location_id", locationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (f.pending) q = q.gt("balance_due_cents", 0).neq("status", "voided");
  else {
    q = q.gte("created_at", dayRange(f.from).start).lt("created_at", dayRange(f.to).end);
  }
  if (f.status) q = q.eq("status", f.status);
  const { data, error } = await q;
  const rows = (data ?? []).map((r) => ({ ...r, client: Array.isArray(r.client) ? (r.client[0] ?? null) : r.client })) as SaleRow[];
  return { rows, error };
}

export const clientName = (c: SaleRow["client"]) => (c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "");
