import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SubmitButton } from "@/components/forms";
import { KeepForm as ActionForm } from "@/app/(staff)/inventario/_lib/keep-form";
import { Badge, Card, EmptyState, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";
import { mxn } from "@/lib/format";
import { requireStaff } from "@/lib/staff";
import { catalogOptions } from "../../_lib/catalog";
import { canSeeCost, canWrite, KIND_LABEL, localDate, qty, UNIT_LABEL, workingLocation } from "../../_lib/shared";
import { InventoryTabs, NoLocation } from "../../_lib/ui";
import { saveVariantAction, setBinLocationAction, updateProductAction } from "../actions";
import { ProductFields, VariantFields } from "../fields";

export const metadata: Metadata = { title: "Producto" };

const VARIANT_COLS =
  "id, sku, barcode, name, tone, length_cm, texture, presentation, unit, grams_per_unit, price_cents, promo_price_cents, promo_ends_at, min_stock, is_active";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { id } = await params;
  const { ok } = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();
  const { supabase, staff } = await requireStaff();
  const { location } = await workingLocation(supabase, staff);
  if (!location) return <NoLocation />;
  const writer = canWrite(staff);
  const showCost = canSeeCost(staff);

  const [{ data: product }, { data: variants }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, kind, category_id, brand_id, supplier_id, technique, is_sellable_pos, is_sellable_online, is_active, product_categories(name), brands(name), suppliers(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("product_variants").select(VARIANT_COLS).eq("product_id", id).order("sku"),
  ]);
  if (!product) notFound();
  const ids = (variants ?? []).map((v: any) => v.id as string);
  const [{ data: levels }, costsRes, options] = await Promise.all([
    ids.length
      ? supabase.from("stock_levels").select("variant_id, on_hand, reserved, bin_location").eq("location_id", location.id).in("variant_id", ids)
      : Promise.resolve({ data: [] as any[] }),
    showCost && ids.length ? supabase.from("v_variant_costs").select("variant_id, cost_cents, margin_pct").in("variant_id", ids) : Promise.resolve({ data: [] as any[] }),
    writer ? catalogOptions(supabase) : Promise.resolve({ categories: [], brands: [], suppliers: [] }),
  ]);
  const stockBy = new Map((levels ?? []).map((l: any) => [l.variant_id, l]));
  const costBy = new Map((costsRes.data ?? []).map((c: any) => [c.variant_id, c]));
  const p = product as any;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={[KIND_LABEL[p.kind], p.technique, p.product_categories?.name, p.brands?.name].filter(Boolean).join(" · ")}
        actions={
          <Link href="/inventario" className={secondaryButtonClass}>
            Volver
          </Link>
        }
      />
      <InventoryTabs staff={staff} current="" />
      {ok === "creado" ? (
        <p role="status" className="mb-4 rounded-brand border border-success/40 bg-success/10 p-2 text-sm text-success">
          Producto creado. Registra su entrada inicial en{" "}
          <Link className="underline" href={`/inventario/movimiento?variant=${ids[0] ?? ""}`}>
            Movimientos
          </Link>
          .
        </p>
      ) : null}

      <div className="space-y-4">
        <Card title={`Variantes en ${location.name}`}>
          {(variants ?? []).length === 0 ? (
            <EmptyState title="Sin variantes" description="Agrega al menos una variante para poder registrar existencias." />
          ) : (
            <ul className="divide-y divide-line">
              {(variants ?? []).map((v: any) => {
                const s: any = stockBy.get(v.id);
                const c: any = costBy.get(v.id);
                const onHand = Number(s?.on_hand ?? 0);
                const reserved = Number(s?.reserved ?? 0);
                const low = onHand - reserved <= Number(v.min_stock);
                return (
                  <li key={v.id} className="py-3" data-testid={`variant-${v.sku}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {v.name} {v.is_active ? null : <Badge>Inactiva</Badge>}
                        </p>
                        <p className="text-xs text-muted">
                          {v.sku}
                          {v.barcode ? ` · ${v.barcode}` : ""} · {[v.tone, v.length_cm ? `${Number(v.length_cm)} cm` : null, v.texture, v.presentation].filter(Boolean).join(" · ")}{" "}
                          · {UNIT_LABEL[v.unit] ?? v.unit}
                        </p>
                      </div>
                      <div className="text-right text-sm tabular-nums">
                        <p>
                          Existencias {qty(onHand)} · Reservado {qty(reserved)} · Disponible <strong>{qty(onHand - reserved)}</strong>{" "}
                          {low ? <Badge tone="danger">Bajo mínimo</Badge> : null}
                        </p>
                        <p className="text-xs text-muted">
                          Precio {mxn(v.price_cents)}
                          {v.promo_price_cents !== null ? ` · Promo ${mxn(v.promo_price_cents)} hasta ${localDate(v.promo_ends_at, location.timezone) || "sin fecha"}` : ""}
                          {showCost && c ? ` · Costo ${mxn(c.cost_cents)} · Margen ${c.margin_pct ?? "—"}%` : ""}
                        </p>
                        <p className="text-xs">
                          Ubicación: {s?.bin_location ?? "—"} ·{" "}
                          <Link href={`/inventario/kardex/${v.id}`} className="underline">
                            Kardex
                          </Link>
                          {writer ? (
                            <>
                              {" · "}
                              <Link href={`/inventario/movimiento?variant=${v.id}`} className="underline">
                                Registrar movimiento
                              </Link>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    {writer ? (
                      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_2fr]">
                        <ActionForm action={setBinLocationAction} className="flex items-end gap-2">
                          <input type="hidden" name="variant_id" value={v.id} />
                          <input type="hidden" name="product_id" value={p.id} />
                          <input type="hidden" name="location_id" value={location.id} />
                          <label className="block flex-1 space-y-1">
                            <span className="text-xs text-muted">Ubicación física</span>
                            <input name="bin_location" defaultValue={s?.bin_location ?? ""} maxLength={60} placeholder="Anaquel A2" className={inputClass} />
                          </label>
                          <SubmitButton variant="secondary">Guardar</SubmitButton>
                        </ActionForm>
                        <details className="rounded-brand border border-line p-2">
                          <summary className="cursor-pointer text-sm">Editar variante</summary>
                          <ActionForm action={saveVariantAction} className="mt-3 space-y-3">
                            <input type="hidden" name="product_id" value={p.id} />
                            <input type="hidden" name="variant_id" value={v.id} />
                            <VariantFields
                              showCost={showCost}
                              v={{ ...v, cost_cents: c?.cost_cents ?? null, promo_ends: localDate(v.promo_ends_at, location.timezone) }}
                            />
                            <SubmitButton>Guardar variante</SubmitButton>
                          </ActionForm>
                        </details>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {writer ? (
          <>
            <Card title="Agregar variante">
              <ActionForm action={saveVariantAction} className="space-y-3" resetOnSuccess>
                <input type="hidden" name="product_id" value={p.id} />
                <VariantFields showCost={showCost} />
                <SubmitButton>Agregar variante</SubmitButton>
              </ActionForm>
            </Card>
            <Card title="Datos del producto">
              <ActionForm action={updateProductAction} className="space-y-3">
                <input type="hidden" name="product_id" value={p.id} />
                <ProductFields v={p} {...options} />
                <SubmitButton>Guardar producto</SubmitButton>
              </ActionForm>
            </Card>
          </>
        ) : (
          <Card title="Datos del producto">
            <dl className="grid gap-2 text-sm md:grid-cols-2">
              <div>
                <dt className="text-muted">Descripción</dt>
                <dd>{p.description ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Venta</dt>
                <dd>{[p.is_sellable_pos ? "Caja" : null, p.is_sellable_online ? "En línea" : null].filter(Boolean).join(" · ") || "No se vende"}</dd>
              </div>
            </dl>
          </Card>
        )}
        <Card title="Imágenes">
          <p className="text-sm text-muted">
            La carga de imágenes requiere Supabase Storage, que no está disponible en este entorno; no se simula. Se habilitará al conectar el almacenamiento.
          </p>
        </Card>
      </div>
    </>
  );
}
