import "server-only";
import type { QuoteConfig } from "@palace/domain";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

const cents = z.number().int().nonnegative();
const schema = z.object({
  rangeBps: z.number().int().min(0).max(10_000),
  gramsTable: z
    .array(
      z.object({
        lengthCm: z.number().positive(),
        grams: z.object({ natural: z.number().positive(), medio: z.number().positive(), abundante: z.number().positive() }),
      }),
    )
    .min(1),
  techniques: z.record(
    z.string(),
    z.object({ label: z.string().min(1), laborCents: cents, suppliesCents: cents, alwaysConsult: z.boolean().optional() }),
  ),
  example: z.boolean().optional(),
});

export type LoadedQuoteConfig = QuoteConfig & { example?: boolean };

/** Lee y valida business_settings.quote_config. Si es inválida, devuelve config null y el motivo. */
export async function loadQuoteConfig(supabase: DB): Promise<{
  config: LoadedQuoteConfig | null;
  privacyVersion: string | null;
  error?: string;
}> {
  const { data, error } = await supabase.from("business_settings").select("quote_config, privacy_notice_version").eq("id", 1).maybeSingle();
  if (error || !data) return { config: null, privacyVersion: null, error: "No se pudo leer la configuración del negocio." };
  const parsed = schema.safeParse(data.quote_config);
  if (!parsed.success) return { config: null, privacyVersion: data.privacy_notice_version, error: "La configuración del cotizador es inválida." };
  return { config: parsed.data, privacyVersion: data.privacy_notice_version };
}
