import "server-only";
import type { CommissionRule, QuoteConfig } from "@palace/domain";
import { z } from "zod";
import { pesosToCents } from "@/lib/actions";

/**
 * Campos de formulario (FormData → valores tipados) con mensajes en español.
 * El dinero entra en pesos y se guarda en centavos enteros; los porcentajes en puntos base.
 */

const raw = z.string().optional().transform((v) => (v ?? "").trim());

export const text = (label: string, min = 1, max = 200) =>
  raw.pipe(z.string().min(min, `${label}: es obligatorio`).max(max, `${label}: máximo ${max} caracteres`));

export const optText = (max = 2000) => raw.transform((v) => (v === "" ? null : v.slice(0, max)));

export const checkbox = z.string().optional().transform((v) => v === "on" || v === "true");

export const intField = (label: string, min = 0, max = 1_000_000) =>
  raw.transform((s, ctx): number => {
    if (!/^-?\d+$/.test(s)) {
      ctx.addIssue({ code: "custom", message: `${label}: escribe un número entero` });
      return z.NEVER;
    }
    const n = Number(s);
    if (n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${label}: debe estar entre ${min} y ${max}` });
      return z.NEVER;
    }
    return n;
  });

export const optIntField = (label: string, min = 0, max = 1_000_000) =>
  raw.transform((s, ctx): number | null => {
    if (s === "") return null;
    if (!/^-?\d+$/.test(s) || Number(s) < min || Number(s) > max) {
      ctx.addIssue({ code: "custom", message: `${label}: escribe un entero entre ${min} y ${max}` });
      return z.NEVER;
    }
    return Number(s);
  });

export const pesosField = (label: string) =>
  raw.transform((s, ctx): number => {
    const c = pesosToCents(s);
    if (c === null) {
      ctx.addIssue({ code: "custom", message: `${label}: importe inválido (p. ej. 1500 o 1,500.50)` });
      return z.NEVER;
    }
    return c;
  });

export const optPesosField = (label: string) =>
  raw.transform((s, ctx): number | null => {
    if (s === "") return null;
    const c = pesosToCents(s);
    if (c === null) {
      ctx.addIssue({ code: "custom", message: `${label}: importe inválido` });
      return z.NEVER;
    }
    return c;
  });

/** "12.5" (%) → 1250 puntos base. Máximo 100 %. */
export function percentToBps(input: string): number | null {
  const clean = input.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const bps = Math.round(Number(clean) * 100);
  return bps <= 10_000 ? bps : null;
}

export const bpsToPercent = (bps: number) => String(bps / 100);
export const centsToPesos = (cents: number) => (cents / 100).toFixed(2);

export const percentField = (label: string) =>
  raw.transform((s, ctx): number => {
    const b = percentToBps(s);
    if (b === null) {
      ctx.addIssue({ code: "custom", message: `${label}: porcentaje entre 0 y 100 (máx. 2 decimales)` });
      return z.NEVER;
    }
    return b;
  });

export const uuidField = (label: string) => raw.pipe(z.uuid(`${label}: selecciona una opción válida`));
export const optUuid = raw.transform((v) => (v === "" ? null : v)).pipe(z.uuid().nullable());

/** Primer mensaje de error de zod, para mostrar en el formulario. */
export const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos";

// ---------------------------------------------------------------------------
// Rangos semanales (horarios del negocio / turnos del personal)
// ---------------------------------------------------------------------------
export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
/** Orden de presentación: lunes primero. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type WeeklyRange = { weekday: number; starts: string; ends: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lee `start_<día>` / `end_<día>` repetidos del formulario y valida (fin > inicio, sin traslapes). */
export function readWeeklyRanges(form: FormData): { ranges: WeeklyRange[] } | { error: string } {
  const ranges: WeeklyRange[] = [];
  for (let d = 0; d <= 6; d++) {
    const starts = form.getAll(`start_${d}`).map(String);
    const ends = form.getAll(`end_${d}`).map(String);
    const day: WeeklyRange[] = [];
    for (let i = 0; i < Math.max(starts.length, ends.length); i++) {
      const s = (starts[i] ?? "").trim().slice(0, 5);
      const e = (ends[i] ?? "").trim().slice(0, 5);
      if (!s && !e) continue;
      if (!HHMM.test(s) || !HHMM.test(e)) return { error: `${WEEKDAYS[d]}: completa inicio y fin (HH:MM).` };
      if (e <= s) return { error: `${WEEKDAYS[d]}: el fin (${e}) debe ser posterior al inicio (${s}).` };
      day.push({ weekday: d, starts: s, ends: e });
    }
    day.sort((a, b) => a.starts.localeCompare(b.starts));
    for (let i = 1; i < day.length; i++) {
      if (day[i]!.starts < day[i - 1]!.ends) return { error: `${WEEKDAYS[d]}: hay rangos que se traslapan.` };
    }
    ranges.push(...day);
  }
  return { ranges };
}

// ---------------------------------------------------------------------------
// Reglas de comisión (mismos tipos que @palace/domain/commissions)
// ---------------------------------------------------------------------------
const bps = z.number().int().min(1, "El porcentaje debe ser mayor que 0").max(10_000);
const cents = z.number().int().min(0);
const base = z.enum(["services", "products", "all"]);

export const commissionRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("percent_service"), bps, serviceIds: z.array(z.uuid()).optional() }),
  z.object({ kind: z.literal("fixed_service"), amountCents: cents.min(1, "El importe debe ser mayor que 0"), serviceIds: z.array(z.uuid()).optional() }),
  z.object({ kind: z.literal("percent_product"), bps }),
  z.object({
    kind: z.literal("tiered"),
    base,
    marginal: z.boolean(),
    tiers: z
      .array(z.object({ fromCents: cents, bps }))
      .min(1, "Agrega al menos un tramo")
      .refine((t) => new Set(t.map((x) => x.fromCents)).size === t.length, "Hay tramos repetidos"),
  }),
  z.object({ kind: z.literal("goal_bonus"), base, targetCents: cents.min(1, "La meta debe ser mayor que 0"), bonusCents: cents.min(1, "El bono debe ser mayor que 0") }),
]) satisfies z.ZodType<CommissionRule>;

export const COMMISSION_KIND_LABEL: Record<CommissionRule["kind"], string> = {
  percent_service: "% sobre servicios",
  fixed_service: "Monto fijo por servicio",
  percent_product: "% sobre productos",
  tiered: "Escalonada por tramos",
  goal_bonus: "Bono por meta",
};

export const BASE_LABEL = { services: "servicios", products: "productos", all: "servicios + productos" } as const;

// ---------------------------------------------------------------------------
// Cotizador (business_settings.quote_config)
// ---------------------------------------------------------------------------
const grams = z.number().int().min(1, "Gramos: mínimo 1").max(2000, "Gramos: máximo 2000");

export const quoteConfigSchema = z.object({
  rangeBps: z.number().int().min(0).max(10_000),
  gramsTable: z
    .array(z.object({ lengthCm: z.number().int().min(10, "Largo mínimo 10 cm").max(150, "Largo máximo 150 cm"), grams: z.object({ natural: grams, medio: grams, abundante: grams }) }))
    .min(1, "Agrega al menos un largo a la tabla de gramos")
    .refine((rows) => new Set(rows.map((r) => r.lengthCm)).size === rows.length, "Hay largos repetidos en la tabla de gramos"),
  techniques: z
    .record(
      z.string().regex(/^[a-z0-9_-]{2,30}$/, "Clave de técnica: minúsculas, números o guiones (2–30)"),
      z.object({ label: z.string().min(2, "Nombre de técnica obligatorio").max(60), laborCents: cents, suppliesCents: cents, alwaysConsult: z.boolean().optional() }),
    )
    .refine((o) => Object.keys(o).length > 0, "Agrega al menos una técnica"),
  example: z.boolean(),
}) satisfies z.ZodType<QuoteConfig & { example: boolean }>;

export type StoredQuoteConfig = z.infer<typeof quoteConfigSchema>;

// ---------------------------------------------------------------------------
// Materiales de servicio (BOM)
// ---------------------------------------------------------------------------
export const MATERIAL_ROLES = ["hair", "adhesive", "tape", "prep", "disposable", "other"] as const;
export const MATERIAL_ROLE_LABEL: Record<(typeof MATERIAL_ROLES)[number], string> = {
  hair: "Cabello (extensión)",
  adhesive: "Adhesivo",
  tape: "Cinta",
  prep: "Preparación",
  disposable: "Desechable",
  other: "Otro",
};
