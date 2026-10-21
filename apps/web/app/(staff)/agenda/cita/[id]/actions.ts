"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail, pesosToCents, str } from "@/lib/actions";
import { can, requireStaff } from "@/lib/staff";

const uuid = z.uuid();
const FRONT = ["owner", "admin", "receptionist"] as const;

async function front() {
  const ctx = await requireStaff();
  return { ...ctx, allowed: can(ctx.staff, ...FRONT) };
}

/** Llegó / En servicio / No asistió. Estilistas solo en sus citas (lo valida la BD). */
export async function setAttendanceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const id = uuid.safeParse(str(form, "appointment_id"));
  const status = z.enum(["arrived", "in_service", "no_show"]).safeParse(str(form, "status"));
  if (!id.success || !status.success) return { error: "Datos inválidos." };
  const { error } = await supabase.rpc("set_attendance", { p_appointment: id.data, p_status: status.data });
  if (error) return fail(error);
  refresh();
  const label = { arrived: "Llegada registrada.", in_service: "Cita en servicio.", no_show: "Marcada como no asistió." }[status.data];
  return { ok: label };
}

const qty = z.number().min(0).max(100000);

/** Completa la cita con la cantidad REAL usada por reserva y consumos adicionales. */
export async function completeAppointmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const id = uuid.safeParse(str(form, "appointment_id"));
  if (!id.success) return { error: "Datos inválidos." };
  const consumption: { reservation_id: string; actual_qty: number }[] = [];
  const extra: { variant_id: string; quantity: number }[] = [];
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    const m = /^actual_(.+)$/.exec(key);
    if (m) {
      const rid = uuid.safeParse(m[1]);
      const q = qty.safeParse(value === "" ? NaN : Number(value));
      if (!rid.success || !q.success) return { error: "Revisa las cantidades usadas (números mayores o iguales a 0)." };
      consumption.push({ reservation_id: rid.data, actual_qty: q.data });
    }
  }
  for (let i = 0; i < 5; i++) {
    const variant = str(form, `extra_variant_${i}`);
    const raw = str(form, `extra_qty_${i}`);
    if (!variant && !raw) continue;
    const v = uuid.safeParse(variant);
    const q = qty.safeParse(Number(raw));
    if (!v.success || !q.success || q.data <= 0) return { error: "Cada consumo adicional necesita producto y cantidad mayor a 0." };
    extra.push({ variant_id: v.data, quantity: q.data });
  }
  const { error } = await supabase.rpc("complete_appointment", { p_appointment: id.data, p_consumption: consumption, p_extra: extra });
  if (error) return fail(error);
  refresh();
  return { ok: "Cita completada: material descontado y seguimiento de mantenimiento programado." };
}

export async function cancelAppointmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, allowed } = await front();
  if (!allowed) return { error: "Tu rol no puede cancelar citas." };
  const id = uuid.safeParse(str(form, "appointment_id"));
  const reason = z.string().trim().min(3).max(500).safeParse(str(form, "reason"));
  if (!id.success) return { error: "Datos inválidos." };
  if (!reason.success) return { error: "Escribe el motivo de la cancelación." };
  const { data, error } = await supabase.rpc("cancel_appointment", { p_appointment: id.data, p_reason: reason.data });
  if (error) return fail(error);
  const r = (data ?? {}) as { late_cancellation?: boolean; free_until_hours?: number; already?: boolean };
  const qs = new URLSearchParams({ cancelada: r.already ? "ya" : r.late_cancellation ? "tardia" : "atiempo" });
  if (r.free_until_hours !== undefined) qs.set("h", String(r.free_until_hours));
  redirect(`/agenda/cita/${id.data}?${qs}`);
}

const slotItem = z.object({
  service_id: z.uuid(),
  staff_id: z.uuid().nullable(),
  resource_ids: z.array(z.uuid()),
  starts_at: z.iso.datetime(),
});

export async function rescheduleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, allowed } = await front();
  if (!allowed) return { error: "Tu rol no puede reprogramar citas." };
  const id = uuid.safeParse(str(form, "appointment_id"));
  let items: unknown;
  try {
    items = JSON.parse(str(form, "slot"));
  } catch {
    items = null;
  }
  const parsed = z.array(slotItem).min(1).max(3).safeParse(items);
  if (!id.success || !parsed.success) return { error: "Elige un horario de la lista." };
  const { data, error } = await supabase.rpc("reschedule_appointment", { p_appointment: id.data, p_items: parsed.data });
  if (error) return fail(error);
  redirect(`/agenda/cita/${data as string}?reprogramada=1`);
}

export async function reassignAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, allowed } = await front();
  if (!allowed) return { error: "Tu rol no puede cambiar la especialista." };
  const line = uuid.safeParse(str(form, "line_id"));
  const staffId = uuid.safeParse(str(form, "staff_id"));
  if (!line.success || !staffId.success) return { error: "Elige a la nueva especialista." };
  const { error } = await supabase.rpc("reassign_appointment_service", { p_appointment_service: line.data, p_new_staff: staffId.data });
  if (error) return fail(error);
  refresh();
  return { ok: "Especialista actualizada." };
}

export async function recordDepositAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, allowed } = await front();
  if (!allowed) return { error: "Tu rol no puede registrar anticipos." };
  const id = uuid.safeParse(str(form, "appointment_id"));
  const cents = pesosToCents(str(form, "amount"));
  const method = z.enum(["cash", "card", "transfer"]).safeParse(str(form, "method"));
  const reference = z.string().trim().max(120).safeParse(str(form, "reference"));
  if (!id.success || !method.success || !reference.success) return { error: "Datos inválidos." };
  if (!cents || cents <= 0) return { error: "Escribe un importe válido en pesos." };
  if (method.data !== "cash" && !reference.data) return { error: "Escribe la referencia del pago (folio de terminal o transferencia)." };
  const { data, error } = await supabase.rpc("record_appointment_deposit", {
    p_appointment: id.data,
    p_amount_cents: cents,
    p_method: method.data,
    p_provider: "manual",
    p_provider_ref: reference.data ? `${method.data}:${reference.data}` : null,
  });
  if (error) return fail(error);
  refresh();
  const r = (data ?? {}) as { status?: string; duplicate?: boolean };
  if (r.duplicate) return { error: "Esa referencia de pago ya estaba registrada; no se duplicó." };
  if (r.status === "needs_refund") {
    return { error: "El pago quedó registrado, pero el horario ya no estaba disponible: requiere reubicar o reembolsar (se generó una alerta)." };
  }
  return { ok: "Anticipo registrado." };
}

export async function updateNotesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, allowed } = await front();
  if (!allowed) return { error: "Tu rol no puede editar las notas." };
  const id = uuid.safeParse(str(form, "appointment_id"));
  const notes = z.string().max(1000).safeParse(str(form, "notes"));
  if (!id.success || !notes.success) return { error: "Las notas admiten hasta 1000 caracteres." };
  const { error } = await supabase.rpc("update_appointment_notes", { p_appointment: id.data, p_notes: notes.data || null });
  if (error) return fail(error);
  refresh();
  return { ok: "Notas guardadas." };
}
