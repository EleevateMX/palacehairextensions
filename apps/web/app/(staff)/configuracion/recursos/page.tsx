import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { ConfigTabs } from "../_components/config-tabs";
import { Forbidden, requireManager } from "../_lib/guard";
import { LocationPicker, resolveLocation } from "../_lib/locations";
import { createResource, createResourceType, setResourceActive } from "./actions";

export const metadata: Metadata = { title: "Recursos" };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const { supabase, staff, allowed } = await requireManager();
  if (!allowed) return <Forbidden title="Recursos" />;
  const sp = await searchParams;
  const { locations, locationId } = await resolveLocation(supabase, staff, sp.location);
  const [types, resources] = await Promise.all([
    supabase.from("resource_types").select("id, code, name").order("name"),
    locationId
      ? supabase.from("resources").select("id, name, is_active, sort_order, resource_type_id").eq("location_id", locationId).order("sort_order").order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const typeList = types.data ?? [];
  const list = resources.data ?? [];

  return (
    <>
      <PageHeader title="Recursos" subtitle="Cada unidad física (silla, estación, lavacabezas…) es un recurso: así la agenda garantiza la capacidad" />
      <ConfigTabs current="/configuracion/recursos" />
      <LocationPicker locations={locations} current={locationId} />
      {types.error || resources.error ? <ErrorNotice message="No se pudieron cargar los recursos." /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card title="Unidades por tipo">
          {typeList.length === 0 ? (
            <EmptyState title="Sin tipos de recurso" description="Crea un tipo (p. ej. «Estación») y después sus unidades." />
          ) : (
            <div className="space-y-4">
              {typeList.map((t) => {
                const units = list.filter((r) => r.resource_type_id === t.id);
                return (
                  <section key={t.id}>
                    <h3 className="mb-1 text-sm font-medium">
                      {t.name} <span className="text-xs text-muted">({t.code}) · {units.filter((u) => u.is_active).length} activas</span>
                    </h3>
                    {units.length === 0 ? (
                      <p className="text-sm text-muted">Sin unidades en esta sucursal.</p>
                    ) : (
                      <ul className="divide-y divide-line text-sm">
                        {units.map((u) => (
                          <li key={u.id} className="flex items-center justify-between gap-2 py-2">
                            <span>
                              {u.name} {u.is_active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}
                            </span>
                            <ActionForm action={setResourceActive}>
                              <input type="hidden" name="id" value={u.id} />
                              {u.is_active ? null : <input type="hidden" name="active" value="on" />}
                              <SubmitButton variant="secondary" confirm={u.is_active ? `¿Desactivar ${u.name}?` : undefined}>
                                {u.is_active ? "Desactivar" : "Activar"}
                              </SubmitButton>
                            </ActionForm>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          {locationId && typeList.length > 0 ? (
            <Card title="Nueva unidad">
              <ActionForm action={createResource} resetOnSuccess className="space-y-3">
                <input type="hidden" name="location_id" value={locationId} />
                <Field label="Tipo">
                  <select name="resource_type_id" className={inputClass}>
                    {typeList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nombre de la unidad">
                  <input name="name" required placeholder="p. ej. Estación 4" className={inputClass} />
                </Field>
                <Field label="Orden">
                  <input name="sort_order" inputMode="numeric" defaultValue={String(list.length + 1)} className={inputClass} />
                </Field>
                <SubmitButton>Crear unidad</SubmitButton>
              </ActionForm>
            </Card>
          ) : null}
          <Card title="Nuevo tipo de recurso">
            <ActionForm action={createResourceType} resetOnSuccess className="space-y-3">
              <Field label="Nombre del tipo">
                <input name="name" required placeholder="p. ej. Cabina" className={inputClass} />
              </Field>
              <Field label="Clave" hint="Minúsculas sin espacios (p. ej. cabina).">
                <input name="code" required className={inputClass} />
              </Field>
              <SubmitButton variant="secondary">Crear tipo</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
