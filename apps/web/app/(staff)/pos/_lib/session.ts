import "server-only";
import { currentLocationId } from "@/lib/location";
import type { AppRole } from "@/lib/roles";
import type { CurrentStaff } from "@/lib/staff";
import type { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Roles que cobran (coincide con app.require_role de pos_checkout). */
export const POS_ROLES: AppRole[] = ["owner", "admin", "receptionist", "sales"];
/** Roles que autorizan descuentos, devoluciones y cancelaciones. */
export const MANAGER_ROLES: AppRole[] = ["owner", "admin"];

export interface CashSessionInfo {
  id: string;
  opened_at: string;
  opening_float_cents: number;
  opened_by: string;
  opened_by_name: string;
}

/** Caja abierta de la sucursal (aunque la haya abierto otra persona) vía RPC. */
export async function currentCashSession(supabase: DB, locationId: string): Promise<CashSessionInfo | null> {
  const { data, error } = await supabase.rpc("current_cash_session", { p_location: locationId });
  if (error) throw new Error(error.message);
  return (data as CashSessionInfo | null) ?? null;
}

export async function posContext(supabase: DB, staff: CurrentStaff) {
  const locationId = await currentLocationId(supabase, staff);
  const session = locationId ? await currentCashSession(supabase, locationId) : null;
  return { locationId, session };
}

export interface CashSummary {
  id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
  opening_float_cents: number;
  sales_count: number;
  voided_count: number;
  by_method: Record<string, { amount_cents: number; tip_cents: number; count: number }>;
  cash_deposits_cents: number;
  cash_refunds_cents: number;
  expected_cash_cents: number;
  counted_cash_cents: number | null;
  difference_cents: number | null;
  counted_breakdown: Record<string, number> | null;
  notes: string | null;
}
