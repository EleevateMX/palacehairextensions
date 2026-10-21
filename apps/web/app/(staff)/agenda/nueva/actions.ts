"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { businessMessage } from "@/lib/errors";
import { requireStaff } from "@/lib/staff";

const schema = z.object({
  location_id: z.uuid(),
  client_id: z.uuid(),
  service_id: z.uuid(),
  staff_id: z.uuid(),
  starts_at: z.iso.datetime(),
  resource_ids: z.string().transform((s) => (s ? s.split(",") : [])).pipe(z.array(z.uuid())),
  idempotency_key: z.uuid(),
  date: z.string(),
});

export async function createAppointmentAction(form: FormData) {
  const { supabase } = await requireStaff();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/agenda/nueva?error=${encodeURIComponent("Datos inválidos")}`);
  const d = parsed.data;
  // La base de datos valida rol, horario, capacitación y recursos; la exclusión impide doble reserva.
  const { error } = await supabase.rpc("create_appointment", {
    p_location: d.location_id,
    p_client: d.client_id,
    p_items: [{ service_id: d.service_id, staff_id: d.staff_id, resource_ids: d.resource_ids, starts_at: d.starts_at }],
    p_source: "reception",
    p_idempotency_key: d.idempotency_key,
  });
  if (error) {
    const qs = new URLSearchParams({ date: d.date, service: d.service_id, client: d.client_id, error: businessMessage(error) });
    redirect(`/agenda/nueva?${qs}`);
  }
  redirect(`/agenda?date=${d.date}`);
}
