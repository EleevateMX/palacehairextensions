import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, DataTable, EmptyState, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { mxn } from "@/lib/format";
import { ConfigTabs } from "../_components/config-tabs";
import { Forbidden, requireManager } from "../_lib/guard";
import { createService } from "./actions";

export const metadata: Metadata = { title: "Servicios" };

export default async function ServicesPage() {
  const { supabase, allowed } = await requireManager();
  if (!allowed) return <Forbidden title="Servicios" />;
  const [services, categories] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, price_cents, price_is_from, duration_min, is_active, online_bookable, requires_consultation, category_id, staff_services(staff_id)")
      .order("is_active", { ascending: false })
      .order("name"),
    supabase.from("service_categories").select("id, name").order("sort_order").order("name"),
  ]);
  const catName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Servicios" subtitle="Precios, tiempos, anticipos, personal capacitado, recursos y materiales" />
      <ConfigTabs current="/configuracion/servicios" />
      {services.error ? <ErrorNotice message="No se pudieron cargar los servicios." /> : null}

      <Card title="Nuevo servicio" className="mb-6">
        <ActionForm action={createService} className="grid gap-3 sm:grid-cols-6">
          <Field label="Nombre del servicio" className="sm:col-span-3">
            <input name="name" required minLength={2} className={inputClass} />
          </Field>
          <Field label="Categoría" className="sm:col-span-3">
            <select name="category_id" className={inputClass} defaultValue="">
              <option value="">Sin categoría</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Precio (MXN)" className="sm:col-span-2">
            <input name="price" required inputMode="decimal" placeholder="1500" className={inputClass} />
          </Field>
          <Field label="Duración (min)" className="sm:col-span-2">
            <input name="duration_min" required inputMode="numeric" placeholder="60" className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="price_is_from" className="size-5" /> Precio «desde»
          </label>
          <div className="sm:col-span-6">
            <SubmitButton>Crear y configurar</SubmitButton>
            <p className="mt-1 text-xs text-muted">Se crea inactivo; actívalo al terminar de configurarlo.</p>
          </div>
        </ActionForm>
      </Card>

      <Card title="Catálogo de servicios">
        {(services.data ?? []).length === 0 ? (
          <EmptyState title="Aún no hay servicios" description="Crea el primero con el formulario de arriba." />
        ) : (
          <DataTable head={["Servicio", "Precio", "Duración", "Personal", "Estado"]}>
            {services.data!.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pr-3">
                  <Link href={`/configuracion/servicios/${s.id}`} className="font-medium underline-offset-2 hover:underline">
                    {s.name}
                  </Link>
                  <p className="text-xs text-muted">{s.category_id ? catName.get(s.category_id) : "Sin categoría"}</p>
                </td>
                <td className="pr-3 tabular-nums">
                  {s.price_is_from ? "desde " : ""}
                  {mxn(s.price_cents)}
                </td>
                <td className="pr-3 tabular-nums">{s.duration_min} min</td>
                <td className="pr-3 tabular-nums">{(s.staff_services ?? []).length}</td>
                <td className="space-x-1 pr-3">
                  {s.is_active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}
                  {s.online_bookable ? <Badge>En línea</Badge> : null}
                  {s.requires_consultation ? <Badge tone="warning">Valoración</Badge> : null}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
