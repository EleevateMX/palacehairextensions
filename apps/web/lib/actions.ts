import "server-only";
import { businessMessage } from "./errors";

/** Resultado estándar de una Server Action usada con <ActionForm>. */
export type ActionState = { ok?: string; error?: string; data?: Record<string, unknown> };

export const initialState: ActionState = {};

/** Convierte un error de Supabase/PostgREST en un mensaje para el personal. */
export function fail(error: { message?: string; code?: string } | null | undefined, fallback?: string): ActionState {
  return { error: businessMessage(error, fallback) };
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(form: FormData, key: string): string | null {
  const v = str(form, key);
  return v === "" ? null : v;
}

/** "1,234.50" o "1234.5" (pesos) → centavos enteros. Devuelve null si no es válido. */
export function pesosToCents(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [int, dec = ""] = clean.split(".");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}

export function num(form: FormData, key: string): number | null {
  const v = str(form, key);
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
