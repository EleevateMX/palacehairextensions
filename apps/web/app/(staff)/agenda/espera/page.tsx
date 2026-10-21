import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays } from "@palace/domain";
import { ActionForm, SubmitButton } from "@/components/forms";
import { KeepValuesForm } from "../_components/keep-values-form";
import { Badge, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { loadSlots } from "@/lib/availability";
import { hour, longDate, todayLocal } from "@/lib/format";
import { currentLocationId } from "@/lib/location";
import { can, requireStaff } from "@/lib/staff";
import { clientName, one } from "../_lib/status";
import { addWaitlistAction, setWaitlistStatusAction } from "./actions";

export const metadata: Metadata = { title: "Lista de espera" };

type Ref<T> = T | T[] | null;
type Entry = {
  id: string;
  client_id: string;
  service_id: string;
  preferred_staff_id: string | null;
  desired_from: string;
  desired_to: string;
  notes: string | null;
  status: string;
  created_at: string;
  clients: Ref<{ first_name: string; last_name: string | null; phone: string | null }>;
  services: Ref<{ name: string }>;
  staff_members: Ref<{ display_name: string }>;
};

const STATUS: Record<string, [string, "neutral" | "success" | "warning" | "danger"]> = {
  waiting: ["En espera", "warning"],
  offered: ["Ofrecida", "neutral"],
  booked: ["Agendada", "success"],
  cancelled: ["Cancelada", "danger"],
};

/** Máximo de días por entrada en que se buscan huecos libres. */
const MAX_DAYS = 7;
const MAX_ENTRIES_WITH_SLOTS = 15;

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) redirect("/agenda");
  const { estado } = await searchParams;
  const showAll = estado === "todas";
  const today = todayLocal();
  const locationId = await currentLocationId(supabase, staff);

  let query = supabase
    .from("waitlist_entries")
    .select(
      "id, client_id, service_id, preferred_staff_id, desired_from, desired_to, notes, status, created_at, clients(first_name, last_name, phone), services(name), staff_members(display_name)",
    )
    .order("desired_from")
    .limit(100);
  if (!showAll) query = query.in("status", ["waiting", "offered"]);

  const [{ data: entriesData, error }, { data: clients }, { data: services }, { data: people }] = await Promise.all([
    query,
    supabase.from("clients").select("id, first_name, last_name, phone").eq("is_anonymized", false).order("first_name").limit(300),
    supabase.from("services").select("id, name").eq("is_active", true).order("name"),
    supabase.from("staff_members").select("id, display_name").eq("is_bookable", true).eq("is_active", true).order("display_name"),
  ]);
  const entries = (entriesData ?? []) as unknown as Entry[];

  // Huecos libres en el rango deseado (máx. 7 días desde hoy o desde el inicio del rango).
  const free = new Map<string, { count: number; firstDate: string; firstStart: number } | null>();
  if (locationId) {
    const candidates = entries.filter((e) => e.status === "waiting" || e.status === "offered").slice(0, MAX_ENTRIES_WITH_SLOTS);
    await Promise.all(
      candidates.map(async (e) => {
        const from = e.desired_from > today ? e.desired_from : today;
        if (from > e.desired_to) return free.set(e.id, null);
        const days: string[] = [];
        for (let d = from; d <= e.desired_to && days.length < MAX_DAYS; d = addDays(d, 1)) days.push(d);
        const results = await Promise.all(
          days.map((d) => loadSlots(supabase, { locationId, serviceId: e.service_id, date: d, preferredStaffId: e.preferred_staff_id ?? undefined })),
        );
        const count = results.reduce((t, r) => t + r.slots.length, 0);
        const hit = results.findIndex((r) => r.slots.length > 0);
        free.set(e.id, hit >= 0 ? { count, firstDate: days[hit]!, firstStart: results[hit]!.slots[0]!.start } : null);
      }),
    );
  }

  return (
    <>
      <PageHeader
        title="Lista de espera"
        subtitle="Clientas que esperan un hueco; se buscan horarios libres en su rango (hasta 7 días)"
        actions={
          <Link className="rounded-brand border border-line px-3 py-2 text-sm" href="/agenda">
            ← Agenda
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card title="Agregar a la lista">
          <KeepValuesForm action={addWaitlistAction} className="space-y-3" resetOnSuccess>
            <Field label="Clienta">
              <select name="client_id" required defaultValue="" className={inputClass}>
                <option value="">Selecciona…</option>
                {(clients ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name ?? ""} {c.phone ? `· ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Servicio">
              <select name="service_id" required defaultValue="" className={inputClass}>
                <option value="">Selecciona…</option>
                {(services ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Especialista preferida (opcional)">
              <select name="preferred_staff_id" defaultValue="" className={inputClass}>
                <option value="">Cualquiera</option>
                {(people ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Desde">
                <input type="date" name="desired_from" required defaultValue={today} className={inputClass} />
              </Field>
              <Field label="Hasta">
                <input type="date" name="desired_to" required defaultValue={addDays(today, 14)} className={inputClass} />
              </Field>
            </div>
            <Field label="Notas">
              <textarea name="notes" rows={2} maxLength={500} className={`${inputClass} py-2`} placeholder="p. ej. solo por las tardes" />
            </Field>
            <SubmitButton>Agregar</SubmitButton>
          </KeepValuesForm>
        </Card>

        <Card>
          <nav className="mb-3 flex gap-3 text-sm">
            <Link href="/agenda/espera" aria-current={!showAll ? "page" : undefined} className={!showAll ? "font-medium underline" : "text-muted"}>
              Activas
            </Link>
            <Link href="/agenda/espera?estado=todas" aria-current={showAll ? "page" : undefined} className={showAll ? "font-medium underline" : "text-muted"}>
              Todas
            </Link>
          </nav>
          {error ? <ErrorNotice message="No se pudo cargar la lista de espera." /> : null}
          {entries.length === 0 ? (
            <EmptyState title="Nadie en lista de espera" description="Agrega a las clientas que buscan un horario que hoy no hay." />
          ) : (
            <ul className="divide-y divide-line" aria-label="Lista de espera">
              {entries.map((e) => {
                const [label, tone] = STATUS[e.status] ?? [e.status, "neutral" as const];
                const f = free.get(e.id);
                const activeEntry = e.status === "waiting" || e.status === "offered";
                return (
                  <li key={e.id} className="space-y-2 py-3 text-sm" data-testid="espera-entrada">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{clientName(one(e.clients))}</p>
                        <p className="text-muted">
                          {one(e.services)?.name}
                          {one(e.staff_members) ? ` · con ${one(e.staff_members)!.display_name}` : ""}
                        </p>
                        <p className="text-xs text-muted">
                          Del {e.desired_from} al {e.desired_to}
                          {e.notes ? ` · ${e.notes}` : ""}
                        </p>
                      </div>
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                    {activeEntry && free.has(e.id) ? (
                      f ? (
                        <p className="text-success">
                          Hay {f.count} horario{f.count === 1 ? "" : "s"} libre{f.count === 1 ? "" : "s"}. Primero:{" "}
                          <span className="capitalize">{longDate(f.firstDate)}</span> a las {hour(f.firstStart)}.{" "}
                          <Link
                            className="font-medium underline"
                            href={`/agenda/nueva?${new URLSearchParams({
                              date: f.firstDate,
                              client: e.client_id,
                              service: e.service_id,
                              ...(e.preferred_staff_id ? { staff: e.preferred_staff_id } : {}),
                            })}`}
                          >
                            Agendar
                          </Link>
                        </p>
                      ) : (
                        <p className="text-muted">Sin horarios libres en los próximos días del rango.</p>
                      )
                    ) : null}
                    {activeEntry ? (
                      <div className="flex flex-wrap gap-2">
                        {e.status === "waiting" ? <StatusButton id={e.id} status="offered" label="Marcar ofrecida" /> : null}
                        <StatusButton id={e.id} status="booked" label="Marcar agendada" />
                        <StatusButton id={e.id} status="cancelled" label="Cancelar" confirm="¿Quitar a la clienta de la lista de espera?" />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function StatusButton({ id, status, label, confirm }: { id: string; status: string; label: string; confirm?: string }) {
  return (
    <ActionForm action={setWaitlistStatusAction}>
      <input type="hidden" name="entry_id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant="secondary" confirm={confirm}>
        {label}
      </SubmitButton>
    </ActionForm>
  );
}
