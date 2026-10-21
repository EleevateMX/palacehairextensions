"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.email(),
  password: z.string().min(10),
  next: z.string().startsWith("/").default("/dashboard"),
});

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Revisa el correo y la contraseña (mínimo 10 caracteres)." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  // Mensaje genérico: no revelar si el correo existe.
  if (error) return { error: "Credenciales incorrectas o cuenta no habilitada." };
  // Evita redirecciones abiertas: solo rutas internas.
  redirect(parsed.data.next.startsWith("//") ? "/dashboard" : parsed.data.next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
