"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail } from "@/lib/actions";
import { requireStaff } from "@/lib/staff";
import { canWrite, workingLocation } from "../_lib/shared";

const COUNTED_RE = /^\d{1,9}(\.\d{1,3})?$/;

export async function startCountAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const { location } = await workingLocation(supabase, staff);
  if (!location) return { error: "No hay sucursal activa." };
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("stock_counts")
    .insert({ location_id: location.id, started_by: auth.user?.id ?? null })
    .select("id")
    .single();
  if (error) return fail(error, "No se pudo iniciar el conteo.");
  revalidatePath("/inventario/conteos");
  redirect(`/inventario/conteos/${data.id}`);
}

/** Guarda lo contado. Campos `qty_<variante>`: vacío = no contado (se quita la partida). */
export async function saveCountLinesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const countId = z.guid().safeParse(form.get("count_id"));
  if (!countId.success) return { error: "Conteo inválido." };
  const upserts: { stock_count_id: string; variant_id: string; counted_qty: number }[] = [];
  const removals: string[] = [];
  for (const [key, raw] of form.entries()) {
    if (!key.startsWith("qty_") || typeof raw !== "string") continue;
    const variantId = key.slice(4);
    if (!z.guid().safeParse(variantId).success) return { error: "Datos inválidos." };
    const value = raw.trim();
    const had = form.get(`had_${variantId}`) === "1";
    if (value === "") {
      if (had) removals.push(variantId);
      continue;
    }
    if (!COUNTED_RE.test(value)) return { error: `Cantidad inválida: «${value}». Usa números positivos con hasta 3 decimales.` };
    upserts.push({ stock_count_id: countId.data, variant_id: variantId, counted_qty: Number(value) });
  }
  if (upserts.length) {
    const { error } = await supabase.from("stock_count_lines").upsert(upserts, { onConflict: "stock_count_id,variant_id" });
    if (error) return fail(error, "No se pudo guardar el conteo (¿sigue abierto?).");
  }
  if (removals.length) {
    const { error } = await supabase.from("stock_count_lines").delete().eq("stock_count_id", countId.data).in("variant_id", removals);
    if (error) return fail(error, "No se pudo guardar el conteo.");
  }
  revalidatePath(`/inventario/conteos/${countId.data}`);
  return { ok: `Conteo guardado (${upserts.length} partidas).` };
}

export async function applyCountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const countId = z.guid().safeParse(form.get("count_id"));
  if (!countId.success) return { error: "Conteo inválido." };
  const { data, error } = await supabase.rpc("apply_stock_count", { p_count: countId.data });
  if (error) return fail(error, "No se pudo aplicar el conteo.");
  revalidatePath(`/inventario/conteos/${countId.data}`);
  revalidatePath("/inventario/conteos");
  revalidatePath("/inventario");
  // El formulario de aplicar desaparece al cerrarse el conteo: el aviso viaja en la URL.
  redirect(`/inventario/conteos/${countId.data}?aplicado=${Number(data)}`);
}

export async function cancelCountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const countId = z.guid().safeParse(form.get("count_id"));
  if (!countId.success) return { error: "Conteo inválido." };
  const { error } = await supabase.rpc("cancel_stock_count", { p_count: countId.data });
  if (error) return fail(error, "No se pudo cancelar el conteo.");
  revalidatePath(`/inventario/conteos/${countId.data}`);
  revalidatePath("/inventario/conteos");
  redirect(`/inventario/conteos/${countId.data}?cancelado=1`);
}
