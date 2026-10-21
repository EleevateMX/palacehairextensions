"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, pesosToCents, str } from "@/lib/actions";
import { businessMessage } from "@/lib/errors";
import { currentLocationId } from "@/lib/location";
import { can, requireStaff } from "@/lib/staff";
import { POS_ROLES } from "../_lib/session";

const breakdownSchema = z.record(z.string().regex(/^[1-9]\d{0,6}$/), z.number().int().min(0).max(999_999));

function parseBreakdown(raw: string): { ok: true; value: Record<string, number> | null; total: number } | { ok: false } {
  if (!raw) return { ok: true, value: null, total: 0 };
  try {
    const parsed = breakdownSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { ok: false };
    const value = Object.fromEntries(Object.entries(parsed.data).filter(([, n]) => n > 0));
    const total = Object.entries(value).reduce((s, [k, n]) => s + Number(k) * n, 0);
    return { ok: true, value: Object.keys(value).length ? value : null, total };
  } catch {
    return { ok: false };
  }
}

/** Solo rutas internas para el regreso tras abrir caja. */
const safeNext = (next: string) => (/^\/pos(\/|\?|$)/.test(next) ? next : "/pos/caja");

export async function openCashAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...POS_ROLES)) return { error: businessMessage({ message: "FORBIDDEN" }) };
  const locationId = await currentLocationId(supabase, staff);
  if (!locationId) return { error: "No hay sucursal activa." };

  const bd = parseBreakdown(str(form, "breakdown"));
  if (!bd.ok) return { error: businessMessage({ message: "BREAKDOWN_INVALID" }) };
  let floatCents: number | null;
  if (bd.value) floatCents = bd.total;
  else floatCents = pesosToCents(str(form, "float") || "0");
  if (floatCents === null) return { error: "Fondo inicial inválido. Usa pesos, p. ej. 500 o 500.50." };

  const { error } = await supabase.rpc("open_cash_session", { p_location: locationId, p_float_cents: floatCents, p_breakdown: bd.value });
  if (error) return { error: businessMessage(error) };
  revalidatePath("/pos");
  redirect(safeNext(str(form, "next")));
}

export async function closeCashAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...POS_ROLES)) return { error: businessMessage({ message: "FORBIDDEN" }) };
  const session = z.uuid().safeParse(str(form, "session_id"));
  if (!session.success) return { error: "Caja inválida." };
  const bd = parseBreakdown(str(form, "breakdown"));
  if (!bd.ok) return { error: businessMessage({ message: "BREAKDOWN_INVALID" }) };
  const counted = Number(str(form, "counted_cents"));
  if (!Number.isInteger(counted) || counted < 0) return { error: "Importe contado inválido." };
  if (bd.total !== counted) return { error: businessMessage({ message: "BREAKDOWN_MISMATCH" }) };

  const { error } = await supabase.rpc("close_cash_session", {
    p_session: session.data,
    p_counted_cents: counted,
    p_notes: str(form, "notes") || null,
    // Caja vacía: desglose explícito en cero para que quede registrado.
    p_breakdown: bd.value ?? {},
  });
  if (error) return { error: businessMessage(error) };
  revalidatePath("/pos");
  redirect(`/pos/caja?corte=${session.data}`);
}
