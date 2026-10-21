"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail } from "@/lib/actions";
import { requireStaff } from "@/lib/staff";
import { canWrite } from "../_lib/shared";

const opt = (max: number) => z.string().trim().max(max).optional().transform((s) => s || null);

const schema = z.object({
  id: z.string().optional().transform((s) => s || null).pipe(z.guid().nullable()),
  name: z.string().trim().min(2, "Escribe el nombre del proveedor.").max(160),
  contact_name: opt(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((s) => s || null)
    .refine((s) => s === null || /^[+\d][\d\s()-]{6,}$/.test(s), "Teléfono inválido."),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((s) => s || null)
    .refine((s) => s === null || z.email().safeParse(s).success, "Correo inválido."),
  rfc: z
    .string()
    .trim()
    .max(13)
    .optional()
    .transform((s) => (s ? s.toUpperCase() : null))
    .refine((s) => s === null || /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(s), "RFC inválido (12 o 13 caracteres)."),
  notes: opt(1000),
});

export async function saveSupplierAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { id, ...row } = parsed.data;
  const values = { ...row, is_active: id ? form.get("is_active") === "on" : true };
  if (id) {
    const { data, error } = await supabase.from("suppliers").update(values).eq("id", id).select("id");
    if (error) return fail(error, "No se pudo guardar el proveedor.");
    if (!data?.length) return { error: "No se encontró el proveedor." };
  } else {
    const { error } = await supabase.from("suppliers").insert(values);
    if (error) return fail(error, "No se pudo crear el proveedor.");
  }
  revalidatePath("/inventario/proveedores");
  return { ok: id ? "Proveedor guardado." : "Proveedor creado." };
}
