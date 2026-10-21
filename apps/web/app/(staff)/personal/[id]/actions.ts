"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail, pesosToCents, str } from "@/lib/actions";
import { checkbox, firstIssue, optText, optUuid, readWeeklyRanges, text, uuidField } from "../../configuracion/_lib/fields";
import { managerAction } from "../../configuracion/_lib/guard";

const ROLES = ["owner", "admin", "receptionist", "stylist", "inventory", "sales"] as const;

const done = (staffId: string, ok: string): ActionState => {
  revalidatePath(`/personal/${staffId}`);
  revalidatePath("/personal");
  return { ok };
};

const updateSchema = z.object({
  staff_id: uuidField("Persona"),
  display_name: text("Nombre", 2, 80),
  phone: optText(20),
  role: z.enum(ROLES, "Rol inválido"),
  is_bookable: checkbox,
  is_active: checkbox,
  calendar_color: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim() || null)
    .pipe(z.string().regex(/^#[0-9a-f]{6}$/i, "Color inválido").nullable()),
  location_id: optUuid,
});

export async function updateStaffMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = updateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (d.staff_id === ctx.staff.id && (!d.is_active || d.role !== ctx.staff.role)) {
    return { error: "No puedes desactivarte ni cambiar tu propio rol (pídeselo a otra persona con permiso)." };
  }
  const { error, count } = await ctx.supabase
    .from("staff_members")
    .update(
      {
        display_name: d.display_name,
        phone: d.phone,
        role: d.role,
        is_bookable: d.is_bookable,
        is_active: d.is_active,
        calendar_color: d.calendar_color,
        location_id: d.location_id,
      },
      { count: "exact" },
    )
    .eq("id", d.staff_id);
  if (error) {
    // La BD (guard_owner_role) impide que alguien distinto de la propietaria asigne o edite ese rol.
    if (error.message === "FORBIDDEN") return { error: "Solo la propietaria puede asignar el rol de propietaria o editar su expediente." };
    return fail(error);
  }
  if (!count) return { error: "No se encontró a la persona o tu rol no puede editarla." };
  return done(d.staff_id, "Datos guardados.");
}

export async function saveStaffSchedule(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const ids = z.object({ staff_id: uuidField("Persona"), location_id: uuidField("Sucursal") }).safeParse(Object.fromEntries(form));
  if (!ids.success) return { error: firstIssue(ids.error) };
  const read = readWeeklyRanges(form);
  if ("error" in read) return { error: read.error };
  const { error } = await ctx.supabase.rpc("replace_staff_schedule", {
    p_staff: ids.data.staff_id,
    p_location: ids.data.location_id,
    p_shifts: read.ranges,
  });
  if (error) return fail(error);
  return done(ids.data.staff_id, `Turnos guardados (${read.ranges.length} rangos).`);
}

/** Reemplaza los servicios que realiza la persona, con duración/precio opcionales. */
export async function saveStaffServices(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const staffId = z.uuid().safeParse(str(form, "staff_id"));
  if (!staffId.success) return { error: "Persona inválida." };
  const ids = form.getAll("service").map(String);
  if (!ids.every((id) => z.uuid().safeParse(id).success)) return { error: "Servicio inválido." };
  const rows: { staff_id: string; service_id: string; duration_min: number | null; price_cents: number | null }[] = [];
  for (const id of ids) {
    const dur = str(form, `dur_${id}`);
    const price = str(form, `price_${id}`);
    if (dur && (!/^\d+$/.test(dur) || Number(dur) < 5 || Number(dur) > 720)) return { error: "Duración: entero entre 5 y 720 minutos." };
    const cents = price ? pesosToCents(price) : null;
    if (price && cents === null) return { error: "Precio: importe inválido." };
    rows.push({ staff_id: staffId.data, service_id: id, duration_min: dur ? Number(dur) : null, price_cents: cents });
  }
  let del = ctx.supabase.from("staff_services").delete().eq("staff_id", staffId.data);
  if (ids.length) del = del.not("service_id", "in", `(${ids.join(",")})`);
  const { error: delError } = await del;
  if (delError) return fail(delError);
  if (rows.length) {
    const { error } = await ctx.supabase.from("staff_services").upsert(rows, { onConflict: "staff_id,service_id" });
    if (error) return fail(error);
  }
  return done(staffId.data, `Servicios guardados (${rows.length}).`);
}
