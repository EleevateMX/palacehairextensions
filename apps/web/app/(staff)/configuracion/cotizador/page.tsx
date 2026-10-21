import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { ConfigTabs } from "../_components/config-tabs";
import { Repeater } from "../_components/repeater";
import { bpsToPercent, centsToPesos, quoteConfigSchema, type StoredQuoteConfig } from "../_lib/fields";
import { Forbidden, requireManager } from "../_lib/guard";
import { saveQuoteConfig } from "./actions";

export const metadata: Metadata = { title: "Cotizador" };

export default async function QuoteConfigPage() {
  const { supabase, allowed } = await requireManager();
  if (!allowed) return <Forbidden title="Cotizador" />;
  const { data, error } = await supabase.from("business_settings").select("quote_config").eq("id", 1).maybeSingle();
  const parsed = quoteConfigSchema.safeParse(data?.quote_config);
  // Si lo guardado no cumple el esquema, se muestra lo que haya para corregirlo.
  const cfg = (parsed.success ? parsed.data : (data?.quote_config ?? {})) as Partial<StoredQuoteConfig>;
  const isExample = cfg.example !== false;

  return (
    <>
      <PageHeader title="Cotizador de extensiones" subtitle="Técnicas, tabla de gramos y rango del estimado" />
      <ConfigTabs current="/configuracion/cotizador" />
      {error ? <ErrorNotice message="No se pudo cargar la configuración del cotizador." /> : null}
      {isExample ? (
        <div role="note" className="mb-4 rounded-brand border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <strong>Valores de EJEMPLO.</strong> Estas tarifas y gramos son provisionales y deben validarse con Palace antes de usarse con clientas. El
          cotizador siempre muestra un rango estimado sujeto a valoración.
        </div>
      ) : null}
      {data && !parsed.success ? <ErrorNotice message="La configuración guardada tiene errores de formato; corrígela y guarda." /> : null}

      <ActionForm action={saveQuoteConfig} className="space-y-6">
        <Card title="Rango del estimado">
          <Field label="Variación ± (%)" hint="Se aplica al estimado para mostrar mínimo y máximo.">
            <input name="range_pct" inputMode="decimal" defaultValue={bpsToPercent(cfg.rangeBps ?? 1500)} className={`${inputClass} max-w-32`} />
          </Field>
        </Card>
        <Card title="Técnicas">
          <Repeater
            legend="técnica"
            addLabel="Agregar técnica"
            fields={[
              { name: "tech_key", label: "Clave", type: "text", placeholder: "cinta", className: "w-28" },
              { name: "tech_label", label: "Nombre", type: "text", className: "min-w-36 flex-1" },
              { name: "tech_labor", label: "Mano de obra (MXN)", type: "number", className: "w-36" },
              { name: "tech_supplies", label: "Insumos (MXN)", type: "number", className: "w-32" },
              {
                name: "tech_consult",
                label: "Siempre valoración",
                type: "select",
                options: [
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ],
                className: "w-32",
              },
            ]}
            initial={Object.entries(cfg.techniques ?? {}).map(([key, t]) => ({
              tech_key: key,
              tech_label: t.label,
              tech_labor: centsToPesos(t.laborCents),
              tech_supplies: centsToPesos(t.suppliesCents),
              tech_consult: t.alwaysConsult ? "si" : "no",
            }))}
          />
        </Card>
        <Card title="Tabla de gramos por largo y volumen">
          <p className="mb-2 text-xs text-muted">Se usa el largo configurado igual o inmediato superior al solicitado.</p>
          <Repeater
            legend="largo"
            addLabel="Agregar largo"
            fields={[
              { name: "g_length", label: "Largo (cm)", type: "number", className: "w-24" },
              { name: "g_natural", label: "Natural (g)", type: "number", className: "w-24" },
              { name: "g_medio", label: "Medio (g)", type: "number", className: "w-24" },
              { name: "g_abundante", label: "Abundante (g)", type: "number", className: "w-28" },
            ]}
            initial={(cfg.gramsTable ?? []).map((r) => ({
              g_length: String(r.lengthCm),
              g_natural: String(r.grams.natural),
              g_medio: String(r.grams.medio),
              g_abundante: String(r.grams.abundante),
            }))}
          />
        </Card>
        <Card>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="validated" defaultChecked={!isExample} className="size-5" />
            Palace validó estos valores (quitar el aviso de ejemplo)
          </label>
        </Card>
        <SubmitButton>Guardar cotizador</SubmitButton>
      </ActionForm>
    </>
  );
}
