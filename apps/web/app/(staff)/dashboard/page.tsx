import type { Metadata } from "next";
import Link from "next/link";
import { addDays } from "@palace/domain";
import { Bar } from "@/components/reports";
import { Badge, buttonClass, Card, EmptyState, PageHeader, Stat, ToneDot } from "@/components/ui";
import { clientName, one, ShortStatus } from "../agenda/_lib/status";
import { dayRange } from "@/lib/day";
import { hour, longDate, mxn, todayLocal } from "@/lib/format";
import { currentLocationId } from "@/lib/location";
import { monthStart } from "@/lib/period";
import { loadBookingKpis, loadOccupancy, loadProductivity, loadServiceProfitability, pct } from "@/lib/reports";
import { can, requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const { staff, supabase } = await requireStaff();
  const today = todayLocal();
  const { start, end } = dayRange(today);
  const seesMoney = can(staff, "owner", "admin", "receptionist", "sales");
  const seesReception = can(staff, "owner", "admin", "receptionist");
  const isManager = can(staff, "owner", "admin");
  const locationId = await currentLocationId(supabase, staff);
  const todayPeriod = { from: today, to: today };
  const last30 = { from: addDays(today, -29), to: today };
  const thisMonth = { from: monthStart(today), to: today };

  // Cada consulta respeta RLS y la validación de rol de las RPC; todas en paralelo.
  const [appts, sales, lowStock, alerts, conversations, occupancy, todayLines, kpis, profitable, productivity] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, starts_at, booking_status, attendance_status, payment_status, clients(first_name, last_name), appointment_services(services(name), staff_members(display_name), appointment_allocations(active, resources(name)))")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .in("booking_status", ["confirmed", "hold"])
      .order("starts_at"),
    seesMoney
      ? supabase.from("sales").select("total_cents, status").gte("created_at", start).lt("created_at", end).neq("status", "voided")
      : Promise.resolve({ data: [] as { total_cents: number }[] }),
    supabase.from("v_stock_availability").select("sku, variant_name, tone, length_cm, texture, available, min_stock").eq("is_low", true).order("available").limit(8),
    seesReception
      ? supabase.from("ops_alerts").select("id, kind, severity, message").is("resolved_at", null).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as { id: string; kind: string; severity: string; message: string }[] }),
    seesReception
      ? supabase.from("conversations").select("id", { count: "exact", head: true }).in("state", ["pending_human", "assigned"])
      : Promise.resolve({ count: 0 }),
    locationId ? loadOccupancy(supabase, locationId, todayPeriod) : Promise.resolve(null),
    seesMoney
      ? supabase
          .from("sale_lines")
          .select("kind, total_cents, refunded_cents, sales!inner(created_at, status)")
          .gte("sales.created_at", start)
          .lt("sales.created_at", end)
          .neq("sales.status", "voided")
      : Promise.resolve({ data: [] as { kind: string; total_cents: number; refunded_cents: number }[] }),
    seesReception && locationId ? loadBookingKpis(supabase, locationId, last30) : Promise.resolve(null),
    isManager && locationId ? loadServiceProfitability(supabase, locationId, thisMonth) : Promise.resolve(null),
    isManager && locationId ? loadProductivity(supabase, locationId, todayPeriod) : Promise.resolve(null),
  ]);

  const appointments = appts.data ?? [];
  const salesTotal = (sales.data ?? []).reduce((s, x) => s + x.total_cents, 0);
  const ticket = sales.data?.length ? Math.round(salesTotal / sales.data.length) : 0;
  const upcoming = appointments.filter((a) => new Date(a.starts_at) > new Date()).slice(0, 6);
  const lines = (todayLines.data ?? []) as { kind: string; total_cents: number; refunded_cents: number }[];
  const servicesToday = lines.filter((l) => l.kind === "service" || l.kind === "package").reduce((a, l) => a + l.total_cents - l.refunded_cents, 0);
  const productsToday = lines.filter((l) => l.kind === "product").reduce((a, l) => a + l.total_cents - l.refunded_cents, 0);
  const k = kpis?.kpis;
  const topProfitable = (profitable?.rows ?? []).slice(0, 5);

  const holds = appointments.filter((a) => a.booking_status === "hold").length;
  const localHour = Number(new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greeting = localHour < 12 ? "Buen día" : localHour < 19 ? "Buenas tardes" : "Buenas noches";
  const firstName = staff.displayName.split(" ")[0];
  const occupancyPct = occupancy?.totalPct ?? null;

  return (
    <>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={`${longDate(today)} · ${appointments.length} ${appointments.length === 1 ? "cita" : "citas"} hoy`}
        actions={
          seesReception ? (
            <Link href="/agenda/nueva" className={buttonClass}>
              + Nueva cita
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {seesMoney ? <Stat label="Ventas hoy" value={mxn(salesTotal)} hint={`${sales.data?.length ?? 0} tickets`} /> : null}
        <Stat label="Citas hoy" value={String(appointments.length)} hint={holds ? `${holds} por confirmar` : undefined} tone={holds ? "warning" : "muted"} />
        {seesMoney ? <Stat label="Ticket promedio" value={mxn(ticket)} /> : null}
        <Stat
          label="Ocupación del día"
          value={pct(occupancyPct)}
          progress={occupancyPct ?? 0}
          hint={occupancy ? `${Math.round(occupancy.total.booked / 60)} h de ${Math.round((occupancy.total.scheduled - occupancy.total.unavailable) / 60)} h disponibles` : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card
          title="Próximas citas"
          actions={
            <Link href="/agenda" className="text-sm text-muted hover:text-fg">
              Ver agenda →
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState title="Sin citas próximas hoy" />
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((a) => {
                const lines = (a.appointment_services ?? []) as unknown as {
                  services: { name: string } | null;
                  staff_members: { display_name: string } | null;
                  appointment_allocations: { active: boolean; resources: { name: string } | null }[] | null;
                }[];
                const station = lines
                  .flatMap((l) => l.appointment_allocations ?? [])
                  .find((x) => x.active && x.resources)?.resources?.name;
                const detail = [
                  lines.map((l) => l.services?.name).filter(Boolean).join(", "),
                  station,
                  [...new Set(lines.map((l) => l.staff_members?.display_name).filter(Boolean))].join(", "),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={a.id}>
                    <Link href={`/agenda/cita/${a.id}`} className="flex items-center gap-4 py-3 hover:opacity-80">
                      <span className="w-12 flex-none text-sm font-medium tabular-nums">{hour(a.starts_at)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{clientName(one(a.clients))}</span>
                        <span className="block truncate text-xs text-muted">{detail}</span>
                      </span>
                      <span className="flex flex-none flex-col items-end gap-1">
                        <ShortStatus booking={a.booking_status} attendance={a.attendance_status} />
                        {a.payment_status === "needs_refund" ? <Badge tone="danger">Reembolso</Badge> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid content-start gap-4">
          <Card title="Inventario crítico">
            {(lowStock.data ?? []).length === 0 ? (
              <EmptyState title="Sin productos bajo mínimo" />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {lowStock.data!.map((v) => (
                  <li key={v.sku} className="flex items-center gap-3 py-2.5">
                    <ToneDot tone={v.tone} />
                    <span className="min-w-0 flex-1 truncate">{v.variant_name}</span>
                    <span className="flex-none text-xs font-medium tabular-nums text-danger">
                      {Number(v.available)} / mín {Number(v.min_stock)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {seesReception ? (
            <Card title="Alertas operativas">
              {(alerts.data ?? []).length === 0 ? (
                <p className="text-sm text-muted">Sin alertas pendientes</p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {alerts.data!.map((al) => (
                    <li key={al.id} className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className={`mt-1.5 h-2 w-2 flex-none rounded-full ${al.severity === "critical" ? "bg-danger" : "bg-warning"}`}
                      />
                      <span>{al.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      </div>

      {seesMoney || k || seesReception ? (
        <>
          <p className="eyebrow mb-3 mt-8">Indicadores</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            {seesMoney ? <Stat size="sm" label="Servicios hoy" value={mxn(servicesToday)} hint="Neto de descuentos" /> : null}
            {seesMoney ? <Stat size="sm" label="Productos hoy" value={mxn(productsToday)} hint="Neto de descuentos" /> : null}
            {k ? <Stat size="sm" label="Cancelación (30 días)" value={pct(k.cancellationRatePct)} hint={`${k.cancelled} de ${k.appointmentsTotal} citas`} /> : null}
            {k ? <Stat size="sm" label="No-show (30 días)" value={pct(k.noShowRatePct)} hint={`${k.noShow} de ${k.completed + k.noShow}`} /> : null}
            {k ? <Stat size="sm" label="Clientas nuevas (30 días)" value={String(k.clientsNew)} hint={`${k.clientsReturning} recurrentes`} /> : null}
            {seesReception ? <Stat size="sm" label="Conversaciones" value={String(conversations.count ?? 0)} hint="Bandeja en V3" /> : null}
          </div>
        </>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {productivity ? (
          <Card title="Productividad de hoy">
            {productivity.rows.length === 0 ? (
              <EmptyState title="Sin personal reservable" />
            ) : (
              <ul className="space-y-3 text-sm">
                {productivity.rows.map((r) => (
                  <li key={r.staffId}>
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{r.name}</span>
                      <span className="tabular-nums text-muted">
                        {r.completedAppointments} citas · {mxn(r.servicesRevenueCents + r.productsRevenueCents)}
                      </span>
                    </div>
                    <Bar value={r.occupancyPct ?? 0} max={100} label={r.occupancyPct === null ? "Sin turno" : `${pct(r.occupancyPct)} ocupación`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : occupancy && occupancy.rows.length ? (
          <Card title="Ocupación por especialista hoy">
            <ul className="space-y-3 text-sm">
              {occupancy.rows.map((r) => (
                <li key={r.staffId}>
                  <span className="block truncate">{r.name}</span>
                  <Bar value={r.occupancyPct ?? 0} max={100} label={r.occupancyPct === null ? "Sin turno" : pct(r.occupancyPct)} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {profitable ? (
          <Card
            title="Servicios más rentables del mes"
            actions={
              <Link href="/finanzas" className="text-sm text-muted hover:text-fg">
                Finanzas →
              </Link>
            }
          >
            {topProfitable.length === 0 ? (
              <p className="text-sm text-muted">Sin servicios completados este mes</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {topProfitable.map((r) => (
                  <li key={r.serviceId} className="flex justify-between gap-2 py-2">
                    <span className="truncate">
                      {r.name} <span className="text-muted">· {r.count}</span>
                    </span>
                    <span className="tabular-nums">
                      {mxn(r.marginCents)} <span className="text-muted">({pct(r.marginPct)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
