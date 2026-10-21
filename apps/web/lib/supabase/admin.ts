import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la llave SECRETA (service_role): omite RLS. Solo servidor.
 * Usar únicamente para: alta de personal en Auth, portal público y webhooks.
 * Toda llamada debe validar antes el permiso de quien la origina.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SECRET_KEY (solo servidor)");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const hasAdminKey = () => Boolean(process.env.SUPABASE_SECRET_KEY);
