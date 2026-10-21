import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { mxn } from "@/lib/format";
import { ALL_ROLES, ROLE_LABEL } from "@/lib/roles";
import { Repeater } from "../../configuracion/_components/repeater";
import { centsToPesos, WEEK_ORDER, WEEKDAYS } from "../../configuracion/_lib/fields";
import { hhmm } from "../../configuracion/_lib/format";
import { Forbidden, requireManager } from "../../configuracion/_lib/guard";
import { saveStaffSchedule, saveStaffServices, updateStaffMember } from "./actions";

export const metadata: Metadata = { title: "Editar personal" };

export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, staff, allowed } = await requireManager();
  if (!allowed) return <Forbidden title="Editar personal" />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [personRes, locations, schedules, services, mine] = await Promise.all([
    supabase.from("staff_members").select("id, display_name, email, phone, role, is_bookable, is_active, calendar_color, location_id").eq("id", id).maybeSingle(),
    supabase.from("locations").select("id, name").order("name"),
    supabase.from("staff_schedules").select("location_id, weekday, starts_at, ends_at").eq("staff_id", id).order("weekday").order("starts_at"),
    supabase.from("services").select("id, name, duration_min, price_cents, is_active").order("is_active", { ascending: false }).order("name"),
    supabase.from("staff_services").select("service_id, duration_min, price_cents").eq("staff_id", id),
  ]);
  if (personRes.error) return <ErrorNotice message="No se pudo cargar a la persona." />;
  const p = personRes.data;
  if (!p) notFound();
  const scheduleLocation = p.location_id ?? staff.locationId ?? locations.data?.[0]?.id ?? null;
  const shifts = (schedules.data ?? []).filter((s) => s.location_id === scheduleLocation);
  const q = new Map((mine.data ?? []).map((r) => [r.service_id, r]));
  const isSelf = p.id === staff.id;
  const roleOptions = ALL_ROLES.filter((r) => r !== "owner" || staff.role === "owner" || p.role === "owner");

  return (
    <>
      <PageHeader
        title={p.display_name}
        subtitle={`${ROLE_LABEL[p.role as keyof typeof ROLE_LABEL]}${p.email ? ` · ${p.email}` : ""}`}
        actions={
          <span className="flex flex-wrap gap-3 text-sm">
            <Link href={`/configuracion/comisiones?staff=${p.id}`} className="underline">
              Comisiones
            </Link>
            <Link href="/personal" className="underline">
              ← Personal
            </Link>
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Datos y rol">
          <ActionForm action={updateStaffMember} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="staff_id" value={p.id} />
            <Field label="Nombre para mostrar" className="sm:col-span-2">
              <input name="display_name" required defaultValue={p.display_name} className={inputClass} />
            </Field>
            <Field label="Rol">
              <select name="role" defaultValue={p.role} className={inputClass} disabled={isSelf}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {isSelf ? <input type="hidden" name="role" value={p.role} /> : null}
            </Field>
            <Field label="Sucursal">
              <select name="location_id" defaultValue={p.location_id ?? ""} className={inputClass}>
                <option value="">Sin sucursal fija</option>
                {(locations.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Teléfono">
              <input name="phone" type="tel" defaultValue={p.phone ?? ""} className={inputClass} />
            </Field>
            <Field label="Color en la agenda">
              <input name="calendar_color" type="color" defaultValue={p.calendar_color ?? "#8a7f75"} className={`${inputClass} p-1`} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="is_bookable" defaultChecked={p.is_bookable} className="size-5" /> Agendable
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={p.is_active} disabled={isSelf} className="size-5" /> Activa (puede entrar)
              {isSelf ? <input type="hidden" name="is_active" value="on" /> : null}
            </label>
            <p className="text-xs text-muted sm:col-span-2">Solo la propietaria puede asignar el rol de propietaria (la base de datos lo exige).</p>
            <div className="sm:col-span-2">
              <SubmitButton>Guardar datos</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card title="Turnos semanales">
          {!scheduleLocation ? (
            <EmptyState title="Sin sucursal" description="Asigna una sucursal para definir turnos." />
          ) : (
            <ActionForm action={saveStaffSchedule} className="space-y-3">
              <input type="hidden" name="staff_id" value={p.id} />
              <input type="hidden" name="location_id" value={scheduleLocation} />
              <p className="text-xs text-muted">Varios rangos en un día = turno partido (el hueco es descanso). Día sin rangos = no trabaja.</p>
              {WEEK_ORDER.map((d) => (
                <fieldset key={d} className="rounded-brand border border-line p-2">
                  <legend className="px-1 text-sm font-medium">{WEEKDAYS[d]}</legend>
                  <Repeater
                    legend={WEEKDAYS[d]}
                    addLabel="Agregar turno"
                    fields={[
                      { name: `start_${d}`, label: "Entra", type: "time" },
                      { name: `end_${d}`, label: "Sale", type: "time" },
                    ]}
                    initial={shifts.filter((s) => s.weekday === d).map((s) => ({ [`start_${d}`]: hhmm(s.starts_at), [`end_${d}`]: hhmm(s.ends_at) }))}
                  />
                </fieldset>
              ))}
              <SubmitButton>Guardar turnos</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card title="Servicios que realiza" className="lg:col-span-2">
          {(services.data ?? []).length === 0 ? (
            <EmptyState title="No hay servicios" description="Crea servicios en Configuración." />
          ) : (
            <ActionForm action={saveStaffServices} className="space-y-3">
              <input type="hidden" name="staff_id" value={p.id} />
              <p className="text-xs text-muted">Duración y precio propios son opcionales; vacío = los del servicio.</p>
              <ul className="divide-y divide-line">
                {services.data!.map((s) => {
                  const row = q.get(s.id);
                  return (
                    <li key={s.id} className="grid grid-cols-2 items-end gap-2 py-2 sm:grid-cols-[1fr_7rem_8rem]">
                      <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm sm:col-span-1">
                        <input type="checkbox" name="service" value={s.id} defaultChecked={Boolean(row)} aria-label={`Realiza: ${s.name}`} className="size-5" />
                        <span>
                          {s.name}
                          <span className="block text-xs text-muted">
                            {s.duration_min} min · {mxn(s.price_cents)}
                            {s.is_active ? "" : " · inactivo"}
                          </span>
                        </span>
                      </label>
                      <input name={`dur_${s.id}`} inputMode="numeric" placeholder="min" aria-label={`Duración propia en ${s.name}`} defaultValue={row?.duration_min ?? ""} className={inputClass} />
                      <input
                        name={`price_${s.id}`}
                        inputMode="decimal"
                        placeholder="precio"
                        aria-label={`Precio propio en ${s.name}`}
                        defaultValue={row?.price_cents != null ? centsToPesos(row.price_cents) : ""}
                        className={inputClass}
                      />
                    </li>
                  );
                })}
              </ul>
              <SubmitButton>Guardar servicios</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
