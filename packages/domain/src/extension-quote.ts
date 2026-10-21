import type { Cents } from "./money";

/**
 * Cotizador de extensiones. Produce un RANGO ESTIMADO, nunca un precio definitivo.
 * Toda la tabla de gramos, técnicas y tarifas es configuración del negocio (pendiente de validar con Palace).
 */

export type Volume = "natural" | "medio" | "abundante";

export interface QuoteConfig {
  /** Gramos recomendados por largo (cm) y volumen. Se usa el largo configurado igual o inmediato superior. */
  gramsTable: { lengthCm: number; grams: Record<Volume, number> }[];
  techniques: Record<
    string,
    {
      label: string;
      laborCents: Cents;
      /** Costo de insumos de instalación (adhesivo, cintas, etc.). */
      suppliesCents: Cents;
      /** Si la técnica siempre exige valoración presencial. */
      alwaysConsult?: boolean;
    }
  >;
  /** Variación ± aplicada al estimado (bps; 1500 = 15%). */
  rangeBps: number;
}

export interface QuoteHairOption {
  variantId: string;
  /** Precio público del paquete y gramos que contiene. */
  packPriceCents: Cents;
  gramsPerPack: number;
  availablePacks: number;
}

export interface QuoteInput {
  lengthCm: number;
  volume: Volume;
  technique: string;
  hair: QuoteHairOption | null;
  /** Información de la clienta que obliga a valoración. */
  hasChemicalHistoryUnknown?: boolean;
  needsColorMatch?: boolean;
}

export interface Quote {
  gramsNeeded: number;
  packsNeeded: number;
  hairCents: Cents;
  laborCents: Cents;
  suppliesCents: Cents;
  estimateCents: Cents;
  minCents: Cents;
  maxCents: Cents;
  stockSufficient: boolean | null;
  requiresConsultation: boolean;
  reasons: string[];
  disclaimer: string;
}

export const QUOTE_DISCLAIMER =
  "Precio estimado sujeto a valoración. El precio final se confirma después de revisar tu cabello en persona o mediante fotografías.";

export function quoteExtensions(input: QuoteInput, cfg: QuoteConfig): Quote {
  const reasons: string[] = [];
  const technique = cfg.techniques[input.technique];
  if (!technique) throw new Error(`Técnica no configurada: ${input.technique}`);

  const sortedLengths = [...cfg.gramsTable].sort((a, b) => a.lengthCm - b.lengthCm);
  const row = sortedLengths.find((r) => r.lengthCm >= input.lengthCm);
  let gramsNeeded = 0;
  if (!row) {
    reasons.push("Largo fuera de la tabla configurada");
  } else {
    gramsNeeded = row.grams[input.volume];
  }

  let packsNeeded = 0;
  let hairCents = 0;
  let stockSufficient: boolean | null = null;
  if (!input.hair) {
    reasons.push("Tono por confirmar");
  } else if (gramsNeeded > 0) {
    packsNeeded = Math.ceil(gramsNeeded / input.hair.gramsPerPack);
    hairCents = packsNeeded * input.hair.packPriceCents;
    stockSufficient = input.hair.availablePacks >= packsNeeded;
    if (!stockSufficient) reasons.push("Existencias insuficientes del tono seleccionado");
  }
  if (technique.alwaysConsult) reasons.push(`La técnica ${technique.label} requiere valoración`);
  if (input.hasChemicalHistoryUnknown) reasons.push("Historial químico del cabello desconocido");
  if (input.needsColorMatch) reasons.push("Requiere igualación de color");

  const estimateCents = hairCents + technique.laborCents + technique.suppliesCents;
  const delta = Math.round((estimateCents * cfg.rangeBps) / 10_000);
  return {
    gramsNeeded,
    packsNeeded,
    hairCents,
    laborCents: technique.laborCents,
    suppliesCents: technique.suppliesCents,
    estimateCents,
    minCents: estimateCents - delta,
    maxCents: estimateCents + delta,
    stockSufficient,
    // Siempre se marca valoración si falta información; nunca se confirma precio final aquí.
    requiresConsultation: reasons.length > 0,
    reasons,
    disclaimer: QUOTE_DISCLAIMER,
  };
}
