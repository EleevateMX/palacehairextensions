"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail } from "@/lib/actions";
import { isIsoDate } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";

const item = z.object({
  service_id: z.uuid(),
  staff_id: z.uuid().nullable(),
  resource_ids: z.array(z.uuid()),
  starts_at: z.iso.datetime(),
});

const schema = z.object({
  location_id: z.uuid(),
  client_id: z.uuid(),
  date: z.string().refine(isIsoDate),
  idempotency_key: z.uuid(),
  service_ids: z.string().transform((s) => s.split(",").filter(Boolean)).pipe(z.array(z.uuid()).min(1).max(3)),
  slot: z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Horario inválido" });
        return z.NEVER;
      }
    })
    .pipe(z.array(item).min(1).max(3)),
  hold: z.literal("1").optional(),
  allow_missing: z.literal("1").optional(),
  notes: z.string().max(1000).optional(),
});

const material = z.object({ variant_id: z.uuid(), quantity: z.number().positive().max(10000) });

export async function createAppointmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) return { error: "Tu rol no puede agendar citas." };
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string" && v !== ""));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: "Datos inválidos: elige un horario de la lista." };
  const d = parsed.data;
  // El horario debe corresponder, en orden, a los servicios buscados.
  if (d.slot.length !== d.service_ids.length || d.slot.some((it, i) => it.service_id !== d.service_ids[i])) {
    return { error: "El horario no corresponde a los servicios seleccionados. Vuelve a buscar horarios." };
  }

  const items = [];
  for (const [i, it] of d.slot.entries()) {
    const variant = form.get(`mat_${i}_variant`);
    const materials: z.infer<typeof material>[] = [];
    if (typeof variant === "string" && variant) {
      const m = material.safeParse({ variant_id: variant, quantity: Number(form.get(`mat_${i}_qty`)) });
      if (!m.success) return { error: "Cantidad de material inválida." };
      materials.push(m.data);
    }
    items.push({ ...it, materials });
  }

  let holdMinutes: number | null = null;
  if (d.hold) {
    const { data: settings } = await supabase.from("business_settings").select("booking_policy").eq("id", 1).maybeSingle();
    holdMinutes = Number((settings?.booking_policy as { hold_minutes?: number } | null)?.hold_minutes ?? 15);
  }

  // La base de datos valida rol, horario, capacitación, recursos y existencias; la exclusión impide doble reserva.
  const { data: id, error } = await supabase.rpc("create_appointment", {
    p_location: d.location_id,
    p_client: d.client_id,
    p_items: items,
    p_hold_minutes: holdMinutes,
    p_source: "reception",
    p_idempotency_key: d.idempotency_key,
    p_allow_missing_materials: Boolean(d.allow_missing),
    p_notes: d.notes?.trim() || null,
  });
  if (error) {
    const res = fail(error);
    if (error.message === "INSUFFICIENT_STOCK") {
      res.error += " Puedes elegir otro tono o marcar «Crear aunque falte material».";
    }
    return res;
  }
  redirect(`/agenda?date=${d.date}&creada=${id as string}`);
}
