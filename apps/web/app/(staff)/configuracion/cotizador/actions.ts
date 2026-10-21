"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, fail, pesosToCents, str } from "@/lib/actions";
import { firstIssue, percentToBps, quoteConfigSchema } from "../_lib/fields";
import { managerAction } from "../_lib/guard";

const all = (form: FormData, key: string) => form.getAll(key).map((v) => String(v).trim());

export async function saveQuoteConfig(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };

  const rangeBps = percentToBps(str(form, "range_pct"));
  if (rangeBps === null) return { error: "Variación del rango: porcentaje entre 0 y 100." };

  const keys = all(form, "tech_key");
  const labels = all(form, "tech_label");
  const labor = all(form, "tech_labor");
  const supplies = all(form, "tech_supplies");
  const consult = all(form, "tech_consult");
  const techniques: Record<string, { label: string; laborCents: number; suppliesCents: number; alwaysConsult?: boolean }> = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!.toLowerCase();
    if (!key && !labels[i] && !labor[i] && !supplies[i]) continue;
    const laborCents = pesosToCents(labor[i] ?? "");
    const suppliesCents = pesosToCents(supplies[i] || "0");
    if (laborCents === null || suppliesCents === null) return { error: `Técnica «${labels[i] || key}»: importes inválidos.` };
    if (techniques[key]) return { error: `La clave de técnica «${key}» está repetida.` };
    techniques[key] = { label: labels[i] ?? "", laborCents, suppliesCents, ...(consult[i] === "si" ? { alwaysConsult: true } : {}) };
  }

  const lengths = all(form, "g_length");
  const natural = all(form, "g_natural");
  const medio = all(form, "g_medio");
  const abundante = all(form, "g_abundante");
  const gramsTable: { lengthCm: number; grams: { natural: number; medio: number; abundante: number } }[] = [];
  for (let i = 0; i < lengths.length; i++) {
    const cells = [lengths[i], natural[i], medio[i], abundante[i]];
    if (cells.every((c) => !c)) continue;
    if (!cells.every((c) => /^\d+$/.test(c ?? ""))) return { error: `Tabla de gramos, fila ${i + 1}: usa números enteros.` };
    gramsTable.push({ lengthCm: Number(lengths[i]), grams: { natural: Number(natural[i]), medio: Number(medio[i]), abundante: Number(abundante[i]) } });
  }
  gramsTable.sort((a, b) => a.lengthCm - b.lengthCm);

  const parsed = quoteConfigSchema.safeParse({
    rangeBps,
    gramsTable,
    techniques,
    // Los valores siguen siendo de EJEMPLO hasta que Palace los valide explícitamente.
    example: form.get("validated") !== "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { error, count } = await ctx.supabase.from("business_settings").update({ quote_config: parsed.data }, { count: "exact" }).eq("id", 1);
  if (error) return fail(error);
  if (!count) return { error: "Tu rol no tiene permiso para esta operación." };
  revalidatePath("/configuracion/cotizador");
  revalidatePath("/cotizador");
  return { ok: "Configuración del cotizador guardada." };
}
