import type { Metadata } from "next";
import Link from "next/link";
import { addDays, localWeekday, parsePgRange } from "@palace/domain";
import { Badge, buttonClass, Card, EmptyState, ErrorNotice, PageHeader, Segmented } from "@/components/ui";
import { dayRange } from "@/lib/day";
import { hour, isIsoDate, longDate, TZ, todayLocal } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";
import { clientName, one, ShortStatus, statusAccent } from "./_lib/status";

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

const navLink = "inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-line bg-surface px-3 text-sm hover:border-gold";

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

  const views: { key: View; label: string }[] = [
    { key: "dia", label: "Día" },
    { key: "semana", label: "Semana" },
    { key: "recursos", label: "Estaciones" },
  ];

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={subtitle}
        actions={
          isFront ? (
            <Link className={buttonClass} href={`/agenda/nueva?date=${date}`}>
              + Nueva cita
            </Link>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented items={views.map((v) => ({ key: v.key, label: v.label, href: href(date, v.key) }))} current={view} />
        <nav aria-label="Cambiar fecha" className={`items-center gap-1 ${view === "dia" ? "hidden md:flex" : "flex"}`}>
          <Link className={navLink} href={href(prev)} aria-label={view === "semana" ? "Semana anterior" : "Día anterior"}>
            ←
          </Link>
          <Link className={navLink} href={href(todayLocal())}>
            Hoy
          </Link>
          <Link className={navLink} href={href(next)} aria-label={view === "semana" ? "Semana siguiente" : "Día siguiente"}>
            →
          </Link>
        </nav>
        {isFront ? (
          <span className="flex gap-4 text-sm">
            <Link className="text-muted hover:text-fg" href="/agenda/bloqueos">
              Bloqueos
            </Link>
            <Link className="text-muted hover:text-fg" href="/agenda/espera">
              Lista de espera
            </Link>
          </span>
        ) : null}
      </div>
      {view === "dia" ? <DayStrip date={date} /> : null}
      {sp.creada && /^[0-9a-f-]{36}$/i.test(sp.creada) ? (
        <p role="status" className="mb-4 rounded-xl border border-success/30 bg-success/8 p-3 text-sm text-success">
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
        className={`block rounded-xl border border-l-[3px] border-line bg-surface hover:border-gold ${statusAccent(a.booking_status, a.attendance_status)} ${
          a.attendance_status === "in_service" ? "bg-nude" : ""
        } ${compact ? "p-1.5 text-xs" : "p-2.5 text-sm"}`}
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

/** Minutos desde medianoche en la zona del salón. */
function localMinutes(t: string | number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((x) => x.type === k)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Tira de días (teléfono): tres antes y tres después. */
function DayStrip({ date }: { date: string }) {
  const today = todayLocal();
  const days = Array.from({ length: 7 }, (_, i) => addDays(date, i - 3));
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", ...o }).format(new Date(`${d}T00:00:00Z`));
  return (
    <nav aria-label="Días" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
      {days.map((d) => (
        <Link
          key={d}
          href={`/agenda?date=${d}`}
          aria-current={d === date ? "date" : undefined}
          className={`flex min-w-[52px] flex-col items-center rounded-xl border px-2 py-1.5 ${
            d === date ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface"
          }`}
        >
          <span className={`text-[11px] capitalize ${d === date ? "text-gold" : "text-muted"}`}>{fmt(d, { weekday: "short" }).replace(".", "")}</span>
          <span className={`text-base font-medium tabular-nums ${d === today && d !== date ? "underline decoration-gold underline-offset-4" : ""}`}>
            {fmt(d, { day: "numeric" })}
          </span>
        </Link>
      ))}
    </nav>
  );
}

const PX_PER_MIN = 1.1;

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
  const dayStart = Date.parse(start);
  const dayEnd = Date.parse(end);
  const clampMin = (t: number) => (t <= dayStart ? 0 : t >= dayEnd ? 24 * 60 : localMinutes(t));
  const blockRanges = (blocks ?? []).map((b) => ({ ...b, range: parsePgRange(b.occupied as string) }));

  // Rejilla de 9:00 a 20:00, ampliada si hay citas o bloqueos fuera de ese horario.
  const mins = [
    ...rows.flatMap((r) => [clampMin(Date.parse(r.starts_at)), clampMin(Date.parse(r.ends_at))]),
    ...blockRanges.flatMap((b) => [clampMin(b.range.start), clampMin(b.range.end)]),
  ];
  const firstHour = Math.min(9, ...mins.map((m) => Math.floor(m / 60)));
  const lastHour = Math.max(20, ...mins.map((m) => Math.ceil(m / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const gridHeight = (lastHour - firstHour) * 60 * PX_PER_MIN;
  const pos = (a: number, b: number) => {
    const top = (clampMin(a) - firstHour * 60) * PX_PER_MIN;
    const height = Math.max(36, (clampMin(b) - clampMin(a)) * PX_PER_MIN - 4);
    return { "--top": `${top}px`, "--h": `${height}px` } as React.CSSProperties;
  };
  const placed = "md:absolute md:inset-x-1.5 md:top-[var(--top)] md:h-[var(--h)] md:overflow-hidden";

  return (
    <div className="md:flex md:overflow-hidden md:rounded-2xl md:border md:border-line md:bg-surface">
      {/* Columna de horas (solo escritorio) */}
      <div className="hidden w-14 flex-none border-r border-line md:block" aria-hidden>
        <div className="h-11 border-b border-line" />
        <div className="relative" style={{ height: gridHeight }}>
          {hours.map((h) => (
            <span key={h} className="absolute left-2 -translate-y-1/2 text-[11px] tabular-nums text-muted" style={{ top: (h - firstHour) * 60 * PX_PER_MIN }}>
              {h > firstHour ? `${String(h).padStart(2, "0")}:00` : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:flex-1 md:gap-0 md:overflow-x-auto" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <div className="grid gap-4 md:flex md:min-w-full md:gap-0">
          {people!.map((p) => {
            const mine = rows.filter((r) => r.staff_id === p.id);
            const myBlocks = blockRanges.filter((b) => b.staff_id === p.id);
            return (
              <section key={p.id} className="md:min-w-[200px] md:flex-1 md:border-r md:border-line md:last:border-r-0">
                <h2 className="mb-2 flex items-center justify-between text-sm font-medium md:mb-0 md:h-11 md:border-b md:border-line md:px-3">
                  {p.display_name}
                  <span className="text-xs font-normal text-muted">{mine.length ? `${mine.length} cita${mine.length === 1 ? "" : "s"}` : ""}</span>
                </h2>
                <ul
                  className="relative space-y-2 md:space-y-0 md:[height:var(--grid-h)] md:bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_calc(var(--hour)-1px),var(--color-line)_calc(var(--hour)-1px),var(--color-line)_var(--hour))]"
                  style={{ "--grid-h": `${gridHeight}px`, "--hour": `${60 * PX_PER_MIN}px` } as React.CSSProperties}
                >
                  {mine.length === 0 && myBlocks.length === 0 ? <li className="text-sm text-muted md:hidden">Sin citas</li> : null}
                  {myBlocks.map((b) => (
                    <li
                      key={b.id}
                      style={pos(b.range.start, b.range.end)}
                      className={`rounded-xl border border-dashed border-line bg-surface-muted p-2.5 text-xs text-muted ${placed}`}
                    >
                      <span className="tabular-nums">
                        {hour(b.range.start)}–{hour(b.range.end)}
                      </span>{" "}
                      · {b.kind === "time_off" ? "Ausencia" : "Bloqueo"} {b.reason ? `(${b.reason})` : ""}
                    </li>
                  ))}
                  {mine.map((l) => {
                    const a = l.appointments!;
                    return (
                      <li key={l.id} style={pos(Date.parse(l.starts_at), Date.parse(l.ends_at))} className={placed}>
                        <Link
                          href={`/agenda/cita/${a.id}`}
                          className={`flex h-full flex-col gap-1 rounded-xl border border-l-[3px] border-line p-2.5 text-sm transition hover:border-gold ${statusAccent(
                            a.booking_status,
                            a.attendance_status,
                          )} ${a.attendance_status === "in_service" ? "bg-nude" : "bg-surface"}`}
                        >
                          <span className="truncate font-medium">
                            <span className="tabular-nums">{hour(l.starts_at)}</span> · {clientName(a.clients)}
                          </span>
                          <span className="truncate text-xs text-muted">
                            {l.services?.name} · hasta {hour(l.ends_at)}
                          </span>
                          <span className="flex flex-wrap gap-1">
                            <ShortStatus booking={a.booking_status} attendance={a.attendance_status} />
                            {a.materials_status === "missing" ? <Badge tone="danger">Material faltante</Badge> : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
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
          <section key={d} className={`rounded-2xl border bg-surface p-2.5 ${d === today ? "border-gold" : "border-line"}`}>
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
                    <li key={a.id} className="rounded-xl border border-dashed border-line bg-surface-muted p-2.5 text-sm text-muted">
                      {span} · {a.kind === "block" ? `Bloqueo${a.reason ? ` (${a.reason})` : ""}` : "Ocupado"}
                    </li>
                  );
                }
                const svc = one(a.appointment_services?.services ?? null);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/agenda/cita/${a.appointments.id}`}
                      className={`block rounded-xl border border-l-[3px] border-line p-2.5 text-sm hover:border-gold ${statusAccent(
                        a.appointments.booking_status,
                        a.appointments.attendance_status,
                      )} ${a.appointments.attendance_status === "in_service" ? "bg-nude" : "bg-surface"}`}
                    >
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

