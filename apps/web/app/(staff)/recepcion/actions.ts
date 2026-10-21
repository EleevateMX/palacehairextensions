"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { type ActionState, fail, str } from "@/lib/actions";
import { can, requireStaff } from "@/lib/staff";

export async function resolveAlertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) return { error: "Tu rol no puede resolver alertas." };
  const id = z.uuid().safeParse(str(form, "alert_id"));
  if (!id.success) return { error: "Datos inválidos." };
  // RLS: solo propietaria, administración y recepción actualizan alertas.
  const { data, error } = await supabase
    .from("ops_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", id.data)
    .is("resolved_at", null)
    .select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "La alerta ya estaba resuelta." };
  refresh();
  return { ok: "Alerta resuelta." };
}
