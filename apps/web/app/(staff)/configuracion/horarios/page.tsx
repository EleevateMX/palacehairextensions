import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { todayLocal } from "@/lib/format";
import { ConfigTabs } from "../_components/config-tabs";
import { Repeater } from "../_components/repeater";
import { WEEK_ORDER, WEEKDAYS } from "../_lib/fields";
import { hhmm, shortDate } from "../_lib/format";
import { Forbidden, requireManager } from "../_lib/guard";
import { LocationPicker, resolveLocation } from "../_lib/locations";
import { addSpecialDay, removeSpecialDay, saveBusinessHours } from "./actions";

export const metadata: Metadata = { title: "Horarios" };

export default async function HoursPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const { supabase, staff, allowed } = await requireManager();
  if (!allowed) return <Forbidden title="Horarios" />;
  const sp = await searchParams;
  const { locations, locationId } = await resolveLocation(supabase, staff, sp.location);
  if (!locationId) {
    return (
      <>
        <PageHeader title="Horarios" />
        <ConfigTabs current="/configuracion/horarios" />
        <EmptyState title="No hay sucursales" description="Da de alta una sucursal para definir horarios." />
      </>
    );
  }
  const [hours, special] = await Promise.all([
    supabase.from("business_hours").select("weekday, opens_at, closes_at").eq("location_id", locationId).order("weekday").order("opens_at"),
    supabase.from("special_days").select("id, day, label, is_closed, opens_at, closes_at").eq("location_id", locationId).gte("day", todayLocal()).order("day"),
  ]);

  return (
    <>
      <PageHeader title="Horarios" subtitle="Horario del salón por día (puede tener varios rangos) y días especiales" />
      <ConfigTabs current="/configuracion/horarios" />
      <LocationPicker locations={locations} current={locationId} />
      {hours.error || special.error ? <ErrorNotice message="No se pudieron cargar los horarios." /> : null}

      <Card title="Horario semanal" className="mb-6">
        <ActionForm action={saveBusinessHours} className="space-y-4">
          <input type="hidden" name="location_id" value={locationId} />
          <p className="text-xs text-muted">Deja un día sin rangos para marcarlo como cerrado. Los rangos no deben traslaparse.</p>
          {WEEK_ORDER.map((d) => (
            <fieldset key={d} className="rounded-brand border border-line p-3">
              <legend className="px-1 text-sm font-medium">{WEEKDAYS[d]}</legend>
              <Repeater
                legend={WEEKDAYS[d]}
                addLabel="Agregar rango"
                fields={[
                  { name: `start_${d}`, label: "Abre", type: "time" },
                  { name: `end_${d}`, label: "Cierra", type: "time" },
                ]}
                initial={(hours.data ?? [])
                  .filter((h) => h.weekday === d)
                  .map((h) => ({ [`start_${d}`]: hhmm(h.opens_at), [`end_${d}`]: hhmm(h.closes_at) }))}
              />
            </fieldset>
          ))}
          <SubmitButton>Guardar horario semanal</SubmitButton>
        </ActionForm>
      </Card>

      <Card title="Días especiales y festivos">
        <ActionForm action={addSpecialDay} resetOnSuccess className="mb-4 grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="location_id" value={locationId} />
          <Field label="Fecha" className="sm:col-span-2">
            <input type="date" name="day" required min={todayLocal()} className={inputClass} />
          </Field>
          <Field label="Motivo" className="sm:col-span-4">
            <input name="label" placeholder="p. ej. Navidad" className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="is_closed" defaultChecked className="size-5" /> Cerrado todo el día
          </label>
          <Field label="Abre (si no cierra)" className="sm:col-span-2">
            <input type="time" name="opens_at" className={inputClass} />
          </Field>
          <Field label="Cierra (si no cierra)" className="sm:col-span-2">
            <input type="time" name="closes_at" className={inputClass} />
          </Field>
          <div className="sm:col-span-6">
            <SubmitButton variant="secondary">Agregar día especial</SubmitButton>
          </div>
        </ActionForm>
        {(special.data ?? []).length === 0 ? (
          <EmptyState title="Sin días especiales próximos" description="Agrega festivos o días con horario distinto." />
        ) : (
          <ul className="divide-y divide-line text-sm">
            {special.data!.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{shortDate(s.day)}</span> {s.label ? <span className="text-muted">· {s.label}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  {s.is_closed ? <Badge tone="warning">Cerrado</Badge> : <Badge>{`${hhmm(s.opens_at)}–${hhmm(s.closes_at)}`}</Badge>}
                  <ActionForm action={removeSpecialDay}>
                    <input type="hidden" name="id" value={s.id} />
                    <SubmitButton variant="secondary" confirm="¿Eliminar este día especial?">
                      Quitar
                    </SubmitButton>
                  </ActionForm>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
