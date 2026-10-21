"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/actions";
import { businessMessage, MESSAGES } from "@/lib/errors";
import { isIsoDate } from "@/lib/format";
import { toE164 } from "@/lib/phone";
import { bookableDateRange, portalContext, portalSlots } from "@/lib/portal";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const RATE = { max: Number(process.env.PORTAL_RATE_LIMIT_MAX ?? 10), windowMs: 10 * 60_000 };

const schema = z.object({
  service_id: z.uuid(),
  staff_id: z.union([z.uuid(), z.literal("")]),
  date: z.string().refine(isIsoDate),
  starts_at: z.iso.datetime({ offset: true }),
  idempotency_key: z.uuid(),
  first_name: z.string().trim().min(1, "Escribe tu nombre.").max(80, "Nombre demasiado largo."),
  last_name: z.string().trim().max(80, "Apellido demasiado largo.").optional(),
  phone: z.string().trim().min(1, "Escribe tu teléfono.").max(25),
  email: z.union([z.email("Correo inválido."), z.literal("")]).optional(),
});

/**
 * Reserva pública. Corre solo en el servidor: la llave secreta nunca llega al navegador.
 * Defensa contra abuso: campo trampa (honeypot) + límite por IP en memoria (ver lib/rate-limit.ts).
 * La base de datos vuelve a validar todo (servicio reservable, horario, exclusión, idempotencia).
 */
export async function bookAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await book(form);
  // Devuelve lo escrito (nunca datos de la base) para que el formulario no se borre tras un error.
  const echo = Object.fromEntries(
    ["first_name", "last_name", "phone", "email", "accept_privacy", "accept_reminders"].map((k) => [k, String(form.get(k) ?? "").slice(0, 120)]),
  );
  return { ...result, data: echo };
}

async function book(form: FormData): Promise<ActionState> {
  // 1. Campo trampa: invisible para personas; los bots lo llenan.
  if (String(form.get("website") ?? "").trim() !== "") {
    return { error: "No pudimos procesar tu solicitud. Si eres una persona, recarga la página e inténtalo de nuevo." };
  }
  // 2. Límite por IP.
  const limit = rateLimit(`portal:${clientIp(await headers())}`, RATE);
  if (!limit.ok) {
    return { error: `Demasiados intentos. Espera ${Math.ceil(limit.retryAfterSec / 60)} min o llámanos para agendar.` };
  }
  // 3. Aviso de privacidad obligatorio (también lo exige portal_book).
  if (form.get("accept_privacy") !== "on") return { error: MESSAGES.PRIVACY_REQUIRED };

  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues.find((i) => typeof i.message === "string" && i.message.length < 80)?.message ?? "Revisa tus datos." };
  const d = parsed.data;
  const phone = toE164(d.phone);
  if (!phone) return { error: "Teléfono inválido: escribe 10 dígitos (p. ej. 999 123 4567) o el formato internacional +52…" };

  const ctx = await portalContext();
  if (!ctx.location) return { error: "El portal no está disponible por el momento." };
  const service = ctx.services.find((s) => s.id === d.service_id);
  if (!service || !service.onlineBookable || service.requiresConsultation) return { error: MESSAGES.SERVICE_NOT_BOOKABLE_ONLINE };
  const range = bookableDateRange(ctx.policy);
  if (d.date < range.min || d.date > range.max) return { error: "Elige una fecha dentro del periodo de reservas." };

  // 4. El horario se recalcula en el servidor: no se confía en personal/recursos enviados por el navegador.
  const { slots } = await portalSlots({ locationId: ctx.location.id, serviceId: service.id, date: d.date, staffId: d.staff_id || undefined, policy: ctx.policy });
  const slot = slots.find((s) => s.start === Date.parse(d.starts_at));
  if (!slot) return { error: MESSAGES.SLOT_TAKEN };
  const a = slot.assignments[0]!;

  const { data, error } = await createAdminClient().rpc("portal_book", {
    p: {
      location_id: ctx.location.id,
      first_name: d.first_name,
      last_name: d.last_name ?? "",
      phone,
      email: d.email ?? "",
      accept_privacy: true,
      accept_reminders: form.get("accept_reminders") === "on",
      privacy_notice_version: ctx.privacyNoticeVersion,
      items: [{ service_id: service.id, staff_id: a.staffId, resource_ids: a.resourceIds, starts_at: new Date(a.start).toISOString() }],
      idempotency_key: `portal:${d.idempotency_key}`,
    },
  });
  if (error) return { error: businessMessage(error, "No pudimos completar la reserva. Intenta otro horario o llámanos.") };
  const appointmentId = (data as { appointment_id?: string } | null)?.appointment_id;
  if (!appointmentId) return { error: "No pudimos completar la reserva. Intenta de nuevo." };
  redirect(`/reservar/confirmacion?id=${appointmentId}`);
}
