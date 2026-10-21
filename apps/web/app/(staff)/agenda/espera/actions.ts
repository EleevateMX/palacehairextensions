"use server";

import { refresh } from "next/cache";
import { addDays } from "@palace/domain";
import { z } from "zod";
import { type ActionState, fail, str } from "@/lib/actions";
import { isIsoDate } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";

const schema = z
  .object({
    client_id: z.uuid("Elige a la clienta"),
    service_id: z.uuid("Elige el servicio"),
    preferred_staff_id: z.uuid().nullable(),
    desired_from: z.string().refine(isIsoDate, "Fecha inicial inválida"),
    desired_to: z.string().refine(isIsoDate, "Fecha final inválida"),
    notes: z.string().trim().max(500).nullable(),
  })
  .refine((d) => d.desired_to >= d.desired_from, { message: "La fecha final debe ser igual o posterior a la inicial" })
  .refine((d) => d.desired_to <= addDays(d.desired_from, 120), { message: "El rango deseado no puede pasar de 120 días" });

export async function addWaitlistAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) return { error: "Tu rol no puede administrar la lista de espera." };
  const parsed = schema.safeParse({
    client_id: str(form, "client_id"),
    service_id: str(form, "service_id"),
    preferred_staff_id: str(form, "preferred_staff_id") || null,
    desired_from: str(form, "desired_from"),
    desired_to: str(form, "desired_to"),
    notes: str(form, "notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  // RLS: solo propietaria, administración y recepción escriben en la lista de espera.
  const { error } = await supabase.from("waitlist_entries").insert(parsed.data);
  if (error) return fail(error);
  refresh();
  return { ok: "Clienta agregada a la lista de espera." };
}

export async function setWaitlistStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) return { error: "Tu rol no puede administrar la lista de espera." };
  const id = z.uuid().safeParse(str(form, "entry_id"));
  const status = z.enum(["waiting", "offered", "booked", "cancelled"]).safeParse(str(form, "status"));
  if (!id.success || !status.success) return { error: "Datos inválidos." };
  const { data, error } = await supabase.from("waitlist_entries").update({ status: status.data }).eq("id", id.data).select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "No se encontró el registro." };
  refresh();
  return { ok: "Estado actualizado." };
}
