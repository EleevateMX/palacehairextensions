import "server-only";
import { redirect } from "next/navigation";
import type { AppRole } from "./roles";
import { createClient } from "./supabase/server";

export interface CurrentStaff {
  id: string;
  displayName: string;
  role: AppRole;
  locationId: string | null;
}

/** Persona autenticada con expediente de personal activo; si no, la manda a /login. */
export async function requireStaff(): Promise<{ staff: CurrentStaff; supabase: Awaited<ReturnType<typeof createClient>> }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data } = await supabase
    .from("staff_members")
    .select("id, display_name, role, location_id")
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) redirect("/login?error=sin-expediente");
  return {
    supabase,
    staff: { id: data.id, displayName: data.display_name, role: data.role as AppRole, locationId: data.location_id },
  };
}

export const can = (staff: CurrentStaff, ...roles: AppRole[]) => roles.includes(staff.role);
