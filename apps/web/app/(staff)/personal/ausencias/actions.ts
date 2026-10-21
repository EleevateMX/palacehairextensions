"use server";

import { addDays, localToUtc, parsePgRange } from "@palace/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail, str } from "@/lib/actions";
import { TZ } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";
import { firstIssue, optText, optUuid } from "../../configuracion/_lib/fields";
import { dateTime } from "../../configuracion/_lib/format";
import { managerAction } from "../../configuracion/_lib/guard";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const optTime = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .refine((v) => v === "" || HHMM.test(v), "Hora inválida (HH:MM)");

const requestSchema = z.object({
  kind: z.enum(["vacation", "permit", "sick", "training", "other"], "Tipo de ausencia inválido"),
  start_date: z.iso.date("Fecha de inicio inválida"),
  start_time: optTime,
  end_date: z.iso.date("Fecha de fin inválida"),
  end_time: optTime,
  reason: optText(300),
  staff_id: optUuid,
});

export type ConflictItem = { appointmentId: string | null; when: string; label: string };

export async function requestTimeOff(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, supabase } = await requireStaff();
  const parsed = requestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  // Sin hora: días completos (el fin es inclusivo → medianoche del día siguiente, hora local del salón).
  const starts = localToUtc(d.start_date, d.start_time || "00:00", TZ);
  const ends = d.end_time ? localToUtc(d.end_date, d.end_time, TZ) : localToUtc(addDays(d.end_date, 1), "00:00", TZ);
  if (ends <= starts) return { error: "El fin debe ser posterior al inicio." };
  if (ends - starts > 120 * 86_400_000) return { error: "Una ausencia no puede durar más de 120 días; divídela en varias." };
  const forOther = d.staff_id && d.staff_id !== staff.id;
  if (forOther && !can(staff, "owner", "admin")) return { error: "Solo puedes solicitar ausencias para ti." };
  const { error } = await supabase.rpc("request_time_off", {
    p_kind: d.kind,
    p_starts: new Date(starts).toISOString(),
    p_ends: new Date(ends).toISOString(),
    p_reason: d.reason,
    p_staff: forOther ? d.staff_id : null,
  });
  if (error) return fail(error);
  revalidatePath("/personal/ausencias");
  return { ok: "Solicitud enviada. Queda pendiente de aprobación." };
}

/** Aprueba o rechaza. Si hay citas en el periodo, la BD no aprueba y devuelve cuáles reasignar. */
export async function decideTimeOff(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const id = z.uuid().safeParse(str(form, "id"));
  const decision = str(form, "decision");
  if (!id.success || !["approve", "reject"].includes(decision)) return { error: "Solicitud inválida." };
  const { data, error } = await ctx.supabase.rpc("decide_time_off", { p_time_off: id.data, p_approve: decision === "approve" });
  if (error) return fail(error);
  const result = data as { status: string; conflicts?: { appointment_id: string | null; occupied: string }[] };
  if (result.status === "conflicts") {
    const raw = result.conflicts ?? [];
    const apptIds = [...new Set(raw.map((c) => c.appointment_id).filter((x): x is string => Boolean(x)))];
    const { data: appts } = apptIds.length
      ? await ctx.supabase
          .from("appointments")
          .select("id, starts_at, clients(first_name, last_name), appointment_services(services(name))")
          .in("id", apptIds)
      : { data: [] as never[] };
    type Appt = {
      id: string;
      starts_at: string;
      clients: { first_name: string; last_name: string | null } | null;
      appointment_services: { services: { name: string } | null }[];
    };
    const byId = new Map(((appts ?? []) as unknown as Appt[]).map((a) => [a.id, a]));
    const seen = new Set<string>();
    const conflicts: ConflictItem[] = [];
    for (const c of raw) {
      if (c.appointment_id) {
        if (seen.has(c.appointment_id)) continue;
        seen.add(c.appointment_id);
        const a = byId.get(c.appointment_id);
        const client = a?.clients ? `${a.clients.first_name} ${a.clients.last_name ?? ""}`.trim() : "Clienta";
        const svc = a?.appointment_services?.map((x) => x.services?.name).filter(Boolean).join(", ");
        conflicts.push({ appointmentId: c.appointment_id, when: a ? dateTime(a.starts_at) : "", label: `${client}${svc ? ` · ${svc}` : ""}` });
      } else {
        let when = "";
        try {
          when = dateTime(new Date(parsePgRange(c.occupied).start).toISOString());
        } catch {
          when = "";
        }
        conflicts.push({ appointmentId: null, when, label: "Bloqueo de agenda" });
      }
    }
    return {
      error:
        conflicts.length > 0
          ? "No se puede aprobar: la persona tiene citas o bloqueos en ese periodo. Reasígnalos o muévelos y vuelve a intentar."
          : "No se puede aprobar: el periodo se traslapa con otra ocupación de la agenda.",
      data: { conflicts },
    };
  }
  revalidatePath("/personal/ausencias");
  return { ok: result.status === "approved" ? "Ausencia aprobada: la agenda quedó bloqueada." : "Solicitud rechazada." };
}

export async function cancelTimeOff(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const id = z.uuid().safeParse(str(form, "id"));
  if (!id.success) return { error: "Solicitud inválida." };
  const { error } = await supabase.rpc("cancel_time_off", { p_time_off: id.data });
  if (error) return fail(error);
  revalidatePath("/personal/ausencias");
  return { ok: "Ausencia cancelada." };
}
