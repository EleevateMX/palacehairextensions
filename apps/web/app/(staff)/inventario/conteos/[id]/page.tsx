import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SubmitButton } from "@/components/forms";
import { KeepForm as ActionForm } from "@/app/(staff)/inventario/_lib/keep-form";
import { Badge, Card, EmptyState, Field, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireStaff } from "@/lib/staff";
import { canWrite, COUNT_STATUS_LABEL, dateTime, KIND_LABEL, qty } from "../../_lib/shared";
import { loadStock } from "../../_lib/stock";
import { Forbidden, InventoryTabs } from "../../_lib/ui";
import { applyCountAction, cancelCountAction, saveCountLinesAction } from "../actions";

export const metadata: Metadata = { title: "Conteo físico" };

export default async function CountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string; q?: string; aplicado?: string; cancelado?: string }> }) {
  const { id } = await params;
  const f = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return <Forbidden what="hacer conteos físicos" />;
  const { data: count } = await supabase
    .from("stock_counts")
    .select("id, status, started_at, applied_at, location_id, locations(name, timezone)")
    .eq("id", id)
    .maybeSingle();
  if (!count) notFound();
  const c = count as any;
  const tz = c.locations?.timezone ?? "America/Mexico_City";
  const { data: lines } = await supabase.from("stock_count_lines").select("variant_id, counted_qty").eq("stock_count_id", id);
  const counted = new Map((lines ?? []).map((l: any) => [l.variant_id as string, Number(l.counted_qty)]));
  const isOpen = c.status === "open";
  const { rows } = await loadStock(supabase, c.location_id, { kind: f.kind, q: f.q }, false);
  // En un conteo cerrado solo interesan las partidas capturadas.
  const visible = isOpen ? rows : rows.filter((r) => counted.has(r.variant_id));
  const diffs = visible.filter((r) => counted.has(r.variant_id) && counted.get(r.variant_id) !== r.on_hand).length;

  return (
    <>
      <PageHeader
        title="Conteo físico"
        subtitle={`${c.locations?.name ?? ""} · iniciado ${dateTime(c.started_at, tz)}`}
        actions={
          <Link href="/inventario/conteos" className={secondaryButtonClass}>
            Volver
          </Link>
        }
      />
      <InventoryTabs staff={staff} current="/inventario/conteos" />
      {f.aplicado !== undefined && /^\d+$/.test(f.aplicado) ? (
        <p role="status" className="mb-3 rounded-brand border border-success/40 bg-success/10 p-2 text-sm text-success">
          Conteo aplicado: {f.aplicado} ajuste(s) registrados en el kardex.
        </p>
      ) : null}
      {f.cancelado === "1" ? (
        <p role="status" className="mb-3 rounded-brand border border-line bg-surface-muted p-2 text-sm">
          Conteo cancelado; no se aplicaron diferencias.
        </p>
      ) : null}
      <p className="mb-3 text-sm">
        Estado:{" "}
        <Badge tone={c.status === "applied" ? "success" : isOpen ? "warning" : "neutral"}>{COUNT_STATUS_LABEL[c.status]}</Badge>
        {c.applied_at ? ` · aplicado ${dateTime(c.applied_at, tz)}` : ""} · {counted.size} partidas capturadas
        {isOpen ? ` · ${diffs} con diferencia` : ""}
      </p>

      {isOpen ? (
        <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
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
          <Field label="Buscar">
            <input name="q" defaultValue={f.q} className={inputClass} placeholder="SKU, producto o tono" />
          </Field>
          <button className={secondaryButtonClass}>Filtrar</button>
        </form>
      ) : null}

      <Card>
        {visible.length === 0 ? (
          <EmptyState title={isOpen ? "Sin productos con esos filtros" : "Sin partidas"} />
        ) : (
          <ActionForm action={saveCountLinesAction}>
            <input type="hidden" name="count_id" value={id} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3">Producto</th>
                    <th className="pr-3">Ubicación</th>
                    <th className="pr-3 text-right">{isOpen ? "Esperado" : "Sistema hoy"}</th>
                    <th className="pr-3 text-right">Reservado</th>
                    <th className="pr-3 text-right">Contado</th>
                    {isOpen ? <th className="pr-3 text-right">Diferencia</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((r) => {
                    const has = counted.has(r.variant_id);
                    const cq = counted.get(r.variant_id);
                    const diff = has ? cq! - r.on_hand : null;
                    return (
                      <tr key={r.variant_id}>
                        <td className="py-2 pr-3">
                          <p className="font-medium">{r.variant_name}</p>
                          <p className="text-xs text-muted">{r.sku}</p>
                        </td>
                        <td className="pr-3">{r.bin_location ?? "—"}</td>
                        <td className="pr-3 text-right tabular-nums">{qty(r.on_hand)}</td>
                        <td className="pr-3 text-right tabular-nums">{qty(r.reserved)}</td>
                        <td className="pr-3 text-right">
                          {isOpen ? (
                            <>
                              {has ? <input type="hidden" name={`had_${r.variant_id}`} value="1" /> : null}
                              <input
                                name={`qty_${r.variant_id}`}
                                aria-label={`Contado ${r.sku}`}
                                inputMode="decimal"
                                defaultValue={has ? String(cq) : ""}
                                className={`${inputClass} w-24 text-right`}
                              />
                            </>
                          ) : (
                            <span className="tabular-nums">{has ? qty(cq) : "—"}</span>
                          )}
                        </td>
                        {isOpen ? (
                          <td
                            className={`pr-3 text-right tabular-nums ${diff === null || diff === 0 ? "" : diff < 0 ? "text-danger" : "text-success"}`}
                            data-testid={`diff-${r.sku}`}
                          >
                            {diff === null ? "—" : `${diff > 0 ? "+" : ""}${qty(diff)}`}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {isOpen ? (
              <div className="mt-3">
                <SubmitButton variant="secondary">Guardar conteo</SubmitButton>
                <p className="mt-1 text-xs text-muted">Deja vacío lo que no contaste: no se ajusta.</p>
              </div>
            ) : null}
          </ActionForm>
        )}
      </Card>

      {isOpen ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <ActionForm action={applyCountAction}>
            <input type="hidden" name="count_id" value={id} />
            <SubmitButton confirm="¿Aplicar el conteo? Las diferencias se registrarán como ajustes en el kardex y el conteo se cerrará.">
              Aplicar conteo
            </SubmitButton>
          </ActionForm>
          <ActionForm action={cancelCountAction}>
            <input type="hidden" name="count_id" value={id} />
            <SubmitButton variant="danger" confirm="¿Cancelar el conteo sin aplicar diferencias?">
              Cancelar conteo
            </SubmitButton>
          </ActionForm>
        </div>
      ) : null}
    </>
  );
}
