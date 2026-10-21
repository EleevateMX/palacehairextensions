import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";
import { mxn } from "@/lib/format";
import { requireStaff } from "@/lib/staff";
import { canSeeCost, canWrite, KIND_LABEL, qty, workingLocation } from "./_lib/shared";
import { filterValues, loadStock, type StockFilters } from "./_lib/stock";
import { InventoryTabs, NoLocation } from "./_lib/ui";

export const metadata: Metadata = { title: "Inventario" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<StockFilters> }) {
  const { supabase, staff } = await requireStaff();
  const f = await searchParams;
  const { location } = await workingLocation(supabase, staff);
  const showCost = canSeeCost(staff);
  const writer = canWrite(staff);
  if (!location) return <NoLocation />;

  const [{ rows, error }, values] = await Promise.all([loadStock(supabase, location.id, f, showCost), filterValues(supabase)]);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => typeof v === "string" && v !== "") as [string, string][]);

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle={`${location.name} · Disponible = existencias − reservado (citas, apartados)`}
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={`/inventario/exportar?${qs}`} className={secondaryButtonClass} download>
              Exportar CSV
            </a>
            {writer ? (
              <Link href="/inventario/productos/nuevo" className={secondaryButtonClass}>
                Nuevo producto
              </Link>
            ) : null}
          </div>
        }
      />
      <InventoryTabs staff={staff} current="/inventario" />
      <Card>
        <form className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8" method="get">
          <Field label="Buscar" className="col-span-2">
            <input name="q" defaultValue={f.q} placeholder="Producto, SKU, código o tono" className={inputClass} />
          </Field>
          <Field label="Tipo">
            <select name="kind" defaultValue={f.kind ?? ""} className={inputClass}>
              <option value="">Todos</option>
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tono">
            <select name="tone" defaultValue={f.tone ?? ""} className={inputClass}>
              <option value="">Todos</option>
              {values.tones.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Largo (cm)">
            <select name="length" defaultValue={f.length ?? ""} className={inputClass}>
              <option value="">Todos</option>
              {values.lengths.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Textura">
            <select name="texture" defaultValue={f.texture ?? ""} className={inputClass}>
              <option value="">Todas</option>
              {values.textures.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Técnica">
            <select name="technique" defaultValue={f.technique ?? ""} className={inputClass}>
              <option value="">Todas</option>
              {values.techniques.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <div className="col-span-2 flex flex-wrap items-end gap-3 md:col-span-4 lg:col-span-8">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="low" value="1" defaultChecked={f.low === "1"} /> Solo bajo mínimo
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="inactive" value="1" defaultChecked={f.inactive === "1"} /> Incluir inactivos
            </label>
            <button className={secondaryButtonClass}>Filtrar</button>
            <Link href="/inventario" className="text-sm text-muted underline">
              Limpiar
            </Link>
          </div>
        </form>
        {error ? <ErrorNotice message="No se pudo cargar el inventario. Intenta de nuevo." /> : null}
        {!error && rows.length === 0 ? (
          <EmptyState title="Sin productos" description={writer ? "Da de alta productos y registra entradas iniciales." : "No hay productos con esos filtros."} />
        ) : null}
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="stock-table">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3">Producto</th>
                  <th className="pr-3">Tono / largo / textura</th>
                  <th className="pr-3 text-right">Existencias</th>
                  <th className="pr-3 text-right">Reservado</th>
                  <th className="pr-3 text-right">Disponible</th>
                  <th className="pr-3 text-right">Precio</th>
                  {showCost ? <th className="pr-3 text-right">Costo</th> : null}
                  {showCost ? <th className="pr-3 text-right">Margen</th> : null}
                  <th className="pr-3">Ubicación</th>
                  <th className="pr-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((v) => (
                  <tr key={v.variant_id} className={v.is_active ? "" : "opacity-60"}>
                    <td className="py-2 pr-3">
                      <Link href={`/inventario/productos/${v.product_id}`} className="font-medium hover:underline">
                        {v.variant_name}
                      </Link>
                      <p className="text-xs text-muted">
                        {v.sku} · {KIND_LABEL[v.kind] ?? v.kind}
                        {v.technique ? ` · ${v.technique}` : ""}
                      </p>
                    </td>
                    <td className="pr-3">{[v.tone, v.length_cm ? `${v.length_cm} cm` : null, v.texture].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="pr-3 text-right tabular-nums">{qty(v.on_hand)}</td>
                    <td className="pr-3 text-right tabular-nums">{qty(v.reserved)}</td>
                    <td className="pr-3 text-right tabular-nums">
                      {qty(v.available)} {v.is_low ? <Badge tone="danger">Bajo</Badge> : null}
                    </td>
                    <td className="pr-3 text-right tabular-nums">{mxn(v.price_cents)}</td>
                    {showCost ? <td className="pr-3 text-right tabular-nums">{v.cost_cents === null ? "—" : mxn(v.cost_cents)}</td> : null}
                    {showCost ? <td className="pr-3 text-right tabular-nums">{v.margin_pct === null ? "—" : `${v.margin_pct}%`}</td> : null}
                    <td className="pr-3">{v.bin_location ?? "—"}</td>
                    <td className="pr-3 whitespace-nowrap">
                      <Link href={`/inventario/kardex/${v.variant_id}`} className="text-xs underline">
                        Kardex
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">{rows.length} variantes</p>
          </div>
        ) : null}
      </Card>
    </>
  );
}
