"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail } from "@/lib/actions";
import { requireStaff } from "@/lib/staff";
import { canReserve, QTY_RE } from "../../_lib/shared";

const reserveSchema = z.object({
  variant_id: z.guid(),
  location_id: z.guid(),
  quantity: z
    .string()
    .trim()
    .regex(QTY_RE, "Cantidad inválida: usa hasta 3 decimales.")
    .transform(Number)
    .refine((n) => n > 0, "La cantidad debe ser mayor a cero."),
  client_id: z
    .string()
    .optional()
    .transform((s) => s || null)
    .pipe(z.guid().nullable()),
  note: z.string().trim().max(500).optional().transform((s) => s || null),
});

/** Apartado manual de material (por clienta u otra razón) → RPC reserve_stock. */
export async function reserveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canReserve(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const parsed = reserveSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;
  const { error } = await supabase.rpc("reserve_stock", {
    p_variant: d.variant_id,
    p_location: d.location_id,
    p_qty: d.quantity,
    p_client: d.client_id,
    p_note: d.note,
  });
  if (error) return fail(error, "No se pudo apartar.");
  revalidatePath(`/inventario/kardex/${d.variant_id}`);
  revalidatePath("/inventario");
  return { ok: "Material apartado." };
}

export async function releaseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canReserve(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const ids = z.object({ reservation_id: z.guid(), variant_id: z.guid() }).safeParse(Object.fromEntries(form));
  if (!ids.success) return { error: "Datos inválidos." };
  const { error } = await supabase.rpc("release_reservation", { p_reservation: ids.data.reservation_id });
  if (error) return fail(error, "No se pudo liberar.");
  revalidatePath(`/inventario/kardex/${ids.data.variant_id}`);
  revalidatePath("/inventario");
  return { ok: "Reserva liberada." };
}
