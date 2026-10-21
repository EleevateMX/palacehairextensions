import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, buttonClass, Card, ErrorNotice, PageHeader, Stat } from "@/components/ui";
import { dayRange } from "@/lib/day";
import { utcToLocalDate } from "@palace/domain";
import { hour, longDate, todayLocal, TZ } from "@/lib/format";
import { currentLocationId } from "@/lib/location";
import { can, requireStaff } from "@/lib/staff";
import { clientName, one, ShortStatus } from "../agenda/_lib/status";
import { setAttendanceAction } from "../agenda/cita/[id]/actions";
import { resolveAlertAction } from "./actions";
import { AutoRefresh } from "./auto-refresh";

export const metadata: Metadata = { title: "Recepción" };

type Ref<T> = T | T[] | null;
type Appt = {
  id: string;
  starts_at: string;
  ends_at: string;
  booking_status: string;
  attendance_status: string;
  hold_expires_at: string | null;
  materials_status: string;
  clients: Ref<{ first_name: string; last_name: string | null }>;
  appointment_services: { staff_id: string | null; position: number; services: Ref<{ name: string }> }[] | null;
};

const SEVERITY: Record<string, ["neutral" | "warning" | "danger", string]> = {
  info: ["neutral", "Info"],
  warning: ["warning", "Atención"],
  critical: ["danger", "Crítica"],
};

const minutesBetween = (a: number, b: number) => Math.round((b - a) / 60_000);

export default async function ReceptionPage() {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) redirect("/dashboard");
  const today = todayLocal();
  const { start, end } = dayRange(today);
  const locationId = await currentLocationId(supabase, staff);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const APPT = "id, starts_at, ends_at, booking_status, attendance_status, hold_expires_at, materials_status, clients(first_name, last_name), appointment_services(staff_id, position, services(name))";
  let todayQ = supabase.from("appointments").select(APPT).gte("starts_at", start).lt("starts_at", end).in("booking_status", ["confirmed", "hold"]).order("starts_at");
  let holdsQ = supabase.from("appointments").select(APPT).eq("booking_status", "hold").gt("hold_expires_at", nowIso).order("hold_expires_at").limit(20);
  let resQ = supabase.from("resources").select("id, name").eq("is_active", true).order("sort_order").order("name");
  if (locationId) {
    todayQ = todayQ.eq("location_id", locationId);
    holdsQ = holdsQ.eq("location_id", locationId);
    resQ = resQ.eq("location_id", locationId);
  }

  const [todayRes, holdsRes, resourcesRes, busyRes, alertsRes, convRes, peopleRes] = await Promise.all([
    todayQ,
    holdsQ,
    resQ,
    // Rango puntual [ahora, ahora]: ocupaciones vigentes en este instante.
    supabase.from("v_busy_allocations").select("resource_id").not("resource_id", "is", null).overlaps("occupied", `[${nowIso},${nowIso}]`),
    supabase.from("ops_alerts").select("id, kind, severity, message, created_at, reference_type, reference_id").is("resolved_at", null).order("created_at", { ascending: false }).limit(20),
    supabase.from("conversations").select("id", { count: "exact", head: true }).in("state", ["pending_human", "assigned"]),
    supabase.from("staff_members").select("id, display_name").eq("is_active", true),
  ]);
  const failed = [todayRes, holdsRes, resourcesRes, busyRes, alertsRes].some((r) => r.error);
  const names = new Map((peopleRes.data ?? []).map((p) => [p.id, p.display_name as string]));
  const appts = (todayRes.data ?? []) as unknown as Appt[];
  const holds = (holdsRes.data ?? []) as unknown as Appt[];

  const upcoming = appts.filter(
    (a) => a.attendance_status === "scheduled" && Date.parse(a.starts_at) >= now && Date.parse(a.starts_at) <= now + 2 * 3_600_000,
  );
  const inService = appts.filter((a) => a.attendance_status === "in_service");
  const arrived = appts.filter((a) => a.attendance_status === "arrived");
  const late = appts.filter((a) => a.attendance_status === "scheduled" && a.booking_status === "confirmed" && Date.parse(a.starts_at) < now);
  const busyNow = new Set((busyRes.data ?? []).map((b) => b.resource_id as string));
  const freeResources = (resourcesRes.data ?? []).filter((r) => !busyNow.has(r.id));
  const alerts = alertsRes.data ?? [];

  return (
    <>
      <PageHeader
        title="Recepción"
        subtitle={longDate(today)}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <AutoRefresh seconds={60} />
            <Link className={buttonClass} href={`/agenda/nueva?date=${today}`}>
              Nueva cita
            </Link>
          </div>
        }
      />
      {failed ? (
        <div className="mb-4">
          <ErrorNotice message="Parte del tablero no se pudo cargar; se reintentará en la próxima actualización." />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Próximas 2 h" value={String(upcoming.length)} />
        <Stat label="En servicio" value={String(inService.length)} hint={arrived.length ? `${arrived.length} en sala de espera` : undefined} />
        <Stat label="Retrasadas" value={String(late.length)} />
        <Stat label="Conversaciones pendientes" value={String(convRes.count ?? 0)} hint="Esperan respuesta humana" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Próximas llegadas (2 h)">
          <ApptList items={upcoming} names={names} now={now} empty="Sin llegadas en las próximas 2 horas." actions="arrive" />
        </Card>
        <Card title="Retrasadas">
          <ApptList items={late} names={names} now={now} empty="Nadie retrasado." actions="arrive" showDelay />
        </Card>
        <Card title="En sala (llegaron)">
          <ApptList items={arrived} names={names} now={now} empty="Nadie esperando." actions="start" />
        </Card>
        <Card title="En servicio">
          <div data-testid="en-servicio">
            <ApptList items={inService} names={names} now={now} empty="Ninguna cita en servicio." showEnd />
          </div>
        </Card>
        <Card title="Estaciones libres ahora">
          {freeResources.length === 0 ? (
            <p className="text-sm text-muted">Todas las estaciones están ocupadas.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {freeResources.map((r) => (
                <li key={r.id}>
                  <Badge tone="success">{r.name}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            {busyNow.size} ocupada{busyNow.size === 1 ? "" : "s"} · <Link className="underline" href={`/agenda?date=${today}&view=recursos`}>Ver ocupación del día</Link>
          </p>
        </Card>
        <Card title="Apartados por vencer">
          {holds.length === 0 ? (
            <p className="text-sm text-muted">Sin apartados pendientes de anticipo.</p>
          ) : (
            <ul className="divide-y divide-line">
              {holds.map((h) => (
                <li key={h.id} className="py-2 text-sm">
                  <Link href={`/agenda/cita/${h.id}`} className="flex justify-between gap-2 hover:underline">
                    <span className="truncate">{clientName(one(h.clients))}</span>
                    <span className="tabular-nums text-warning">vence en {Math.max(minutesBetween(now, Date.parse(h.hold_expires_at!)), 0)} min</span>
                  </Link>
                  <p className="text-xs text-muted">
                    Cita: <span className="capitalize">{longDate(utcToLocalDate(Date.parse(h.starts_at), TZ))}</span> · {hour(h.starts_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Alertas operativas sin resolver" className="md:col-span-2 xl:col-span-3">
          {alerts.length === 0 ? (
            <p className="text-sm text-muted">Sin alertas.</p>
          ) : (
            <ul className="divide-y divide-line">
              {alerts.map((al) => {
                const [tone, label] = SEVERITY[al.severity] ?? ["neutral", al.severity];
                return (
                  <li key={al.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <Badge tone={tone}>{label}</Badge> <span>{al.message}</span>
                      {al.reference_type === "appointment" && al.reference_id ? (
                        <>
                          {" "}
                          <Link className="underline" href={`/agenda/cita/${al.reference_id}`}>
                            Ver cita
                          </Link>
                        </>
                      ) : null}
                    </div>
                    <ActionForm action={resolveAlertAction}>
                      <input type="hidden" name="alert_id" value={al.id} />
                      <SubmitButton variant="secondary">Marcar resuelta</SubmitButton>
                    </ActionForm>
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

function ApptList({
  items,
  names,
  now,
  empty,
  actions,
  showDelay = false,
  showEnd = false,
}: {
  items: Appt[];
  names: Map<string, string>;
  now: number;
  empty: string;
  actions?: "arrive" | "start";
  showDelay?: boolean;
  showEnd?: boolean;
}) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => {
        const lines = [...(a.appointment_services ?? [])].sort((x, y) => x.position - y.position);
        const who = [...new Set(lines.map((l) => (l.staff_id ? names.get(l.staff_id) : null)).filter(Boolean))].join(" + ");
        return (
          <li key={a.id} className="space-y-1 py-2 text-sm">
            <Link href={`/agenda/cita/${a.id}`} className="block hover:underline">
              <span className="flex justify-between gap-2">
                <span className="font-medium tabular-nums">
                  {hour(a.starts_at)}
                  {showEnd ? ` → termina ${hour(a.ends_at)}` : ""}
                </span>
                <ShortStatus booking={a.booking_status} attendance={a.attendance_status} />
              </span>
              <span className="block truncate">{clientName(one(a.clients))}</span>
              <span className="block truncate text-muted">
                {lines.map((l) => one(l.services)?.name).join(" + ")}
                {who ? ` · ${who}` : ""}
              </span>
              {showDelay ? <span className="block text-danger">{minutesBetween(Date.parse(a.starts_at), now)} min de retraso</span> : null}
              {a.materials_status === "missing" ? <Badge tone="danger">Material faltante</Badge> : null}
            </Link>
            {actions && a.booking_status === "confirmed" ? (
              <div className="flex flex-wrap gap-2">
                {actions === "arrive" ? <QuickAttendance id={a.id} status="arrived" label="Llegó" /> : null}
                <QuickAttendance id={a.id} status="in_service" label="En servicio" />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function QuickAttendance({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <ActionForm action={setAttendanceAction}>
      <input type="hidden" name="appointment_id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant="secondary" className="min-h-9 px-3">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}
