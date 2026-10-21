import type { Metadata } from "next";
import Link from "next/link";
import { addDays, parsePgRange } from "@palace/domain";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { dayRange } from "@/lib/day";
import { hour, isIsoDate, longDate, todayLocal } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "Agenda" };

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
    clients: { first_name: string; last_name: string | null } | null;
  } | null;
};

const ATTENDANCE: Record<string, string> = {
  scheduled: "Agendada",
  arrived: "Llegó",
  in_service: "En servicio",
  completed: "Terminada",
  no_show: "No asistió",
};

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { staff, supabase } = await requireStaff();
  const sp = await searchParams;
  const date = isIsoDate(sp.date) ? sp.date : todayLocal();
  const { start, end } = dayRange(date);

  const [{ data: people }, { data: lines }, { data: blocks }] = await Promise.all([
    supabase.from("staff_members").select("id, display_name").eq("is_bookable", true).eq("is_active", true).order("display_name"),
    supabase
      .from("appointment_services")
      .select("id, starts_at, ends_at, staff_id, services(name), appointments!inner(id, booking_status, attendance_status, payment_status, materials_status, clients(first_name, last_name))")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .in("appointments.booking_status", ["confirmed", "hold"])
      .order("starts_at"),
    supabase.from("appointment_allocations").select("id, staff_id, kind, reason, occupied").in("kind", ["block", "time_off"]).eq("active", true).overlaps("occupied", `[${start},${end})`),
  ]);

  const rows = (lines ?? []) as unknown as Line[];
  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={longDate(date)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-brand border border-line px-3 py-2 text-sm" href={`/agenda?date=${addDays(date, -1)}`}>
              ← Día anterior
            </Link>
            <Link className="rounded-brand border border-line px-3 py-2 text-sm" href={`/agenda?date=${addDays(date, 1)}`}>
              Día siguiente →
            </Link>
            {can(staff, "owner", "admin", "receptionist") ? (
              <Link className={buttonClass} href={`/agenda/nueva?date=${date}`}>
                Nueva cita
              </Link>
            ) : null}
          </div>
        }
      />
      {(people ?? []).length === 0 ? (
        <EmptyState title="No hay personal agendable" description="Configura especialistas con is_bookable en Configuración." />
      ) : (
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
                  {mine.map((l) => {
                    const a = l.appointments!;
                    return (
                      <li key={l.id} className="rounded-brand border border-line p-2 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="tabular-nums font-medium">
                            {hour(l.starts_at)}–{hour(l.ends_at)}
                          </span>
                          <Badge tone={a.booking_status === "hold" ? "warning" : "neutral"}>
                            {a.booking_status === "hold" ? "Apartado" : ATTENDANCE[a.attendance_status]}
                          </Badge>
                        </div>
                        <p className="truncate">{l.services?.name}</p>
                        <p className="truncate text-muted">{a.clients ? `${a.clients.first_name} ${a.clients.last_name ?? ""}` : "Sin clienta"}</p>
                        {a.materials_status === "missing" ? <Badge tone="danger">Material faltante</Badge> : null}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
