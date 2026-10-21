import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buttonClass, Card, EmptyState, ErrorNotice, inputClass, PageHeader } from "@/components/ui";
import { loadSlots } from "@/lib/availability";
import { hour, isIsoDate, longDate, mxn, todayLocal } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";
import { createAppointmentAction } from "./actions";

export const metadata: Metadata = { title: "Nueva cita" };

type SP = { date?: string; service?: string; client?: string; staff?: string; error?: string };

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) redirect("/agenda");
  const sp = await searchParams;
  const date = isIsoDate(sp.date) ? sp.date : todayLocal();

  const [{ data: services }, { data: clients }, { data: people }, { data: location }] = await Promise.all([
    supabase.from("services").select("id, name, price_cents, price_is_from, duration_min, requires_consultation").eq("is_active", true).order("name"),
    supabase.from("clients").select("id, first_name, last_name, phone").eq("is_anonymized", false).order("first_name").limit(300),
    supabase.from("staff_members").select("id, display_name").eq("is_bookable", true).eq("is_active", true),
    staff.locationId
      ? supabase.from("locations").select("id").eq("id", staff.locationId).single()
      : supabase.from("locations").select("id").eq("is_active", true).limit(1).single(),
  ]);
  const names = new Map((people ?? []).map((p) => [p.id, p.display_name]));
  const service = services?.find((s) => s.id === sp.service);
  const ready = Boolean(service && sp.client && location);
  const result = ready ? await loadSlots(supabase, { locationId: location!.id, serviceId: service!.id, date, preferredStaffId: sp.staff || undefined }) : null;

  return (
    <>
      <PageHeader title="Nueva cita" subtitle={longDate(date)} />
      {sp.error ? <div className="mb-4"><ErrorNotice message={sp.error} /></div> : null}
      <Card>
        <form className="grid gap-3 md:grid-cols-5" method="get">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Clienta</span>
            <select name="client" defaultValue={sp.client ?? ""} required className={inputClass}>
              <option value="">Selecciona…</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name ?? ""} {c.phone ? `· ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Servicio</span>
            <select name="service" defaultValue={sp.service ?? ""} required className={inputClass}>
              <option value="">Selecciona…</option>
              {(services ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration_min} min · {s.price_is_from ? "desde " : ""}
                  {mxn(s.price_cents)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm">Fecha</span>
            <input type="date" name="date" defaultValue={date} className={inputClass} />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Especialista (opcional)</span>
            <select name="staff" defaultValue={sp.staff ?? ""} className={inputClass}>
              <option value="">Cualquiera disponible</option>
              {(people ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end md:col-span-3">
            <button className={buttonClass}>Buscar horarios</button>
          </div>
        </form>
      </Card>

      {service?.requires_consultation ? (
        <p className="mt-4 text-sm text-warning">Este servicio requiere valoración previa: el precio final se confirma tras la consulta.</p>
      ) : null}

      {result ? (
        <div className="mt-6">
          {result.error ? <ErrorNotice message={result.error} /> : null}
          {result.slots.length === 0 ? (
            <EmptyState title="Sin horarios disponibles" description="Prueba otra fecha o especialista." />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {result.slots.map((slot) => {
                const a = slot.assignments[0]!;
                return (
                  <form key={slot.start} action={createAppointmentAction}>
                    <input type="hidden" name="location_id" value={location!.id} />
                    <input type="hidden" name="client_id" value={sp.client} />
                    <input type="hidden" name="service_id" value={service!.id} />
                    <input type="hidden" name="staff_id" value={a.staffId ?? ""} />
                    <input type="hidden" name="resource_ids" value={a.resourceIds.join(",")} />
                    <input type="hidden" name="starts_at" value={new Date(slot.start).toISOString()} />
                    <input type="hidden" name="idempotency_key" value={crypto.randomUUID()} />
                    <input type="hidden" name="date" value={date} />
                    <button className="w-full rounded-brand border border-line bg-surface p-2 text-left text-sm hover:bg-surface-muted">
                      <span className="block font-medium tabular-nums">{hour(slot.start)}</span>
                      <span className="block truncate text-xs text-muted">{a.staffId ? names.get(a.staffId) : ""}</span>
                    </button>
                  </form>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
