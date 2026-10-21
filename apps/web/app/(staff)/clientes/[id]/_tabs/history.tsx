import Link from "next/link";
import { Badge, Card, EmptyState, ErrorNotice } from "@/components/ui";
import { mxn } from "@/lib/format";
import { can } from "@/lib/staff";
import { ATTENDANCE_LABEL, BOOKING_LABEL, dateMx } from "../../_lib/crm";
import type { TabProps } from "./types";

type ApptRow = {
  id: string;
  starts_at: string;
  booking_status: string;
  attendance_status: string;
  appointment_services: { id: string; price_cents: number; services: { name: string } | null; staff_members: { display_name: string } | null }[];
};
type SaleRow = {
  id: string;
  folio: number;
  created_at: string;
  status: string;
  total_cents: number;
  balance_due_cents: number;
  sale_lines: { description: string; quantity: number }[];
};

export async function HistoryTab({ supabase, staff, client }: TabProps) {
  const seesSales = can(staff, "owner", "admin", "receptionist", "sales");
  const [appts, sales] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, starts_at, booking_status, attendance_status, appointment_services(id, price_cents, services(name), staff_members(display_name))",
      )
      .eq("client_id", client.id)
      .order("starts_at", { ascending: false })
      .limit(50),
    seesSales
      ? supabase
          .from("sales")
          .select("id, folio, created_at, status, total_cents, balance_due_cents, sale_lines(description, quantity)")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as SaleRow[], error: null }),
  ]);
  const appointments = (appts.data ?? []) as unknown as ApptRow[];
  const saleRows = (sales.data ?? []) as unknown as SaleRow[];

  return (
    <div className="space-y-4">
      <Card title="Citas">
        {appts.error ? <ErrorNotice message="No se pudieron cargar las citas." /> : null}
        {!appts.error && appointments.length === 0 ? <EmptyState title="Sin citas registradas" /> : null}
        <ul className="divide-y divide-line text-sm" aria-label="Citas de la clienta">
          {appointments.map((a) => (
            <li key={a.id}>
              <Link href={`/agenda/cita/${a.id}`} className="flex flex-col gap-1 py-2 hover:bg-surface-muted sm:flex-row sm:justify-between sm:px-2">
                <span>
                  <span className="font-medium">{dateMx(a.starts_at, true)}</span>
                  <span className="block text-xs text-muted">
                    {a.appointment_services
                      .map((s) => `${s.services?.name ?? "Servicio"}${s.staff_members ? ` · ${s.staff_members.display_name}` : ""}`)
                      .join(" / ") || "Sin servicios"}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <Badge tone={a.booking_status === "cancelled" || a.booking_status === "expired" ? "danger" : "neutral"}>
                    {BOOKING_LABEL[a.booking_status] ?? a.booking_status}
                  </Badge>
                  <Badge tone={a.attendance_status === "completed" ? "success" : a.attendance_status === "no_show" ? "warning" : "neutral"}>
                    {ATTENDANCE_LABEL[a.attendance_status] ?? a.attendance_status}
                  </Badge>
                  <span className="tabular-nums text-muted">{mxn(a.appointment_services.reduce((t, s) => t + s.price_cents, 0))}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Compras">
        {!seesSales ? (
          <p className="text-sm text-muted">Tu rol no consulta las ventas de la clienta.</p>
        ) : sales.error ? (
          <ErrorNotice message="No se pudieron cargar las compras." />
        ) : saleRows.length === 0 ? (
          <EmptyState title="Sin compras registradas" />
        ) : (
          <ul className="divide-y divide-line text-sm" aria-label="Compras de la clienta">
            {saleRows.map((s) => (
              <li key={s.id}>
                <Link href={`/ventas/${s.id}`} className="flex flex-col gap-1 py-2 hover:bg-surface-muted sm:flex-row sm:justify-between sm:px-2">
                  <span>
                    <span className="font-medium">
                      Folio {s.folio} · {dateMx(s.created_at, true)}
                    </span>
                    <span className="block text-xs text-muted">
                      {s.sale_lines.map((l) => `${Number(l.quantity)} × ${l.description}`).join(", ")}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {s.status === "voided" ? <Badge tone="danger">Cancelada</Badge> : null}
                    {s.balance_due_cents > 0 ? <Badge tone="warning">Saldo {mxn(s.balance_due_cents)}</Badge> : null}
                    <span className="tabular-nums">{mxn(s.total_cents)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
