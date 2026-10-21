import type { Metadata } from "next";
import { SubmitButton } from "@/components/forms";
import { KeepForm as ActionForm } from "@/app/(staff)/inventario/_lib/keep-form";
import { Card, EmptyState, Field, inputClass, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/staff";
import { canWrite, type VariantOption, variantOptions, workingLocation } from "../_lib/shared";
import { Forbidden, InventoryTabs, NoLocation } from "../_lib/ui";
import { recordMovementAction, transferAction } from "./actions";

export const metadata: Metadata = { title: "Movimientos de inventario" };

function VariantSelect({ options, selected }: { options: VariantOption[]; selected?: string }) {
  return (
    <Field label="Producto">
      <select name="variant_id" required defaultValue={selected ?? ""} className={inputClass}>
        <option value="" disabled>
          Elige…
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.sku} — {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export default async function MovementPage({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return <Forbidden what="registrar movimientos de inventario" />;
  const { variant } = await searchParams;
  const [{ location, locations }, options] = await Promise.all([workingLocation(supabase, staff), variantOptions(supabase)]);
  if (!location) return <NoLocation />;
  const others = locations.filter((l) => l.id !== location.id);

  return (
    <>
      <PageHeader title="Movimientos" subtitle={`${location.name} · cada movimiento queda en el kardex y no se puede editar`} />
      <InventoryTabs staff={staff} current="/inventario/movimiento" />
      {options.length === 0 ? (
        <EmptyState title="Sin productos activos" description="Da de alta un producto antes de registrar movimientos." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Entrada (inicial o compra)">
            <ActionForm action={recordMovementAction} className="space-y-3" resetOnSuccess>
              <input type="hidden" name="kind" value="entry" />
              <Field label="Tipo de entrada">
                <select name="type" defaultValue="initial" className={inputClass}>
                  <option value="initial">Entrada inicial</option>
                  <option value="purchase">Compra (sin orden)</option>
                </select>
              </Field>
              <VariantSelect options={options} selected={variant} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cantidad">
                  <input name="quantity" required inputMode="decimal" className={inputClass} />
                </Field>
                <Field label="Costo unitario (MXN)" hint="Vacío = costo del catálogo">
                  <input name="unit_cost" inputMode="decimal" placeholder="0.00" className={inputClass} />
                </Field>
              </div>
              <Field label="Nota">
                <input name="note" maxLength={500} className={inputClass} />
              </Field>
              <SubmitButton>Registrar entrada</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Merma">
            <ActionForm action={recordMovementAction} className="space-y-3" resetOnSuccess>
              <input type="hidden" name="kind" value="waste" />
              <VariantSelect options={options} selected={variant} />
              <Field label="Cantidad perdida">
                <input name="quantity" required inputMode="decimal" className={inputClass} />
              </Field>
              <Field label="Motivo" hint="Dañado, caducado, maltrato en servicio…">
                <input name="note" maxLength={500} className={inputClass} />
              </Field>
              <SubmitButton>Registrar merma</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Ajuste">
            <ActionForm action={recordMovementAction} className="space-y-3" resetOnSuccess>
              <input type="hidden" name="kind" value="adjustment" />
              <VariantSelect options={options} selected={variant} />
              <Field label="Cantidad (+ suma, − resta)" hint="Ejemplo: -1 o 2.5">
                <input name="quantity" required inputMode="decimal" className={inputClass} />
              </Field>
              <Field label="Motivo del ajuste" hint="Obligatorio">
                <input name="note" maxLength={500} className={inputClass} />
              </Field>
              <SubmitButton>Registrar ajuste</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Devolución a proveedor">
            <ActionForm action={recordMovementAction} className="space-y-3" resetOnSuccess>
              <input type="hidden" name="kind" value="supplier_return" />
              <VariantSelect options={options} selected={variant} />
              <Field label="Cantidad devuelta">
                <input name="quantity" required inputMode="decimal" className={inputClass} />
              </Field>
              <Field label="Nota">
                <input name="note" maxLength={500} className={inputClass} />
              </Field>
              <SubmitButton>Registrar devolución</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Transferencia entre sucursales" className="lg:col-span-2">
            {others.length === 0 ? (
              <p className="text-sm text-muted" data-testid="transfer-disabled">
                Solo hay una sucursal activa ({location.name}), así que no hay a dónde transferir. Se habilita al dar de alta otra sucursal.
              </p>
            ) : (
              <ActionForm action={transferAction} className="grid gap-3 md:grid-cols-2" resetOnSuccess>
                <input type="hidden" name="from" value={location.id} />
                <VariantSelect options={options} selected={variant} />
                <Field label={`Destino (sale de ${location.name})`}>
                  <select name="to" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      Elige…
                    </option>
                    {others.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Cantidad">
                  <input name="quantity" required inputMode="decimal" className={inputClass} />
                </Field>
                <Field label="Nota">
                  <input name="note" maxLength={500} className={inputClass} />
                </Field>
                <SubmitButton>Transferir</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
