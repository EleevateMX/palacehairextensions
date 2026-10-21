"use server";

import { refresh } from "next/cache";
import { localToUtc } from "@palace/domain";
import { z } from "zod";
import { type ActionState, fail, str } from "@/lib/actions";
import { isIsoDate } from "@/lib/format";
import { currentLocationId } from "@/lib/location";
import { can, requireStaff } from "@/lib/staff";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.object({
  target: z.string().regex(/^(staff|resource):[0-9a-f-]{36}$/i, "Elige a quién o qué bloquear"),
  date: z.string().refine(isIsoDate, "Fecha inválida"),
  start: time,
  end: time,
  reason: z.string().trim().min(3, "Escribe el motivo").max(200),
});

export async function createBlockAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) return { error: "Tu rol no puede bloquear horarios." };
  const parsed = schema.safeParse({
    target: str(form, "target"),
    date: str(form, "date"),
    start: str(form, "start"),
    end: str(form, "end"),
    reason: str(form, "reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;
  if (d.end <= d.start) return { error: "La hora de fin debe ser posterior a la de inicio." };

  const locationId = await currentLocationId(supabase, staff);
  const { data: loc } = locationId
    ? await supabase.from("locations").select("timezone").eq("id", locationId).single()
    : { data: null };
  const tz = (loc?.timezone as string | undefined) ?? "America/Mexico_City";
  const startsAt = new Date(localToUtc(d.date, d.start, tz)).toISOString();
  const endsAt = new Date(localToUtc(d.date, d.end, tz)).toISOString();
  const [kind, id] = d.target.split(":") as ["staff" | "resource", string];

  const { error } = await supabase.rpc("block_time", {
    p_starts: startsAt,
    p_ends: endsAt,
    p_reason: d.reason,
    p_staff: kind === "staff" ? id : null,
    p_resource: kind === "resource" ? id : null,
  });
  if (error) {
    if (error.message === "SLOT_TAKEN") return { error: "Ya hay una cita u otro bloqueo en ese horario. Reprograma o reasigna primero." };
    return fail(error);
  }
  refresh();
  return { ok: "Bloqueo creado: ese horario ya no se ofrecerá." };
}

export async function removeBlockAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) return { error: "Tu rol no puede quitar bloqueos." };
  const id = z.uuid().safeParse(str(form, "allocation_id"));
  if (!id.success) return { error: "Datos inválidos." };
  const { error } = await supabase.rpc("remove_block", { p_allocation: id.data });
  if (error) return fail(error);
  refresh();
  return { ok: "Bloqueo eliminado." };
}
