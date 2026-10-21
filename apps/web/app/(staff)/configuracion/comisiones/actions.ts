"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, fail, pesosToCents, str } from "@/lib/actions";
import { commissionRuleSchema, firstIssue, percentToBps } from "../_lib/fields";
import { managerAction } from "../_lib/guard";

const invalid = (label: string): ActionState => ({ error: `${label}: valor inválido.` });

/** Construye la regla (tipos de @palace/domain/commissions) a partir del formulario y la valida. */
function buildRule(form: FormData): { rule: unknown } | ActionState {
  const kind = str(form, "kind");
  const serviceIds = form.getAll("service_ids").map(String).filter(Boolean);
  const base = str(form, "base") || "services";
  switch (kind) {
    case "percent_service":
    case "percent_product": {
      const bps = percentToBps(str(form, "pct"));
      if (bps === null) return invalid("Porcentaje");
      return { rule: kind === "percent_service" ? { kind, bps, ...(serviceIds.length ? { serviceIds } : {}) } : { kind, bps } };
    }
    case "fixed_service": {
      const amountCents = pesosToCents(str(form, "amount"));
      if (amountCents === null) return invalid("Monto por servicio");
      return { rule: { kind, amountCents, ...(serviceIds.length ? { serviceIds } : {}) } };
    }
    case "tiered": {
      const froms = form.getAll("tier_from").map((v) => String(v).trim());
      const pcts = form.getAll("tier_pct").map((v) => String(v).trim());
      const tiers: { fromCents: number; bps: number }[] = [];
      for (let i = 0; i < froms.length; i++) {
        if (!froms[i] && !pcts[i]) continue;
        const fromCents = pesosToCents(froms[i] || "0");
        const bps = percentToBps(pcts[i] ?? "");
        if (fromCents === null || bps === null) return { error: `Tramo ${i + 1}: revisa el importe y el porcentaje.` };
        tiers.push({ fromCents, bps });
      }
      tiers.sort((a, b) => a.fromCents - b.fromCents);
      return { rule: { kind, base, marginal: str(form, "marginal") === "si", tiers } };
    }
    case "goal_bonus": {
      const targetCents = pesosToCents(str(form, "target"));
      const bonusCents = pesosToCents(str(form, "bonus"));
      if (targetCents === null) return invalid("Meta");
      if (bonusCents === null) return invalid("Bono");
      return { rule: { kind, base, targetCents, bonusCents } };
    }
    default:
      return { error: "Tipo de regla inválido." };
  }
}

export async function createCommissionRule(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const staffId = z.uuid().safeParse(str(form, "staff_id"));
  if (!staffId.success) return { error: "Selecciona a la persona." };
  const built = buildRule(form);
  if (!("rule" in built)) return built;
  const parsed = commissionRuleSchema.safeParse(built.rule);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const notes = str(form, "notes").slice(0, 300) || null;
  const { error } = await ctx.supabase
    .from("commission_rules")
    .insert({ staff_id: staffId.data, rule: parsed.data, notes, created_by: ctx.staff.id });
  if (error) return fail(error);
  revalidatePath("/configuracion/comisiones");
  return { ok: "Regla de comisión creada." };
}

export async function deactivateCommissionRule(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const id = z.uuid().safeParse(str(form, "id"));
  if (!id.success) return { error: "Regla inválida." };
  // Las reglas no se borran: se desactivan para conservar el historial auditable.
  const { error, count } = await ctx.supabase.from("commission_rules").update({ is_active: false }, { count: "exact" }).eq("id", id.data);
  if (error) return fail(error);
  if (!count) return { error: "No se encontró la regla." };
  revalidatePath("/configuracion/comisiones");
  return { ok: "Regla desactivada." };
}
