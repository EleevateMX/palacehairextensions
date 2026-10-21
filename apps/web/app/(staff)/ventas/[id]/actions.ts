"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, pesosToCents, str } from "@/lib/actions";
import { businessMessage } from "@/lib/errors";
import { can, requireStaff } from "@/lib/staff";
import { MANAGER_ROLES, POS_ROLES, posContext } from "../../pos/_lib/session";

const methodSchema = z.enum(["cash", "card", "transfer"]);

/** Abono a una cuenta pendiente; el efectivo exige caja abierta y cuenta en ella. */
export async function payBalanceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...POS_ROLES)) return { error: businessMessage({ message: "FORBIDDEN" }) };
  const sale = z.uuid().safeParse(str(form, "sale_id"));
  const method = methodSchema.safeParse(str(form, "method"));
  const amount = pesosToCents(str(form, "amount"));
  if (!sale.success || !method.success) return { error: "Datos inválidos." };
  if (!amount) return { error: "Escribe el importe del abono en pesos." };
  const reference = str(form, "reference").slice(0, 80);
  if (method.data === "card" && !reference) return { error: "Captura la referencia de la terminal." };

  const { session } = await posContext(supabase, staff);
  if (method.data === "cash" && !session) return { error: "Abre la caja para recibir efectivo." };

  const { data, error } = await supabase.rpc("pay_sale_balance", {
    p_sale: sale.data,
    p_method: method.data,
    p_amount: amount,
    p_provider_ref: reference || null,
    p_cash_session: session?.id ?? null,
  });
  if (error) return { error: businessMessage(error) };
  revalidatePath(`/ventas/${sale.data}`);
  redirect(`/ventas/${sale.data}?aviso=${Number(data) === 0 ? "liquidada" : "abono"}`);
}

/** Devolución de una línea (solo propietaria/administración; la BD lo vuelve a validar). */
export async function refundLineAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...MANAGER_ROLES)) return { error: businessMessage({ message: "FORBIDDEN" }) };
  const parsed = z
    .object({
      sale_id: z.uuid(),
      line_id: z.uuid(),
      quantity: z.coerce.number().positive().max(999),
      method: methodSchema,
      reason: z.string().trim().min(1, "Escribe el motivo.").max(300),
    })
    .safeParse({
      sale_id: str(form, "sale_id"),
      line_id: str(form, "line_id"),
      quantity: str(form, "quantity"),
      method: str(form, "method"),
      reason: str(form, "reason"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;
  const { session } = await posContext(supabase, staff);
  if (d.method === "cash" && !session) return { error: "Abre la caja para devolver efectivo." };

  const { data, error } = await supabase.rpc("refund_sale_line", {
    p_line: d.line_id,
    p_qty: d.quantity,
    p_restock: form.get("restock") === "on",
    p_reason: d.reason,
    p_method: d.method,
    p_cash_session: session?.id ?? null,
  });
  if (error) return { error: businessMessage(error) };
  revalidatePath(`/ventas/${d.sale_id}`);
  const cents = (data as { refund_cents: number }).refund_cents;
  redirect(`/ventas/${d.sale_id}?aviso=devolucion&importe=${cents}`);
}

/** Cancelación completa de la venta: revierte inventario, tarjetas de regalo y anticipos. */
export async function voidSaleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...MANAGER_ROLES)) return { error: businessMessage({ message: "FORBIDDEN" }) };
  const sale = z.uuid().safeParse(str(form, "sale_id"));
  if (!sale.success) return { error: "Datos inválidos." };
  const reason = str(form, "reason").slice(0, 300);
  if (!reason) return { error: "Escribe el motivo de la cancelación." };
  if (str(form, "confirm").toUpperCase() !== "CANCELAR") return { error: "Escribe CANCELAR para confirmar." };
  const { error } = await supabase.rpc("void_sale", { p_sale: sale.data, p_reason: reason });
  if (error) return { error: businessMessage(error) };
  revalidatePath(`/ventas/${sale.data}`);
  redirect(`/ventas/${sale.data}?aviso=cancelada`);
}
