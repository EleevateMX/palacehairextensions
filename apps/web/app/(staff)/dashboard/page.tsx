import type { Metadata } from "next";
import Link from "next/link";
import { addDays } from "@palace/domain";
import { Bar } from "@/components/reports";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
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
      .select("id, starts_at, booking_status, attendance_status, payment_status, clients(first_name, last_name), appointment_services(services(name), staff_members(display_name))")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .in("booking_status", ["confirmed", "hold"])
      .order("starts_at"),
    seesMoney
      ? supabase.from("sales").select("total_cents, status").gte("created_at", start).lt("created_at", end).neq("status", "voided")
      : Promise.resolve({ data: [] as { total_cents: number }[] }),
    supabase.from("v_stock_availability").select("sku, variant_name, available, min_stock").eq("is_low", true).order("available").limit(8),
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

  return (
    <>
      <PageHeader title={`Hola, ${staff.displayName}`} subtitle={longDate(today)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Citas hoy" value={String(appointments.length)} />
        {seesMoney ? <Stat label="Ventas hoy" value={mxn(salesTotal)} hint={`${sales.data?.length ?? 0} tickets`} /> : null}
        {seesMoney ? <Stat label="Ticket promedio" value={mxn(ticket)} /> : null}
        {seesReception ? <Stat label="Conversaciones pendientes" value={String(conversations.count ?? 0)} hint="Bandeja disponible en V3" /> : null}
        <Stat
          label="Ocupación del día"
          value={pct(occupancy?.totalPct ?? null)}
          hint={occupancy ? `${Math.round(occupancy.total.booked / 60)} h reservadas de ${Math.round((occupancy.total.scheduled - occupancy.total.unavailable) / 60)} h disponibles` : undefined}
        />
        {seesMoney ? <Stat label="Servicios hoy" value={mxn(servicesToday)} hint="Neto de descuentos y devoluciones" /> : null}
        {seesMoney ? <Stat label="Productos hoy" value={mxn(productsToday)} hint="Neto de descuentos y devoluciones" /> : null}
        {k ? <Stat label="Cancelación (30 días)" value={pct(k.cancellationRatePct)} hint={`${k.cancelled} de ${k.appointmentsTotal} citas`} /> : null}
        {k ? <Stat label="No-show (30 días)" value={pct(k.noShowRatePct)} hint={`${k.noShow} de ${k.completed + k.noShow}`} /> : null}
        {k ? <Stat label="Clientas nuevas (30 días)" value={String(k.clientsNew)} hint={`${k.clientsReturning} recurrentes`} /> : null}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Próximas citas">
          {upcoming.length === 0 ? (
            <EmptyState title="Sin citas próximas hoy" />
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((a) => {
                const client = Array.isArray(a.clients) ? a.clients[0] : a.clients;
                const lines = (a.appointment_services ?? []) as unknown as { services: { name: string } | null; staff_members: { display_name: string } | null }[];
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="tabular-nums">{hour(a.starts_at)}</span>
                    <span className="flex-1 truncate">
                      {client ? `${client.first_name} ${client.last_name ?? ""}` : "Sin clienta"} · {lines.map((l) => l.services?.name).join(", ")}
                    </span>
                    {a.booking_status === "hold" ? <Badge tone="warning">Apartado</Badge> : null}
                    {a.payment_status === "needs_refund" ? <Badge tone="danger">Reembolso</Badge> : null}
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/agenda" className="mt-3 inline-block text-sm underline">
            Ver agenda
          </Link>
        </Card>

        <Card title="Inventario crítico">
          {(lowStock.data ?? []).length === 0 ? (
            <EmptyState title="Sin productos bajo mínimo" />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {lowStock.data!.map((v) => (
                <li key={v.sku} className="flex justify-between py-2">
                  <span className="truncate">{v.variant_name}</span>
                  <span className="tabular-nums text-danger">
                    {Number(v.available)} / mín {Number(v.min_stock)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

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
          <Card title="Servicios más rentables del mes">
            {topProfitable.length === 0 ? (
              <EmptyState title="Sin servicios completados este mes" />
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
            <Link href="/finanzas" className="mt-3 inline-block text-sm underline">
              Ver finanzas
            </Link>
          </Card>
        ) : null}

        {seesReception ? (
          <Card title="Alertas operativas" className="md:col-span-2">
            {(alerts.data ?? []).length === 0 ? (
              <EmptyState title="Sin alertas pendientes" />
            ) : (
              <ul className="space-y-2 text-sm">
                {alerts.data!.map((al) => (
                  <li key={al.id} className="flex items-start gap-2">
                    <Badge tone={al.severity === "critical" ? "danger" : "warning"}>{al.kind}</Badge>
                    <span>{al.message}</span>
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
