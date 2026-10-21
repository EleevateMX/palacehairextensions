"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/actions";
import { businessMessage } from "@/lib/errors";
import { can, requireStaff } from "@/lib/staff";
import { POS_ROLES, posContext } from "./_lib/session";

const cents = z.number().int().nonnegative().max(100_000_000);

const lineSchema = z.object({
  kind: z.enum(["product", "service", "gift_card"]),
  variant_id: z.uuid().optional(),
  service_id: z.uuid().optional(),
  appointment_service_id: z.uuid().optional(),
  staff_id: z.uuid().optional(),
  quantity: z.number().positive().max(999),
  unit_price_cents: cents.optional(),
  discount_cents: cents.default(0),
});

const paymentSchema = z.object({
  method: z.enum(["cash", "card", "transfer", "gift_card", "deposit"]),
  amount_cents: cents,
  tip_cents: cents.default(0),
  tip_staff_id: z.uuid().optional(),
  provider_ref: z.string().trim().max(80).optional(),
  gift_card_code: z.string().trim().max(40).optional(),
  deposit_id: z.uuid().optional(),
});

const payloadSchema = z.object({
  idempotency_key: z.uuid(),
  client_id: z.uuid().optional(),
  appointment_id: z.uuid().optional(),
  coupon_code: z.string().trim().max(40).optional(),
  allow_balance: z.boolean().default(false),
  lines: z.array(lineSchema).min(1, "El carrito está vacío.").max(100),
  payments: z.array(paymentSchema).max(20),
});

export type CheckoutPayload = z.input<typeof payloadSchema>;

/** Cobro: el servidor recalcula precios y totales; la llave de idempotencia evita ventas duplicadas. */
export async function checkoutAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...POS_ROLES)) return { error: businessMessage({ message: "FORBIDDEN" }) };

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return { error: "Datos del carrito inválidos." };
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos del carrito inválidos." };
  const d = parsed.data;

  for (const [i, p] of d.payments.entries()) {
    const n = i + 1;
    if (p.amount_cents === 0 && p.tip_cents === 0) return { error: `El pago ${n} no tiene importe.` };
    if (p.method === "card" && !p.provider_ref) return { error: `Captura la referencia de la terminal (pago ${n}).` };
    if (p.method === "gift_card" && !p.gift_card_code) return { error: `Captura el código de la tarjeta de regalo (pago ${n}).` };
    if (p.method === "deposit" && !p.deposit_id) return { error: `Anticipo inválido (pago ${n}).` };
    if (p.tip_cents > 0 && !p.tip_staff_id) return { error: `Elige a quién va la propina (pago ${n}).` };
  }
  if (d.allow_balance && !d.client_id) return { error: businessMessage({ message: "CLIENT_REQUIRED_FOR_BALANCE" }) };

  const { locationId, session } = await posContext(supabase, staff);
  if (!locationId) return { error: "No hay sucursal activa." };
  // La caja se toma del servidor, nunca del navegador.
  if (!session) return { error: "La caja no está abierta. Ábrela antes de cobrar." };

  const p = {
    location_id: locationId,
    cash_session_id: session.id,
    idempotency_key: d.idempotency_key,
    client_id: d.client_id ?? null,
    appointment_id: d.appointment_id ?? null,
    coupon_code: d.coupon_code || null,
    allow_balance: d.allow_balance,
    lines: d.lines.map((l) => ({
      kind: l.kind,
      variant_id: l.variant_id,
      service_id: l.service_id,
      appointment_service_id: l.appointment_service_id,
      staff_id: l.staff_id,
      quantity: l.quantity,
      ...(l.unit_price_cents !== undefined ? { unit_price_cents: l.unit_price_cents } : {}),
      discount_cents: l.discount_cents,
    })),
    payments: d.payments.map((x) => ({
      method: x.method,
      amount_cents: x.amount_cents,
      tip_cents: x.tip_cents,
      tip_staff_id: x.tip_cents > 0 ? x.tip_staff_id : undefined,
      provider: x.method === "card" ? "terminal" : x.method === "transfer" && x.provider_ref ? "transfer" : undefined,
      provider_ref: (x.method === "card" || x.method === "transfer") && x.provider_ref ? x.provider_ref : undefined,
      gift_card_code: x.method === "gift_card" ? x.gift_card_code?.toUpperCase() : undefined,
      deposit_id: x.method === "deposit" ? x.deposit_id : undefined,
    })),
  };

  const { data, error } = await supabase.rpc("pos_checkout", { p });
  if (error) return { error: businessMessage(error) };
  const saleId = (data as { sale_id: string }).sale_id;
  redirect(`/ventas/${saleId}`);
}

export interface ClientHit {
  id: string;
  name: string;
  phone: string | null;
}

/** Búsqueda de clientas para el carrito (RLS: solo personal que cobra). */
export async function searchClientsAction(q: string): Promise<ClientHit[]> {
  const { supabase } = await requireStaff();
  const term = q.replace(/[%,()*]/g, " ").trim().slice(0, 60);
  if (term.length < 2) return [];
  const { data } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone")
    .eq("is_anonymized", false)
    .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%`)
    .order("first_name")
    .limit(10);
  return (data ?? []).map((c) => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" "), phone: c.phone }));
}

export type CouponCheck = { ok: true; code: string; kind: "percent" | "fixed"; value: number } | { ok: false; error: string };

/** Consulta previa del cupón (solo vista previa: pos_checkout vuelve a validarlo). */
export async function checkCouponAction(code: string): Promise<CouponCheck> {
  const { supabase } = await requireStaff();
  const clean = code.trim().slice(0, 40);
  if (!clean) return { ok: false, error: "Escribe el código del cupón." };
  if (!/^[A-Za-z0-9-]+$/.test(clean)) return { ok: false, error: businessMessage({ message: "COUPON_INVALID" }) };
  // El código es citext; "ilike" sin comodines compara sin distinguir mayúsculas.
  const { data } = await supabase
    .from("coupons")
    .select("code, kind, value, is_active, valid_from, valid_to, max_uses, used_count")
    .ilike("code", clean)
    .maybeSingle();
  const now = Date.now();
  if (
    !data ||
    !data.is_active ||
    (data.valid_from && new Date(data.valid_from).getTime() > now) ||
    (data.valid_to && new Date(data.valid_to).getTime() < now) ||
    (data.max_uses !== null && data.used_count >= data.max_uses)
  ) {
    return { ok: false, error: businessMessage({ message: "COUPON_INVALID" }) };
  }
  return { ok: true, code: data.code as string, kind: data.kind as "percent" | "fixed", value: data.value as number };
}

export type GiftCardCheck = { ok: true; code: string; balanceCents: number } | { ok: false; error: string };

/** Saldo de una tarjeta de regalo (vista previa; el cobro lo valida con bloqueo). */
export async function checkGiftCardAction(code: string): Promise<GiftCardCheck> {
  const { supabase } = await requireStaff();
  const clean = code.trim().toUpperCase().slice(0, 40);
  if (!clean) return { ok: false, error: "Escribe el código de la tarjeta." };
  const { data } = await supabase.from("gift_cards").select("code, balance_cents, status, expires_at").eq("code", clean).maybeSingle();
  if (!data || data.status !== "active" || (data.expires_at && new Date(data.expires_at).getTime() < Date.now())) {
    return { ok: false, error: businessMessage({ message: "GIFT_CARD_INVALID" }) };
  }
  return { ok: true, code: data.code, balanceCents: data.balance_cents };
}
