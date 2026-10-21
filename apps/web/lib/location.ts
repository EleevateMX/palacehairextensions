import "server-only";
import type { CurrentStaff } from "./staff";
import type { createClient } from "./supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Sucursal de trabajo: la de la persona o la primera activa (una sola empresa por ahora). */
export async function currentLocationId(supabase: DB, staff: CurrentStaff): Promise<string | null> {
  if (staff.locationId) return staff.locationId;
  const { data } = await supabase.from("locations").select("id").eq("is_active", true).order("name").limit(1).maybeSingle();
  return data?.id ?? null;
}
