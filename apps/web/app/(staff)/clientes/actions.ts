"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail } from "@/lib/actions";
import { can, requireStaff } from "@/lib/staff";
import { currentLocationId } from "@/lib/location";
import { CONSENT_PURPOSES, normalizePhoneMx } from "./_lib/crm";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional();
const optDate = z
  .string()
  .trim()
  .refine((s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s), "Fecha inválida")
  .transform((s) => (s === "" ? null : s))
  .optional();
const optLength = z
  .string()
  .trim()
  .refine((s) => s === "" || (/^\d{1,3}(\.\d)?$/.test(s) && Number(s) > 0 && Number(s) <= 150), "Largo inválido (cm)")
  .transform((s) => (s === "" ? null : Number(s)))
  .optional();
const optUuid = z
  .string()
  .trim()
  .refine((s) => s === "" || z.uuid().safeParse(s).success, "Valor inválido")
  .transform((s) => (s === "" ? null : s))
  .optional();

const commercial = {
  first_name: z.string().trim().min(1, "Escribe el nombre").max(80),
  last_name: optText(80),
  phone: z.string().trim().max(30).optional(),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((s) => s === "" || z.email().safeParse(s).success, "Correo inválido")
    .transform((s) => (s === "" ? null : s.toLowerCase()))
    .optional(),
  birth_date: optDate,
  acquisition_channel: optText(40),
  preferred_staff_id: optUuid,
  hair_tone: optText(40),
  extension_technique: optText(40),
  extension_length_cm: optLength,
};

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Datos inválidos";
}

function phoneOrError(raw: string | undefined): { phone: string | null } | { error: string } {
  if (!raw || raw.trim() === "") return { phone: null };
  const phone = normalizePhoneMx(raw);
  return phone ? { phone } : { error: "Teléfono inválido. Usa 10 dígitos o formato internacional, p. ej. +52 999 123 4567." };
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------
export async function createClientAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist", "sales")) return { error: "Tu rol no puede registrar clientas." };
  const parsed = z.object(commercial).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const ph = phoneOrError(parsed.data.phone);
  if ("error" in ph) return { error: ph.error };
  const consents = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p, form.get(`consent_${p}`) === "on"]));
  if (!consents.privacy_notice) return { error: "Para registrar a la clienta debe aceptar el aviso de privacidad." };

  const { data, error } = await supabase.rpc("create_client_with_consents", {
    p: { ...parsed.data, phone: ph.phone, consents },
  });
  if (error) return fail(error);
  revalidatePath("/clientes");
  redirect(`/clientes/${data as string}?tab=perfil&creada=1`);
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  ...commercial,
  client_id: z.uuid(),
  style_preferences: optText(2000),
  maintenance_notes: optText(2000),
  next_visit_suggested: optDate,
});

export async function updateProfileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist", "sales")) return { error: "Tu rol solo puede consultar el perfil." };
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const ph = phoneOrError(parsed.data.phone);
  if ("error" in ph) return { error: ph.error };
  const { client_id, ...fields } = parsed.data;
  const { data, error } = await supabase
    .from("clients")
    .update({ ...fields, phone: ph.phone })
    .eq("id", client_id)
    .eq("is_anonymized", false)
    .select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "No se pudo actualizar (sin permiso o clienta anonimizada)." };
  revalidatePath(`/clientes/${client_id}`);
  return { ok: "Perfil actualizado." };
}

// ---------------------------------------------------------------------------
// Consentimientos (cada cambio es una fila nueva; el historial no se edita)
// ---------------------------------------------------------------------------
const consentSchema = z.object({
  client_id: z.uuid(),
  purpose: z.enum(CONSENT_PURPOSES),
  granted: z.enum(["true", "false"]).transform((v) => v === "true"),
  evidence: optText(300),
});

export async function recordConsentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = consentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const { error } = await supabase.rpc("record_client_consent", {
    p_client: d.client_id,
    p_purpose: d.purpose,
    p_granted: d.granted,
    p_evidence: d.evidence ?? null,
  });
  if (error) return fail(error);
  revalidatePath(`/clientes/${d.client_id}`);
  return { ok: d.granted ? "Consentimiento otorgado." : "Consentimiento revocado." };
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------
const noteSchema = z.object({
  client_id: z.uuid(),
  body: z.string().trim().min(1, "Escribe la nota").max(4000),
  sensitivity: z.enum(["general", "sensitive"]).default("general"),
});

export async function addNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  const parsed = noteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (d.sensitivity === "sensitive" && !can(staff, "owner", "admin")) {
    return { error: "Solo propietaria o administración registran notas sensibles." };
  }
  // RLS valida autoría y acceso a la clienta (y que lo sensible sea solo de owner/admin).
  const { error } = await supabase.from("client_notes").insert({ ...d, author_staff_id: staff.id });
  if (error) return fail(error);
  revalidatePath(`/clientes/${d.client_id}`);
  return { ok: "Nota guardada." };
}

// ---------------------------------------------------------------------------
// Mantenimiento
// ---------------------------------------------------------------------------
const reminderSchema = z.object({
  client_id: z.uuid(),
  reminder_id: z.uuid(),
  status: z.enum(["sent", "booked", "dismissed", "pending"]),
});

export async function updateReminderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = reminderSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const { data, error } = await supabase
    .from("maintenance_reminders")
    .update({ status: d.status })
    .eq("id", d.reminder_id)
    .eq("client_id", d.client_id)
    .select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "Tu rol no puede actualizar recordatorios." };
  revalidatePath(`/clientes/${d.client_id}`);
  return { ok: "Recordatorio actualizado." };
}

// ---------------------------------------------------------------------------
// Inventario apartado para la clienta
// ---------------------------------------------------------------------------
const reserveSchema = z.object({
  client_id: z.uuid(),
  variant_id: z.uuid("Elige un producto"),
  quantity: z.coerce.number().positive("Cantidad inválida").max(1000),
  note: optText(300),
  return_to: z.enum(["expediente", "cotizador"]).default("expediente"),
});

export async function reserveForClientAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  const parsed = reserveSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const location = await currentLocationId(supabase, staff);
  if (!location) return { error: "No hay sucursal activa." };
  // reserve_stock bloquea la fila de existencias y valida disponible (nunca sobreventa).
  const { error } = await supabase.rpc("reserve_stock", {
    p_variant: d.variant_id,
    p_location: location,
    p_qty: d.quantity,
    p_client: d.client_id,
    p_note: d.note ?? (d.return_to === "cotizador" ? "Apartado desde el cotizador" : "Apartado para la clienta"),
  });
  if (error) return fail(error);
  revalidatePath(`/clientes/${d.client_id}`);
  revalidatePath("/cotizador");
  return { ok: `Se apartaron ${d.quantity} para la clienta.`, data: { client_id: d.client_id } };
}

const releaseSchema = z.object({ client_id: z.uuid(), reservation_id: z.uuid() });

export async function releaseReservationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = releaseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await supabase.rpc("release_reservation", { p_reservation: parsed.data.reservation_id });
  if (error) return fail(error);
  revalidatePath(`/clientes/${parsed.data.client_id}`);
  return { ok: "Apartado liberado." };
}

// ---------------------------------------------------------------------------
// Privacidad: anonimización (derecho de cancelación ARCO)
// ---------------------------------------------------------------------------
const anonymizeSchema = z.object({ client_id: z.uuid(), confirmation: z.string().trim() });

export async function anonymizeClientAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!can(staff, "owner", "admin")) return { error: "Solo propietaria o administración pueden anonimizar." };
  const parsed = anonymizeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (parsed.data.confirmation !== "ANONIMIZAR") return { error: "Escribe ANONIMIZAR en mayúsculas para confirmar." };
  const { error } = await supabase.rpc("anonymize_client", { p_client: parsed.data.client_id });
  if (error) return fail(error);
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${parsed.data.client_id}`);
  return { ok: "Datos personales eliminados. Se conservaron solo los registros contables." };
}
