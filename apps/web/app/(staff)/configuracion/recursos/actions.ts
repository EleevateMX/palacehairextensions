"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail } from "@/lib/actions";
import { checkbox, firstIssue, intField, text, uuidField } from "../_lib/fields";
import { managerAction } from "../_lib/guard";

const typeSchema = z.object({
  code: text("Clave", 2, 30)
    .transform((v) => v.toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9_-]+$/, "Clave: solo minúsculas, números, guion o guion bajo")),
  name: text("Nombre", 2, 60),
});

export async function createResourceType(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = typeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await ctx.supabase.from("resource_types").insert(parsed.data);
  if (error) return error.code === "23505" ? { error: "Ya existe un tipo de recurso con esa clave." } : fail(error);
  revalidatePath("/configuracion/recursos");
  return { ok: "Tipo de recurso creado." };
}

const resourceSchema = z.object({
  location_id: uuidField("Sucursal"),
  resource_type_id: uuidField("Tipo de recurso"),
  name: text("Nombre", 1, 60),
  sort_order: intField("Orden", 0, 999),
});

export async function createResource(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = resourceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await ctx.supabase.from("resources").insert(parsed.data);
  if (error) return fail(error);
  revalidatePath("/configuracion/recursos");
  return { ok: `Recurso «${parsed.data.name}» creado.` };
}

const toggleSchema = z.object({ id: uuidField("Recurso"), active: checkbox });

/** Activar/desactivar una unidad. Desactivarla no cancela citas ya asignadas. */
export async function setResourceActive(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = toggleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error, count } = await ctx.supabase.from("resources").update({ is_active: parsed.data.active }, { count: "exact" }).eq("id", parsed.data.id);
  if (error) return fail(error);
  if (!count) return { error: "No se encontró el recurso." };
  revalidatePath("/configuracion/recursos");
  return { ok: parsed.data.active ? "Recurso activado." : "Recurso desactivado: ya no se asignará a nuevas citas." };
}
