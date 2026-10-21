"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail, pesosToCents } from "@/lib/actions";
import { currentLocationId } from "@/lib/location";
import { can, requireStaff } from "@/lib/staff";

const expenseSchema = z.object({
  expense_date: z.iso.date({ error: "Fecha inválida" }),
  category: z.string().trim().min(1, "Escribe la categoría").max(80),
  kind: z.enum(["fixed", "variable"], { error: "Elige si es fijo o variable" }),
  amount: z.string().trim().min(1, "Escribe el importe"),
  description: z.string().trim().max(500).optional().transform((v) => (v ? v : null)),
  supplier_id: z.union([z.uuid(), z.literal("")]).optional().transform((v) => (v ? v : null)),
  payment_method: z.enum(["cash", "card", "transfer", "other", ""]).optional().transform((v) => (v ? v : null)),
});

async function manager() {
  const ctx = await requireStaff();
  if (!can(ctx.staff, "owner", "admin")) return null;
  return ctx;
}

function parseExpense(form: FormData): { data?: Record<string, unknown>; error?: string } {
  const parsed = expenseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const cents = pesosToCents(parsed.data.amount);
  if (cents === null || cents <= 0) return { error: "Importe inválido: usa pesos, p. ej. 1500 o 1,500.50" };
  if (cents > 2_000_000_000) return { error: "Importe demasiado grande." };
  const { amount: _amount, ...rest } = parsed.data;
  return { data: { ...rest, amount_cents: cents } };
}

export async function createExpense(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await manager();
  if (!ctx) return { error: "Tu rol no tiene permiso para registrar gastos." };
  const { data, error } = parseExpense(form);
  if (error) return { error };
  const locationId = await currentLocationId(ctx.supabase, ctx.staff);
  if (!locationId) return { error: "No hay una sucursal activa." };
  const { error: dbError } = await ctx.supabase.from("expenses").insert({ ...data, location_id: locationId });
  if (dbError) return fail(dbError);
  revalidatePath("/finanzas");
  return { ok: "Gasto registrado." };
}

export async function updateExpense(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await manager();
  if (!ctx) return { error: "Tu rol no tiene permiso para editar gastos." };
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Gasto inválido." };
  const { data, error } = parseExpense(form);
  if (error) return { error };
  const { data: updated, error: dbError } = await ctx.supabase.from("expenses").update(data!).eq("id", id.data).select("id");
  if (dbError) return fail(dbError);
  if (!updated?.length) return { error: "No se encontró el gasto." };
  revalidatePath("/finanzas");
  return { ok: "Gasto actualizado." };
}

export async function deleteExpense(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await manager();
  if (!ctx) return { error: "Tu rol no tiene permiso para eliminar gastos." };
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Gasto inválido." };
  // La bitácora de auditoría conserva el registro eliminado.
  const { data, error } = await ctx.supabase.from("expenses").delete().eq("id", id.data).select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "No se encontró el gasto." };
  revalidatePath("/finanzas");
  return { ok: "Gasto eliminado." };
}
