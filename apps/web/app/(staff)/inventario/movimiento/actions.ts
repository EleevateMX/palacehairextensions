"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail, pesosToCents } from "@/lib/actions";
import { requireStaff } from "@/lib/staff";
import { canWrite, QTY_RE, workingLocation } from "../_lib/shared";

const qtyField = (allowNegative: boolean) =>
  z
    .string()
    .trim()
    .regex(QTY_RE, "Cantidad inválida: usa hasta 3 decimales.")
    .transform(Number)
    .refine((n) => n !== 0, "La cantidad no puede ser cero.")
    .refine((n) => allowNegative || n > 0, "La cantidad debe ser mayor a cero.");

const note = z.string().trim().max(500).optional().transform((s) => s || null);

const schemas = {
  entry: z.object({
    type: z.enum(["initial", "purchase"], { message: "Elige el tipo de entrada." }),
    variant_id: z.guid({ message: "Elige el producto." }),
    quantity: qtyField(false),
    unit_cost: z.string().trim().optional(),
    note,
  }),
  waste: z.object({
    variant_id: z.guid({ message: "Elige el producto." }),
    quantity: qtyField(false),
    note: z.string().trim().min(3, "Escribe el motivo.").max(500),
  }),
  adjustment: z.object({
    variant_id: z.guid({ message: "Elige el producto." }),
    quantity: qtyField(true),
    note: z.string().trim().min(3, "Escribe el motivo.").max(500),
  }),
  supplier_return: z.object({
    variant_id: z.guid({ message: "Elige el producto." }),
    quantity: qtyField(false),
    note,
  }),
};

const DONE: Record<string, string> = {
  initial: "Entrada inicial registrada",
  purchase: "Compra registrada",
  waste: "Merma registrada",
  adjustment: "Ajuste registrado",
  supplier_return: "Devolución a proveedor registrada",
};

/** Entradas, mermas, ajustes y devoluciones a proveedor → RPC record_stock_movement (valida rol y existencias). */
export async function recordMovementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const { location } = await workingLocation(supabase, staff);
  if (!location) return { error: "No hay sucursal activa." };
  const kind = String(form.get("kind") ?? "") as keyof typeof schemas;
  const schema = schemas[kind];
  if (!schema) return { error: "Tipo de movimiento inválido." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data as { type?: string; variant_id: string; quantity: number; note: string | null; unit_cost?: string };
  const type = kind === "entry" ? d.type! : kind;
  let unitCost: number | null = null;
  if (kind === "entry" && d.unit_cost) {
    unitCost = pesosToCents(d.unit_cost);
    if (unitCost === null) return { error: "El costo unitario no es un importe válido." };
  }
  const { data, error } = await supabase.rpc("record_stock_movement", {
    p_variant: d.variant_id,
    p_location: location.id,
    p_type: type,
    p_qty: d.quantity,
    p_note: d.note,
    p_unit_cost: unitCost,
  });
  if (error) return fail(error, "No se pudo registrar el movimiento.");
  revalidatePath("/inventario");
  revalidatePath(`/inventario/kardex/${d.variant_id}`);
  return { ok: `${DONE[type]} (movimiento #${data}).` };
}

const transferSchema = z.object({
  variant_id: z.guid({ message: "Elige el producto." }),
  from: z.guid(),
  to: z.guid({ message: "Elige la sucursal destino." }),
  quantity: qtyField(false),
  note,
});

export async function transferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const parsed = transferSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;
  if (d.from === d.to) return { error: "El origen y el destino deben ser distintos." };
  const { error } = await supabase.rpc("transfer_stock", { p_variant: d.variant_id, p_from: d.from, p_to: d.to, p_qty: d.quantity, p_note: d.note });
  if (error) return fail(error, "No se pudo transferir.");
  revalidatePath("/inventario");
  revalidatePath(`/inventario/kardex/${d.variant_id}`);
  return { ok: "Transferencia registrada." };
}
