import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/forms";
import { KeepForm as ActionForm } from "@/app/(staff)/inventario/_lib/keep-form";
import { Card, EmptyState, Field, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireStaff } from "@/lib/staff";
import { canWrite, centsToPesosInput, MAX_PO_LINES, QTY_RE, variantOptions, workingLocation } from "../../_lib/shared";
import { Forbidden, InventoryTabs, NoLocation } from "../../_lib/ui";
import { createPurchaseOrderAction } from "../actions";

export const metadata: Metadata = { title: "Nueva orden de compra" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ lines?: string; supplier?: string }> }) {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return <Forbidden what="crear órdenes de compra" />;
  const sp = await searchParams;
  const [{ location }, options, { data: suppliers }, { data: costs }] = await Promise.all([
    workingLocation(supabase, staff),
    variantOptions(supabase),
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    supabase.from("v_variant_costs").select("variant_id, cost_cents"),
  ]);
  if (!location) return <NoLocation />;
  const costBy = new Map((costs ?? []).map((c: any) => [c.variant_id as string, c.cost_cents as number]));
  // Prefill desde sugerencias: lines=<variante>:<cantidad>,...
  const prefill = (sp.lines ?? "")
    .split(",")
    .map((p) => p.split(":"))
    .filter(([v, q]) => v && GUID.test(v) && q && QTY_RE.test(q) && options.some((o) => o.id === v))
    .slice(0, MAX_PO_LINES)
    .map(([v, q]) => ({ variant: v!, qty: q!, cost: centsToPesosInput(costBy.get(v!) ?? 0) }));
  const rows = Math.min(MAX_PO_LINES, Math.max(prefill.length + 3, 5));
  const supplierOk = (suppliers ?? []).some((s: any) => s.id === sp.supplier);

  return (
    <>
      <PageHeader
        title="Nueva orden de compra"
        subtitle={location.name}
        actions={
          <Link href="/inventario/compras" className={secondaryButtonClass}>
            Volver
          </Link>
        }
      />
      <InventoryTabs staff={staff} current="/inventario/compras" />
      {(suppliers ?? []).length === 0 ? (
        <EmptyState title="Sin proveedores" description="Da de alta un proveedor antes de crear órdenes de compra." />
      ) : (
        <ActionForm action={createPurchaseOrderAction} className="space-y-4">
          <Card title="Datos de la orden">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Proveedor">
                <select name="supplier_id" required defaultValue={supplierOk ? sp.supplier : ""} className={inputClass}>
                  <option value="" disabled>
                    Elige…
                  </option>
                  {(suppliers ?? []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha esperada">
                <input name="expected_at" type="date" className={inputClass} />
              </Field>
              <Field label="Notas">
                <input name="notes" maxLength={1000} className={inputClass} />
              </Field>
            </div>
          </Card>
          <Card title="Partidas">
            <div className="space-y-2">
              {Array.from({ length: rows }, (_, i) => {
                const p = prefill[i];
                return (
                  <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-[3fr_1fr_1fr]">
                    <label className="col-span-2 block md:col-span-1">
                      <span className="sr-only">Producto partida {i + 1}</span>
                      <select name={`line_variant_${i}`} aria-label={`Producto partida ${i + 1}`} defaultValue={p?.variant ?? ""} className={inputClass}>
                        <option value="">— Producto —</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.sku} — {o.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      name={`line_qty_${i}`}
                      aria-label={`Cantidad partida ${i + 1}`}
                      placeholder="Cantidad"
                      inputMode="decimal"
                      defaultValue={p?.qty ?? ""}
                      className={inputClass}
                    />
                    <input
                      name={`line_cost_${i}`}
                      aria-label={`Costo unitario partida ${i + 1}`}
                      placeholder="Costo unitario"
                      inputMode="decimal"
                      defaultValue={p?.cost ?? ""}
                      className={inputClass}
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Deja vacías las filas que no uses. Costo en pesos, sin IVA desglosado.</p>
          </Card>
          <SubmitButton>Crear orden</SubmitButton>
        </ActionForm>
      )}
    </>
  );
}
