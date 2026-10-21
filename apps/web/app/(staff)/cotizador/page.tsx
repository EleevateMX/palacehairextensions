import { type QuoteHairOption, quoteExtensions, type Volume } from "@palace/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, buttonClass, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";
import { mxn } from "@/lib/format";
import { currentLocationId } from "@/lib/location";
import { can, requireStaff } from "@/lib/staff";
import { reserveForClientAction } from "../clientes/actions";
import { loadQuoteConfig } from "./_lib/quote-config";

export const metadata: Metadata = { title: "Cotizador de extensiones" };

const VOLUMES: { value: Volume; label: string }[] = [
  { value: "natural", label: "Natural" },
  { value: "medio", label: "Medio" },
  { value: "abundante", label: "Abundante" },
];

type SP = { largo?: string; volumen?: string; tecnica?: string; tono?: string; quimico?: string; igualacion?: string; clienta?: string };

type HairVariant = {
  variant_id: string;
  sku: string;
  variant_name: string;
  tone: string | null;
  length_cm: number | null;
  texture: string | null;
  available: number;
  price_cents: number;
};

export default async function QuotePage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, staff } = await requireStaff();
  if (can(staff, "inventory")) redirect("/dashboard");
  const sp = await searchParams;
  const location = await currentLocationId(supabase, staff);
  const settings = await loadQuoteConfig(supabase);
  const cfg = settings.config;

  const [{ data: stockRows, error: stockError }, { data: valuation }] = await Promise.all([
    location
      ? supabase
          .from("v_stock_availability")
          .select("variant_id, sku, variant_name, tone, length_cm, texture, available, price_cents")
          .eq("location_id", location)
          .eq("kind", "hair_extension")
          .order("tone")
          .order("length_cm")
      : Promise.resolve({ data: [] as HairVariant[], error: null }),
    supabase.from("services").select("id, name").eq("is_active", true).ilike("name", "valoraci%").order("name").limit(1).maybeSingle(),
  ]);
  const variants = (stockRows ?? []) as HairVariant[];
  // Gramos por paquete y técnica del producto (no están en la vista de existencias).
  const { data: details } = variants.length
    ? await supabase.from("product_variants").select("id, grams_per_unit, unit, products(technique)").in(
        "id",
        variants.map((v) => v.variant_id),
      )
    : { data: [] as { id: string; grams_per_unit: number | null; unit: string; products: { technique: string | null } | null }[] };
  const detail = new Map(
    ((details ?? []) as unknown as { id: string; grams_per_unit: number | null; unit: string; products: { technique: string | null } | null }[]).map(
      (d) => [d.id, d],
    ),
  );

  const techniques = Object.entries(cfg?.techniques ?? {});
  const submitted = Boolean(sp.tecnica);
  const lengthCm = Number(sp.largo);
  const volume = VOLUMES.find((v) => v.value === sp.volumen)?.value ?? "medio";
  const technique = cfg && sp.tecnica && cfg.techniques[sp.tecnica] ? sp.tecnica : undefined;
  const variant = variants.find((v) => v.variant_id === sp.tono);
  const grams = variant ? Number(detail.get(variant.variant_id)?.grams_per_unit ?? 0) : 0;

  let inputError: string | null = null;
  if (submitted) {
    if (!technique) inputError = "Elige una técnica configurada.";
    else if (!Number.isFinite(lengthCm) || lengthCm <= 0 || lengthCm > 150) inputError = "Escribe un largo válido en centímetros (1 a 150).";
  }
  const hair: QuoteHairOption | null =
    variant && grams > 0
      ? { variantId: variant.variant_id, packPriceCents: variant.price_cents, gramsPerPack: grams, availablePacks: Math.floor(Number(variant.available)) }
      : null;
  const quote =
    submitted && !inputError && cfg && technique
      ? quoteExtensions(
          { lengthCm, volume, technique, hair, hasChemicalHistoryUnknown: sp.quimico === "1", needsColorMatch: sp.igualacion === "1" },
          cfg,
        )
      : null;
  const extraReasons = variant && grams <= 0 ? ["El tono elegido no tiene gramos por paquete configurados en inventario"] : [];
  const reasons = quote ? [...quote.reasons.filter((r) => !(extraReasons.length && r === "Tono por confirmar")), ...extraReasons] : [];
  const needsConsult = quote ? quote.requiresConsultation || extraReasons.length > 0 : false;

  const canReserve = can(staff, "owner", "admin", "receptionist", "sales");
  const { data: clients } =
    quote && hair && canReserve
      ? await supabase.from("clients").select("id, first_name, last_name, phone").eq("is_anonymized", false).order("first_name").limit(300)
      : { data: [] as { id: string; first_name: string; last_name: string | null; phone: string | null }[] };

  const valuationHref = valuation ? `/agenda/nueva?service=${valuation.id}${sp.clienta ? `&client=${sp.clienta}` : ""}` : "/agenda/nueva";

  return (
    <>
      <PageHeader title="Cotizador de extensiones" subtitle="Rango estimado; el precio final se confirma en la valoración" />
      {settings.error ? (
        <div className="mb-4">
          <ErrorNotice message={settings.error} />
        </div>
      ) : null}
      {cfg?.example ? (
        <p role="note" className="mb-4 rounded-brand border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Valores de ejemplo pendientes de validar con Palace (tabla de gramos, técnicas y tarifas). No los compartas como precio oficial.
        </p>
      ) : null}

      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Largo (cm)">
            <input
              name="largo"
              type="number"
              min={1}
              max={150}
              step={1}
              required
              inputMode="numeric"
              defaultValue={sp.largo ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Volumen">
            <select name="volumen" defaultValue={volume} className={inputClass}>
              {VOLUMES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Técnica">
            <select name="tecnica" required defaultValue={technique ?? ""} className={inputClass}>
              <option value="">Selecciona…</option>
              {techniques.map(([key, t]) => (
                <option key={key} value={key}>
                  {t.label}
                  {t.alwaysConsult ? " (requiere valoración)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tono" className="sm:col-span-2" hint={stockError ? "No se pudo cargar el inventario." : undefined}>
            <select name="tono" defaultValue={variant?.variant_id ?? ""} className={inputClass}>
              <option value="">Por confirmar</option>
              {variants.map((v) => {
                const d = detail.get(v.variant_id);
                return (
                  <option key={v.variant_id} value={v.variant_id}>
                    {[
                      v.tone ? `Tono ${v.tone}` : v.variant_name,
                      v.length_cm ? `${Number(v.length_cm)} cm` : null,
                      v.texture,
                      d?.products?.technique,
                      d?.grams_per_unit ? `${Number(d.grams_per_unit)} g/paq.` : null,
                      `${Math.floor(Number(v.available))} disp.`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                );
              })}
            </select>
          </Field>
          <fieldset className="flex flex-col justify-end gap-2 text-sm">
            <legend className="sr-only">Condiciones del cabello</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="quimico" value="1" defaultChecked={sp.quimico === "1"} className="size-4" /> Historial químico desconocido
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="igualacion" value="1" defaultChecked={sp.igualacion === "1"} className="size-4" /> Requiere igualación
              de color
            </label>
          </fieldset>
          {sp.clienta ? <input type="hidden" name="clienta" value={sp.clienta} /> : null}
          <div className="sm:col-span-2 lg:col-span-3">
            <button className={buttonClass}>Cotizar</button>
          </div>
        </form>
      </Card>

      {inputError ? (
        <div className="mt-4">
          <ErrorNotice message={inputError} />
        </div>
      ) : null}
      {!cfg && !settings.error ? <EmptyState title="Cotizador sin configurar" /> : null}
      {techniques.length === 0 && cfg ? <EmptyState title="No hay técnicas configuradas" description="Configúralas en business_settings.quote_config." /> : null}

      {quote ? (
        <section aria-label="Resultado de la cotización" className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="Rango estimado">
            <p className="text-3xl font-semibold tabular-nums" data-testid="quote-range">
              {mxn(quote.minCents)} – {mxn(quote.maxCents)}
            </p>
            <p className="mt-1 text-sm text-muted">Estimado central {mxn(quote.estimateCents)}</p>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt>
                  Cabello{quote.packsNeeded ? ` (${quote.packsNeeded} paq. · ${quote.gramsNeeded} g recomendados)` : quote.gramsNeeded ? ` (${quote.gramsNeeded} g recomendados)` : ""}
                </dt>
                <dd className="tabular-nums">{hair ? mxn(quote.hairCents) : "Por confirmar"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Mano de obra · {cfg!.techniques[technique!]!.label}</dt>
                <dd className="tabular-nums">{mxn(quote.laborCents)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Insumos de instalación</dt>
                <dd className="tabular-nums">{mxn(quote.suppliesCents)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted">{quote.disclaimer}</p>
          </Card>

          <Card title="Existencias y valoración">
            {hair ? (
              <p className="mb-3 text-sm">
                {quote.stockSufficient ? (
                  <Badge tone="success">Existencias suficientes</Badge>
                ) : (
                  <Badge tone="danger">Existencias insuficientes</Badge>
                )}{" "}
                Se necesitan {quote.packsNeeded} paquete(s); hay {hair.availablePacks} disponible(s).
              </p>
            ) : (
              <p className="mb-3 text-sm text-muted">Elige un tono para calcular cabello y existencias.</p>
            )}
            {needsConsult ? (
              <div role="status" className="rounded-brand border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="font-medium text-warning">Requiere valoración</p>
                <ul className="mt-1 list-disc pl-5">
                  {reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p role="status" className="rounded-brand border border-success/40 bg-success/10 p-3 text-sm text-success">
                No requiere valoración adicional con los datos capturados (el precio final se confirma en el servicio).
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={valuationHref} className={secondaryButtonClass}>
                Agendar valoración
              </Link>
            </div>
          </Card>

          {hair && canReserve ? (
            <Card title="Apartar tono para clienta" className="lg:col-span-2">
              {(clients ?? []).length === 0 ? (
                <EmptyState title="No hay clientas registradas" />
              ) : hair.availablePacks <= 0 ? (
                <p className="text-sm text-muted">No hay paquetes disponibles de este tono.</p>
              ) : (
                <ActionForm action={reserveForClientAction} className="grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="variant_id" value={hair.variantId} />
                  <input type="hidden" name="return_to" value="cotizador" />
                  <Field label="Clienta" className="sm:col-span-2">
                    <select name="client_id" required defaultValue={sp.clienta ?? ""} className={inputClass}>
                      <option value="">Selecciona…</option>
                      {clients!.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.first_name} {c.last_name ?? ""} {c.phone ? `· ${c.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Paquetes">
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      max={hair.availablePacks}
                      step={1}
                      required
                      defaultValue={Math.max(1, Math.min(quote.packsNeeded || 1, hair.availablePacks))}
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex items-end">
                    <SubmitButton>Apartar tono</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </Card>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
