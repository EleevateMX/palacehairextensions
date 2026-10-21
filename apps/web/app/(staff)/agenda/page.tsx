import type { Metadata } from "next";
import Link from "next/link";
import { addDays, localWeekday, parsePgRange } from "@palace/domain";
import { Badge, buttonClass, Card, EmptyState, ErrorNotice, PageHeader } from "@/components/ui";
import { dayRange } from "@/lib/day";
import { hour, isIsoDate, longDate, todayLocal } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";
import { clientName, one, ShortStatus } from "./_lib/status";

export const metadata: Metadata = { title: "Agenda" };

type View = "dia" | "semana" | "recursos";
type ClientRef = { first_name: string; last_name: string | null };

type Line = {
  id: string;
  starts_at: string;
  ends_at: string;
  staff_id: string | null;
  services: { name: string } | null;
  appointments: {
    id: string;
    booking_status: string;
    attendance_status: string;
    payment_status: string;
    materials_status: string;
    clients: ClientRef | null;
  } | null;
};

const LINE_SELECT =
  "id, starts_at, ends_at, staff_id, services(name), appointments!inner(id, booking_status, attendance_status, payment_status, materials_status, clients(first_name, last_name))";

const shortDay = (date: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${date}T00:00:00Z`));
const shortMonth = (date: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`));

const navLink = "rounded-brand border border-line px-3 py-2 text-sm hover:bg-surface-muted";

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; creada?: string }> }) {
  const { staff, supabase } = await requireStaff();
  const sp = await searchParams;
  const date = isIsoDate(sp.date) ? sp.date : todayLocal();
  const view: View = sp.view === "semana" || sp.view === "recursos" ? sp.view : "dia";
  const isFront = can(staff, "owner", "admin", "receptionist");

  const monday = addDays(date, -((localWeekday(date) + 6) % 7));
  const step = view === "semana" ? 7 : 1;
  const prev = addDays(view === "semana" ? monday : date, -step);
  const next = addDays(view === "semana" ? monday : date, step);
  const href = (d: string, v: View = view) => `/agenda?date=${d}${v === "dia" ? "" : `&view=${v}`}`;

  const subtitle = view === "semana" ? `Semana del ${shortMonth(monday)} al ${shortMonth(addDays(monday, 6))}` : longDate(date);

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className={navLink} href={href(prev)}>
              ← {view === "semana" ? "Semana anterior" : "Día anterior"}
            </Link>
            <Link className={navLink} href={href(todayLocal())}>
              Hoy
            </Link>
            <Link className={navLink} href={href(next)}>
              {view === "semana" ? "Semana siguiente" : "Día siguiente"} →
            </Link>
            {isFront ? (
              <Link className={buttonClass} href={`/agenda/nueva?date=${date}`}>
                Nueva cita
              </Link>
            ) : null}
          </div>
        }
      />
      <nav aria-label="Vista de la agenda" className="mb-4 flex flex-wrap items-center gap-1 border-b border-line">
        {(
          [
            ["dia", "Día"],
            ["semana", "Semana"],
            ["recursos", "Recursos"],
          ] as [View, string][]
        ).map(([v, label]) => (
          <Link
            key={v}
            href={href(date, v)}
            aria-current={v === view ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${v === view ? "border-accent font-medium" : "border-transparent text-muted"}`}
          >
            {label}
          </Link>
        ))}
        {isFront ? (
          <span className="ml-auto flex gap-1 pb-1">
            <Link className="px-2 py-1 text-sm text-muted underline-offset-2 hover:underline" href="/agenda/bloqueos">
              Bloqueos
            </Link>
            <Link className="px-2 py-1 text-sm text-muted underline-offset-2 hover:underline" href="/agenda/espera">
              Lista de espera
            </Link>
          </span>
        ) : null}
      </nav>
      {sp.creada && /^[0-9a-f-]{36}$/i.test(sp.creada) ? (
        <p role="status" className="mb-4 rounded-brand border border-success/40 bg-success/10 p-3 text-sm text-success">
          Cita creada.{" "}
          <Link className="font-medium underline" href={`/agenda/cita/${sp.creada}`}>
            Ver detalle
          </Link>
        </p>
      ) : null}
      {view === "dia" ? <DayView date={date} supabase={supabase} /> : null}
      {view === "semana" ? <WeekView monday={monday} supabase={supabase} /> : null}
      {view === "recursos" ? <ResourceView date={date} supabase={supabase} /> : null}
    </>
  );
}

type DB = Awaited<ReturnType<typeof requireStaff>>["supabase"];

function AppointmentItem({ line, compact = false }: { line: Line; compact?: boolean }) {
  const a = line.appointments!;
  return (
    <li>
      <Link
        href={`/agenda/cita/${a.id}`}
        className={`block rounded-brand border border-line hover:bg-surface-muted ${compact ? "p-1.5 text-xs" : "p-2 text-sm"}`}
      >
        <span className="flex justify-between gap-2">
          <span className="font-medium tabular-nums">
            {hour(line.starts_at)}
            {compact ? "" : `–${hour(line.ends_at)}`}
          </span>
          <ShortStatus booking={a.booking_status} attendance={a.attendance_status} />
        </span>
        <span className="block truncate">{line.services?.name}</span>
        <span className="block truncate text-muted">{clientName(a.clients)}</span>
        {a.materials_status === "missing" ? <Badge tone="danger">Material faltante</Badge> : null}
      </Link>
    </li>
  );
}

async function DayView({ date, supabase }: { date: string; supabase: DB }) {
  const { start, end } = dayRange(date);
  const [{ data: people, error: e1 }, { data: lines, error: e2 }, { data: blocks }] = await Promise.all([
    supabase.from("staff_members").select("id, display_name").eq("is_bookable", true).eq("is_active", true).order("display_name"),
    supabase
      .from("appointment_services")
      .select(LINE_SELECT)
      .gte("starts_at", start)
      .lt("starts_at", end)
      .in("appointments.booking_status", ["confirmed", "hold"])
      .order("starts_at"),
    supabase
      .from("appointment_allocations")
      .select("id, staff_id, kind, reason, occupied")
      .in("kind", ["block", "time_off"])
      .eq("active", true)
      .not("staff_id", "is", null)
      .overlaps("occupied", `[${start},${end})`),
  ]);
  if (e1 || e2) return <ErrorNotice message="No se pudo cargar la agenda del día." />;
  const rows = (lines ?? []) as unknown as Line[];
  if ((people ?? []).length === 0) {
    return <EmptyState title="No hay personal agendable" description="Configura especialistas agendables en Configuración." />;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {people!.map((p) => {
        const mine = rows.filter((r) => r.staff_id === p.id);
        const myBlocks = (blocks ?? []).filter((b) => b.staff_id === p.id);
        return (
          <Card key={p.id} title={p.display_name}>
            {mine.length === 0 && myBlocks.length === 0 ? <p className="text-sm text-muted">Sin citas</p> : null}
            <ul className="space-y-2">
              {myBlocks.map((b) => {
                const r = parsePgRange(b.occupied as string);
                return (
                  <li key={b.id} className="rounded-brand bg-surface-muted p-2 text-sm">
                    <span className="tabular-nums">
                      {hour(r.start)}–{hour(r.end)}
                    </span>{" "}
                    · {b.kind === "time_off" ? "Ausencia" : "Bloqueo"} {b.reason ? `(${b.reason})` : ""}
                  </li>
                );
              })}
              {mine.map((l) => (
                <AppointmentItem key={l.id} line={l} />
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

async function WeekView({ monday, supabase }: { monday: string; supabase: DB }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const start = dayRange(monday).start;
  const end = dayRange(addDays(monday, 7)).start;
  const [{ data: people }, { data: lines, error }] = await Promise.all([
    supabase.from("staff_members").select("id, display_name").eq("is_active", true).order("display_name"),
    supabase
      .from("appointment_services")
      .select(LINE_SELECT)
      .gte("starts_at", start)
      .lt("starts_at", end)
      .in("appointments.booking_status", ["confirmed", "hold"])
      .order("starts_at"),
  ]);
  if (error) return <ErrorNotice message="No se pudo cargar la semana." />;
  const names = new Map((people ?? []).map((p) => [p.id, p.display_name as string]));
  const rows = (lines ?? []) as unknown as Line[];
  const today = todayLocal();
  const byDay = new Map<string, Line[]>(days.map((d) => [d, []]));
  for (const r of rows) {
    const d = days.find((x) => {
      const { start: s, end: e } = dayRange(x);
      const t = Date.parse(r.starts_at);
      return t >= Date.parse(s) && t < Date.parse(e);
    });
    const list = d ? byDay.get(d) : undefined;
    if (list) list.push(r);
  }
  return (
    <div className="grid gap-2 md:grid-cols-7" data-testid="vista-semana">
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        const groups = new Map<string, Line[]>();
        for (const l of list) {
          const k = l.staff_id ?? "";
          groups.set(k, [...(groups.get(k) ?? []), l]);
        }
        return (
          <section key={d} className={`rounded-brand border bg-surface p-2 ${d === today ? "border-accent" : "border-line"}`}>
            <Link href={`/agenda?date=${d}`} className="mb-2 flex items-baseline justify-between text-sm font-medium capitalize hover:underline">
              <span>{shortDay(d)}</span>
              <span className="text-xs font-normal text-muted">{list.length ? `${list.length} cita${list.length === 1 ? "" : "s"}` : ""}</span>
            </Link>
            {list.length === 0 ? <p className="text-xs text-muted">Sin citas</p> : null}
            {[...groups.entries()].map(([staffId, items]) => (
              <div key={staffId} className="mb-2">
                <p className="mb-1 truncate text-xs font-medium text-muted">{names.get(staffId) ?? "Sin especialista"}</p>
                <ul className="space-y-1">
                  {items.map((l) => (
                    <AppointmentItem key={l.id} line={l} compact />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

type ResAlloc = {
  id: string;
  kind: string;
  resource_id: string;
  occupied: string;
  reason: string | null;
  appointments: { id: string; booking_status: string; hold_expires_at: string | null; attendance_status: string; clients: ClientRef | ClientRef[] | null } | null;
  appointment_services: { services: { name: string } | { name: string }[] | null } | null;
};

async function ResourceView({ date, supabase }: { date: string; supabase: DB }) {
  const { start, end } = dayRange(date);
  const [{ data: resources, error: e1 }, { data: allocs, error: e2 }] = await Promise.all([
    supabase.from("resources").select("id, name, sort_order, resource_types(name)").eq("is_active", true).order("sort_order").order("name"),
    supabase
      .from("appointment_allocations")
      .select(
        "id, kind, resource_id, occupied, reason, appointments(id, booking_status, hold_expires_at, attendance_status, clients(first_name, last_name)), appointment_services(services(name))",
      )
      .eq("active", true)
      .not("resource_id", "is", null)
      .overlaps("occupied", `[${start},${end})`),
  ]);
  if (e1 || e2) return <ErrorNotice message="No se pudo cargar la ocupación de recursos." />;
  if ((resources ?? []).length === 0) {
    return <EmptyState title="No hay recursos configurados" description="Da de alta estaciones, sillas o lavacabezas en Configuración." />;
  }
  const now = Date.now();
  const list = ((allocs ?? []) as unknown as ResAlloc[])
    .filter((a) => !(a.appointments?.booking_status === "hold" && a.appointments.hold_expires_at && Date.parse(a.appointments.hold_expires_at) <= now))
    .map((a) => ({ ...a, range: parsePgRange(a.occupied) }))
    .sort((x, y) => x.range.start - y.range.start);
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="vista-recursos">
      {resources!.map((r) => {
        const mine = list.filter((a) => a.resource_id === r.id);
        const type = one(r.resource_types as { name: string } | { name: string }[] | null);
        return (
          <Card key={r.id} title={`${r.name}${type ? ` · ${type.name}` : ""}`}>
            {mine.length === 0 ? <p className="text-sm text-muted">Libre todo el día</p> : null}
            <ul className="space-y-2">
              {mine.map((a) => {
                const span = (
                  <span className="tabular-nums font-medium">
                    {hour(a.range.start)}–{hour(a.range.end)}
                  </span>
                );
                if (a.kind === "block" || !a.appointments) {
                  return (
                    <li key={a.id} className="rounded-brand bg-surface-muted p-2 text-sm">
                      {span} · {a.kind === "block" ? `Bloqueo${a.reason ? ` (${a.reason})` : ""}` : "Ocupado"}
                    </li>
                  );
                }
                const svc = one(a.appointment_services?.services ?? null);
                return (
                  <li key={a.id}>
                    <Link href={`/agenda/cita/${a.appointments.id}`} className="block rounded-brand border border-line p-2 text-sm hover:bg-surface-muted">
                      <span className="flex justify-between gap-2">
                        {span}
                        <ShortStatus booking={a.appointments.booking_status} attendance={a.appointments.attendance_status} />
                      </span>
                      <span className="block truncate">{svc?.name ?? "Servicio"}</span>
                      <span className="block truncate text-muted">{clientName(one(a.appointments.clients))}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

