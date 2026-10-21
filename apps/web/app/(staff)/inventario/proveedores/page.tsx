import type { Metadata } from "next";
import { SubmitButton } from "@/components/forms";
import { KeepForm as ActionForm } from "@/app/(staff)/inventario/_lib/keep-form";
import { Badge, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/staff";
import { canWrite } from "../_lib/shared";
import { Forbidden, InventoryTabs } from "../_lib/ui";
import { saveSupplierAction } from "./actions";

export const metadata: Metadata = { title: "Proveedores" };

type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  rfc: string | null;
  notes: string | null;
  is_active: boolean;
};

function SupplierFields({ s }: { s?: Supplier }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Field label="Nombre">
        <input name="name" required minLength={2} maxLength={160} defaultValue={s?.name ?? ""} className={inputClass} />
      </Field>
      <Field label="Contacto">
        <input name="contact_name" maxLength={120} defaultValue={s?.contact_name ?? ""} className={inputClass} />
      </Field>
      <Field label="Teléfono">
        <input name="phone" type="tel" maxLength={30} defaultValue={s?.phone ?? ""} className={inputClass} />
      </Field>
      <Field label="Correo">
        <input name="email" type="email" maxLength={160} defaultValue={s?.email ?? ""} className={inputClass} />
      </Field>
      <Field label="RFC">
        <input name="rfc" maxLength={13} defaultValue={s?.rfc ?? ""} className={`${inputClass} uppercase`} />
      </Field>
      <Field label="Notas">
        <input name="notes" maxLength={1000} defaultValue={s?.notes ?? ""} className={inputClass} />
      </Field>
    </div>
  );
}

export default async function SuppliersPage() {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return <Forbidden what="administrar proveedores" />;
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, contact_name, phone, email, rfc, notes, is_active")
    .order("is_active", { ascending: false })
    .order("name");
  const suppliers = (data ?? []) as Supplier[];

  return (
    <>
      <PageHeader title="Proveedores" subtitle="Solo Inventarios, Administración y la Propietaria los ven" />
      <InventoryTabs staff={staff} current="/inventario/proveedores" />
      <div className="space-y-4">
        <Card title="Nuevo proveedor">
          <ActionForm action={saveSupplierAction} className="space-y-3" resetOnSuccess>
            <SupplierFields />
            <SubmitButton>Crear proveedor</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Proveedores">
          {error ? <ErrorNotice message="No se pudieron cargar los proveedores." /> : null}
          {suppliers.length === 0 ? (
            <EmptyState title="Sin proveedores" description="Da de alta a quien te surte cabello, insumos y herramientas." />
          ) : (
            <ul className="divide-y divide-line">
              {suppliers.map((s) => (
                <li key={s.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {s.name} {s.is_active ? null : <Badge>Inactivo</Badge>}
                      </p>
                      <p className="text-xs text-muted">{[s.contact_name, s.phone, s.email, s.rfc].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
                    </div>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm">Editar</summary>
                    <ActionForm action={saveSupplierAction} className="mt-2 space-y-3">
                      <input type="hidden" name="id" value={s.id} />
                      <SupplierFields s={s} />
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" name="is_active" defaultChecked={s.is_active} /> Activo
                      </label>
                      <SubmitButton>Guardar</SubmitButton>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
