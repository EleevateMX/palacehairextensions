"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail, pesosToCents, str } from "@/lib/actions";
import { requireStaff } from "@/lib/staff";
import { canWrite, MAX_PO_LINES as MAX_LINES, QTY_RE, workingLocation } from "../_lib/shared";



export async function createPurchaseOrderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const { location } = await workingLocation(supabase, staff);
  if (!location) return { error: "No hay sucursal activa." };
  const head = z
    .object({
      supplier_id: z.guid({ message: "Elige el proveedor." }),
      expected_at: z
        .string()
        .optional()
        .transform((s) => s || null)
        .refine((s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s), "Fecha esperada inválida."),
      notes: z.string().trim().max(1000).optional().transform((s) => s || null),
    })
    .safeParse(Object.fromEntries(form));
  if (!head.success) return { error: head.error.issues[0]?.message ?? "Datos inválidos." };

  const lines: { variant_id: string; qty: number; unit_cost_cents: number }[] = [];
  for (let i = 0; i < MAX_LINES; i++) {
    const variant = str(form, `line_variant_${i}`);
    const q = str(form, `line_qty_${i}`);
    const cost = str(form, `line_cost_${i}`);
    if (!variant && !q) continue;
    const n = i + 1;
    if (!z.guid().safeParse(variant).success) return { error: `Partida ${n}: elige el producto.` };
    if (!QTY_RE.test(q) || Number(q) <= 0) return { error: `Partida ${n}: la cantidad debe ser mayor a cero (hasta 3 decimales).` };
    const cents = pesosToCents(cost || "0");
    if (cents === null) return { error: `Partida ${n}: costo unitario inválido.` };
    lines.push({ variant_id: variant, qty: Number(q), unit_cost_cents: cents });
  }
  if (lines.length === 0) return { error: "Agrega al menos una partida." };

  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_supplier: head.data.supplier_id,
    p_location: location.id,
    p_expected: head.data.expected_at,
    p_notes: head.data.notes,
    p_lines: lines,
  });
  if (error) return fail(error, "No se pudo crear la orden.");
  revalidatePath("/inventario/compras");
  redirect(`/inventario/compras/${data}`);
}

async function setStatus(form: FormData, to: "sent" | "cancelled", from: string[]): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const id = z.guid().safeParse(form.get("po_id"));
  if (!id.success) return { error: "Orden inválida." };
  const { data, error } = await supabase.from("purchase_orders").update({ status: to }).eq("id", id.data).in("status", from).select("id");
  if (error) return fail(error, "No se pudo actualizar la orden.");
  if (!data?.length) return { error: "La orden ya no está en un estado que permita este cambio." };
  revalidatePath(`/inventario/compras/${id.data}`);
  revalidatePath("/inventario/compras");
  // El botón desaparece con el cambio de estado: el aviso viaja en la URL.
  redirect(`/inventario/compras/${id.data}?ok=${to === "sent" ? "enviada" : "cancelada"}`);
}

export async function markSentAction(_prev: ActionState, form: FormData) {
  return setStatus(form, "sent", ["draft"]);
}

export async function cancelPurchaseOrderAction(_prev: ActionState, form: FormData) {
  return setStatus(form, "cancelled", ["draft", "sent"]);
}

/** Recepción (parcial o total) de una partida → RPC receive_purchase_order_line (entra al kardex con su costo). */
export async function receiveLineAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const ids = z.object({ po_id: z.guid(), line_id: z.guid() }).safeParse(Object.fromEntries(form));
  if (!ids.success) return { error: "Datos inválidos." };
  const q = str(form, "quantity");
  if (!QTY_RE.test(q) || Number(q) <= 0) return { error: "La cantidad debe ser mayor a cero (hasta 3 decimales)." };
  const { error } = await supabase.rpc("receive_purchase_order_line", { p_line: ids.data.line_id, p_qty: Number(q) });
  if (error) {
    if (error.message === "INVALID_QUANTITY") return { error: "Cantidad inválida: no puede exceder lo pendiente por recibir." };
    return fail(error, "No se pudo registrar la recepción.");
  }
  revalidatePath(`/inventario/compras/${ids.data.po_id}`);
  revalidatePath("/inventario/compras");
  revalidatePath("/inventario");
  return { ok: `Recibido: ${q}.` };
}
