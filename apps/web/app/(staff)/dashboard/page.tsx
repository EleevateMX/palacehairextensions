import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { dayRange } from "@/lib/day";
import { hour, longDate, mxn, todayLocal } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const { staff, supabase } = await requireStaff();
  const today = todayLocal();
  const { start, end } = dayRange(today);
  const seesMoney = can(staff, "owner", "admin", "receptionist", "sales");
  const seesReception = can(staff, "owner", "admin", "receptionist");

  // Cada consulta respeta RLS: lo que el rol no puede ver regresa vacío.
  const [appts, sales, lowStock, alerts, conversations] = await Promise.all([
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
  ]);

  const appointments = appts.data ?? [];
  const salesTotal = (sales.data ?? []).reduce((s, x) => s + x.total_cents, 0);
  const ticket = sales.data?.length ? Math.round(salesTotal / sales.data.length) : 0;
  const upcoming = appointments.filter((a) => new Date(a.starts_at) > new Date()).slice(0, 6);

  return (
    <>
      <PageHeader title={`Hola, ${staff.displayName}`} subtitle={longDate(today)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Citas hoy" value={String(appointments.length)} />
        {seesMoney ? <Stat label="Ventas hoy" value={mxn(salesTotal)} hint={`${sales.data?.length ?? 0} tickets`} /> : null}
        {seesMoney ? <Stat label="Ticket promedio" value={mxn(ticket)} /> : null}
        {seesReception ? <Stat label="Conversaciones pendientes" value={String(conversations.count ?? 0)} hint="Bandeja disponible en V3" /> : null}
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
