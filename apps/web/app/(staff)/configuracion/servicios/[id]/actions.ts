"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail, pesosToCents, str } from "@/lib/actions";
import {
  MATERIAL_ROLES,
  checkbox,
  firstIssue,
  intField,
  optIntField,
  optText,
  optUuid,
  percentToBps,
  pesosField,
  text,
  uuidField,
} from "../../_lib/fields";
import { managerAction } from "../../_lib/guard";

const done = (serviceId: string, ok: string): ActionState => {
  revalidatePath(`/configuracion/servicios/${serviceId}`);
  revalidatePath("/configuracion/servicios");
  return { ok };
};

const serviceSchema = z.object({
  service_id: uuidField("Servicio"),
  name: text("Nombre", 2, 120),
  category_id: optUuid,
  description: optText(2000),
  price: pesosField("Precio"),
  price_is_from: checkbox,
  duration_min: intField("Duración", 5, 720),
  prep_min: intField("Preparación", 0, 240),
  cleanup_min: intField("Limpieza", 0, 240),
  buffer_min: intField("Margen entre citas", 0, 240),
  cleanup_occupies_staff: checkbox,
  requires_consultation: checkbox,
  deposit_type: z.enum(["none", "fixed", "percent"], "Tipo de anticipo inválido"),
  deposit_value: z.string().optional().transform((v) => (v ?? "").trim()),
  cancellation_min_hours: optIntField("Horas de cancelación", 0, 720),
  maintenance_interval_days: optIntField("Intervalo de mantenimiento", 1, 730),
  technique: optText(40),
  online_bookable: checkbox,
  is_active: checkbox,
});

export async function updateService(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = serviceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;

  // Anticipo: fijo en pesos → centavos; porcentaje → puntos base.
  let depositValue = 0;
  if (d.deposit_type === "fixed") {
    const c = pesosToCents(d.deposit_value);
    if (c === null || c <= 0) return { error: "Anticipo fijo: escribe un importe mayor que 0." };
    if (c > d.price && !d.price_is_from) return { error: "El anticipo no puede ser mayor que el precio." };
    depositValue = c;
  } else if (d.deposit_type === "percent") {
    const b = percentToBps(d.deposit_value);
    if (b === null || b <= 0) return { error: "Anticipo porcentual: escribe un porcentaje entre 0 y 100." };
    depositValue = b;
  }
  if (d.online_bookable && d.requires_consultation) {
    return { error: "Un servicio que exige valoración previa no puede reservarse en línea." };
  }

  const { error, count } = await ctx.supabase
    .from("services")
    .update(
      {
        name: d.name,
        category_id: d.category_id,
        description: d.description,
        price_cents: d.price,
        price_is_from: d.price_is_from,
        duration_min: d.duration_min,
        prep_min: d.prep_min,
        cleanup_min: d.cleanup_min,
        buffer_min: d.buffer_min,
        cleanup_occupies_staff: d.cleanup_occupies_staff,
        requires_consultation: d.requires_consultation,
        deposit_type: d.deposit_type,
        deposit_value: depositValue,
        cancellation_min_hours: d.cancellation_min_hours,
        maintenance_interval_days: d.maintenance_interval_days,
        technique: d.technique,
        online_bookable: d.online_bookable,
        is_active: d.is_active,
      },
      { count: "exact" },
    )
    .eq("id", d.service_id);
  if (error) return fail(error);
  if (!count) return { error: "No se encontró el servicio o tu rol no puede editarlo." };
  return done(d.service_id, "Servicio guardado.");
}

/** Reemplaza el personal capacitado, con duración/precio opcionales por persona. */
export async function saveQualifiedStaff(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const serviceId = z.uuid().safeParse(str(form, "service_id"));
  if (!serviceId.success) return { error: "Servicio inválido." };
  const ids = form.getAll("staff").map(String);
  if (!ids.every((id) => z.uuid().safeParse(id).success)) return { error: "Persona inválida." };
  const rows: { service_id: string; staff_id: string; duration_min: number | null; price_cents: number | null }[] = [];
  for (const id of ids) {
    const dur = str(form, `dur_${id}`);
    const price = str(form, `price_${id}`);
    if (dur && (!/^\d+$/.test(dur) || Number(dur) < 5 || Number(dur) > 720)) return { error: "Duración por persona: entero entre 5 y 720 minutos." };
    const cents = price ? pesosToCents(price) : null;
    if (price && cents === null) return { error: "Precio por persona: importe inválido." };
    rows.push({ service_id: serviceId.data, staff_id: id, duration_min: dur ? Number(dur) : null, price_cents: cents });
  }
  let del = ctx.supabase.from("staff_services").delete().eq("service_id", serviceId.data);
  if (ids.length) del = del.not("staff_id", "in", `(${ids.join(",")})`);
  const { error: delError } = await del;
  if (delError) return fail(delError);
  if (rows.length) {
    const { error } = await ctx.supabase.from("staff_services").upsert(rows, { onConflict: "staff_id,service_id" });
    if (error) return fail(error);
  }
  return done(serviceId.data, `Personal capacitado guardado (${rows.length}).`);
}

const requirementSchema = z.object({
  service_id: uuidField("Servicio"),
  resource_type_id: uuidField("Tipo de recurso"),
  quantity: intField("Cantidad", 1, 20),
});

export async function addRequirement(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = requirementSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await ctx.supabase.from("service_resource_requirements").upsert(parsed.data, { onConflict: "service_id,resource_type_id" });
  if (error) return fail(error);
  return done(parsed.data.service_id, "Recurso requerido guardado.");
}

export async function removeRequirement(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = z.object({ service_id: uuidField("Servicio"), resource_type_id: uuidField("Tipo de recurso") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await ctx.supabase
    .from("service_resource_requirements")
    .delete()
    .eq("service_id", parsed.data.service_id)
    .eq("resource_type_id", parsed.data.resource_type_id);
  if (error) return fail(error);
  return done(parsed.data.service_id, "Recurso quitado.");
}

const materialSchema = z
  .object({
    service_id: uuidField("Servicio"),
    mode: z.enum(["fixed", "variable"]),
    variant_id: optUuid,
    material_role: z.enum(MATERIAL_ROLES, "Tipo de material inválido"),
    quantity: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,3})?$/, "Cantidad: número con hasta 3 decimales")
      .transform(Number)
      .refine((n) => n > 0, "La cantidad debe ser mayor que 0"),
    reserve_on_booking: checkbox,
    notes: optText(200),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "fixed" && !d.variant_id) ctx.addIssue({ code: "custom", message: "Selecciona el producto (variante) del material fijo." });
  });

export async function addMaterial(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = materialSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const { error } = await ctx.supabase.from("service_materials").insert({
    service_id: d.service_id,
    variant_id: d.mode === "fixed" ? d.variant_id : null,
    material_role: d.material_role,
    quantity: d.quantity,
    is_variable: d.mode === "variable",
    reserve_on_booking: d.reserve_on_booking,
    notes: d.notes,
  });
  if (error) return fail(error);
  return done(d.service_id, "Material agregado a la receta.");
}

export async function removeMaterial(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = z.object({ service_id: uuidField("Servicio"), id: uuidField("Material") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await ctx.supabase.from("service_materials").delete().eq("id", parsed.data.id).eq("service_id", parsed.data.service_id);
  if (error) return fail(error);
  return done(parsed.data.service_id, "Material quitado.");
}

const costSchema = z.object({ service_id: uuidField("Servicio"), label: text("Concepto", 2, 80), amount: pesosField("Importe") });

export async function addCostItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = costSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await ctx.supabase
    .from("service_cost_items")
    .insert({ service_id: parsed.data.service_id, label: parsed.data.label, amount_cents: parsed.data.amount });
  if (error) return fail(error);
  return done(parsed.data.service_id, "Costo agregado.");
}

export async function removeCostItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = z.object({ service_id: uuidField("Servicio"), id: uuidField("Costo") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await ctx.supabase.from("service_cost_items").delete().eq("id", parsed.data.id).eq("service_id", parsed.data.service_id);
  if (error) return fail(error);
  return done(parsed.data.service_id, "Costo quitado.");
}
