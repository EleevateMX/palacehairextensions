"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail, str } from "@/lib/actions";
import { checkbox, firstIssue, optText, readWeeklyRanges, uuidField } from "../_lib/fields";
import { managerAction } from "../_lib/guard";

export async function saveBusinessHours(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const location = z.uuid().safeParse(str(form, "location_id"));
  if (!location.success) return { error: "Sucursal inválida." };
  const read = readWeeklyRanges(form);
  if ("error" in read) return { error: read.error };
  // Reemplazo atómico en la BD (valida rangos y traslapes otra vez).
  const { error } = await ctx.supabase.rpc("replace_business_hours", { p_location: location.data, p_hours: read.ranges });
  if (error) return fail(error);
  revalidatePath("/configuracion/horarios");
  return { ok: "Horario semanal guardado." };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const specialSchema = z
  .object({
    location_id: uuidField("Sucursal"),
    day: z.iso.date("Fecha inválida"),
    label: optText(80),
    is_closed: checkbox,
    opens_at: z.string().optional(),
    closes_at: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.is_closed) return;
    if (!d.opens_at || !HHMM.test(d.opens_at) || !d.closes_at || !HHMM.test(d.closes_at)) {
      ctx.addIssue({ code: "custom", message: "Si el salón abre ese día, indica apertura y cierre." });
    } else if (d.closes_at <= d.opens_at) {
      ctx.addIssue({ code: "custom", message: "El cierre debe ser posterior a la apertura." });
    }
  });

export async function addSpecialDay(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = specialSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const { error } = await ctx.supabase.from("special_days").insert({
    location_id: d.location_id,
    day: d.day,
    label: d.label,
    is_closed: d.is_closed,
    opens_at: d.is_closed ? null : d.opens_at,
    closes_at: d.is_closed ? null : d.closes_at,
  });
  if (error) return error.code === "23505" ? { error: "Ya hay un día especial registrado en esa fecha." } : fail(error);
  revalidatePath("/configuracion/horarios");
  return { ok: "Día especial agregado." };
}

export async function removeSpecialDay(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const id = z.uuid().safeParse(str(form, "id"));
  if (!id.success) return { error: "Registro inválido." };
  const { error, count } = await ctx.supabase.from("special_days").delete({ count: "exact" }).eq("id", id.data);
  if (error) return fail(error);
  if (!count) return { error: "No se encontró el registro." };
  revalidatePath("/configuracion/horarios");
  return { ok: "Día especial eliminado." };
}
