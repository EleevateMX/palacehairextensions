"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail } from "@/lib/actions";
import { firstIssue, intField, optText, text } from "./_lib/fields";
import { managerAction } from "./_lib/guard";

const businessSchema = z.object({
  display_name: text("Nombre comercial", 2, 120),
  legal_name: optText(200),
  rfc: optText(13),
  hold_minutes: intField("Minutos de apartado", 5, 1440),
  min_lead_minutes: intField("Anticipación mínima", 0, 10_080),
  max_advance_days: intField("Días máximos de anticipación", 1, 365),
  slot_step_minutes: intField("Intervalo de horarios", 5, 120),
  free_until_hours: intField("Cancelación sin costo", 0, 720),
});

export async function saveBusinessSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = businessSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (d.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(d.rfc)) return { error: "RFC con formato inválido." };

  // Se conservan las demás llaves de las políticas (lectura-modificación-escritura).
  const { data: current, error: readError } = await ctx.supabase
    .from("business_settings")
    .select("booking_policy, cancellation_policy")
    .eq("id", 1)
    .maybeSingle();
  if (readError || !current) return fail(readError, "No se encontró la configuración del negocio.");
  const { error, count } = await ctx.supabase
    .from("business_settings")
    .update(
      {
        display_name: d.display_name,
        legal_name: d.legal_name,
        rfc: d.rfc?.toUpperCase() ?? null,
        booking_policy: {
          ...(current.booking_policy as Record<string, unknown>),
          hold_minutes: d.hold_minutes,
          min_lead_minutes: d.min_lead_minutes,
          max_advance_days: d.max_advance_days,
          slot_step_minutes: d.slot_step_minutes,
        },
        cancellation_policy: { ...(current.cancellation_policy as Record<string, unknown>), free_until_hours: d.free_until_hours },
        updated_at: new Date().toISOString(),
      },
      { count: "exact" },
    )
    .eq("id", 1);
  if (error) return fail(error);
  if (!count) return { error: "Tu rol no tiene permiso para esta operación." };
  revalidatePath("/configuracion");
  return { ok: "Configuración del negocio guardada." };
}

const httpsUrl = (label: string, pattern: RegExp, hint: string) =>
  optText(500).refine((v) => v === null || pattern.test(v), { message: `${label}: ${hint}` });

const locationSchema = z.object({
  location_id: z.uuid({ message: "Sucursal inválida." }),
  location_name: text("Nombre de la sucursal", 2, 120),
  address: optText(300),
  phone: optText(30),
  maps_url: httpsUrl("Enlace de Google Maps", /^https:\/\/\S+$/, "debe empezar con https://"),
  map_query: optText(200),
  facebook_url: httpsUrl("Página de Facebook", /^https:\/\/(www\.|m\.|es-la\.)?facebook\.com\/\S+$/, "pega el enlace de facebook.com"),
});

/** Ubicación de la sucursal (portal: mapa y "Cómo llegar") y página de Facebook del negocio. */
export async function saveLocationInfo(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = locationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (d.map_query !== null && d.map_query.length < 3) return { error: "Texto para el mapa: escribe al menos 3 caracteres." };

  const [loc, biz] = await Promise.all([
    ctx.supabase
      .from("locations")
      .update({ name: d.location_name, address: d.address, phone: d.phone, maps_url: d.maps_url, map_query: d.map_query, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", d.location_id),
    ctx.supabase.from("business_settings").update({ facebook_url: d.facebook_url, updated_at: new Date().toISOString() }, { count: "exact" }).eq("id", 1),
  ]);
  if (loc.error) return fail(loc.error);
  if (biz.error) return fail(biz.error);
  if (!loc.count || !biz.count) return { error: "Tu rol no tiene permiso para esta operación." };
  revalidatePath("/configuracion");
  revalidatePath("/reservar");
  return { ok: "Ubicación y redes guardadas." };
}
