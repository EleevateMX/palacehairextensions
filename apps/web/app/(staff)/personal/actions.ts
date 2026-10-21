"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail } from "@/lib/actions";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { checkbox, firstIssue, optText, optUuid, text } from "../configuracion/_lib/fields";
import { managerAction } from "../configuracion/_lib/guard";

/** Contraseña temporal fuerte (cumple: ≥10, mayúsculas, minúsculas y dígitos). */
function temporaryPassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) => set[randomInt(set.length)]!;
  const chars = [pick(upper), pick(lower), pick(digits), ...Array.from({ length: length - 3 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

const ROLES = ["owner", "admin", "receptionist", "stylist", "inventory", "sales"] as const;

const createSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Correo inválido")),
  display_name: text("Nombre", 2, 80),
  role: z.enum(ROLES, "Rol inválido"),
  is_bookable: checkbox,
  location_id: optUuid,
  phone: optText(20),
});

/**
 * Alta de personal: 1) verifica owner/admin, 2) crea la cuenta en Auth con la llave secreta (solo
 * servidor), 3) inserta el expediente con la sesión de quien da de alta (RLS + guarda de rol propietaria).
 * Sin servicio de correo aún: se genera una contraseña temporal que se muestra UNA vez.
 */
export async function createStaffMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (d.role === "owner" && ctx.staff.role !== "owner") return { error: "Solo la propietaria puede asignar el rol de propietaria." };
  if (!hasAdminKey()) return { error: "Falta configurar SUPABASE_SECRET_KEY en el servidor para crear cuentas." };

  const admin = createAdminClient();
  const password = temporaryPassword();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: d.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: d.display_name },
  });
  if (authError || !created.user) {
    const msg = authError?.message ?? "";
    if (/already|registered|exists/i.test(msg) || authError?.status === 422) return { error: "Ya existe una cuenta con ese correo." };
    return { error: "No se pudo crear la cuenta de acceso. Intenta de nuevo." };
  }

  const { data: staffRow, error } = await ctx.supabase
    .from("staff_members")
    .insert({
      user_id: created.user.id,
      email: d.email,
      display_name: d.display_name,
      role: d.role,
      is_bookable: d.is_bookable,
      location_id: d.location_id ?? ctx.staff.locationId,
      phone: d.phone,
    })
    .select("id")
    .single();
  if (error || !staffRow) {
    // Sin expediente la cuenta no sirve: se elimina para no dejar accesos huérfanos.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    if (error?.message === "FORBIDDEN" && d.role === "owner") return { error: "Solo la propietaria puede asignar el rol de propietaria." };
    return fail(error);
  }
  revalidatePath("/personal");
  return {
    ok: `${d.display_name} fue dada de alta.`,
    data: { email: d.email, password, staffId: staffRow.id },
  };
}
