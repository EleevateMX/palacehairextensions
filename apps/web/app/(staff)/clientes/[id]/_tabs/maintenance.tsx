import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, buttonClass, Card, EmptyState, ErrorNotice } from "@/components/ui";
import { todayLocal } from "@/lib/format";
import { can } from "@/lib/staff";
import { dateMx, REMINDER_LABEL } from "../../_lib/crm";
import { updateReminderAction } from "../../actions";
import type { TabProps } from "./types";

export async function MaintenanceTab({ supabase, staff, client }: TabProps) {
  if (!can(staff, "owner", "admin", "receptionist")) {
    return (
      <Card>
        <p className="text-sm text-muted">El seguimiento de mantenimiento lo gestionan recepción y administración.</p>
        {client.next_visit_suggested ? <p className="mt-2 text-sm">Próxima visita sugerida: {dateMx(client.next_visit_suggested)}</p> : null}
      </Card>
    );
  }
  const [{ data: reminders, error }, { data: services }] = await Promise.all([
    supabase
      .from("maintenance_reminders")
      .select("id, technique, due_date, remind_on, status, appointment_id")
      .eq("client_id", client.id)
      .order("due_date", { ascending: false })
      .limit(50),
    supabase.from("services").select("id, name, technique").eq("is_active", true).ilike("name", "%mantenimiento%"),
  ]);
  const today = todayLocal();
  // Servicio de mantenimiento "obvio": el de la misma técnica; si no, el único que exista.
  const serviceFor = (technique: string | null) =>
    services?.find((s) => technique && s.technique === technique)?.id ?? (services?.length === 1 ? services[0]!.id : undefined);
  const bookHref = (technique: string | null) => {
    const p = new URLSearchParams({ client: client.id });
    const sid = serviceFor(technique);
    if (sid) p.set("service", sid);
    return `/agenda/nueva?${p}`;
  };

  return (
    <Card title="Recordatorios de mantenimiento">
      {client.next_visit_suggested ? <p className="mb-3 text-sm">Próxima visita sugerida: {dateMx(client.next_visit_suggested)}</p> : null}
      {error ? <ErrorNotice message="No se pudieron cargar los recordatorios." /> : null}
      {!error && (reminders ?? []).length === 0 ? (
        <EmptyState
          title="Sin recordatorios"
          description="Se crean solos al completar un servicio con intervalo de mantenimiento."
        />
      ) : null}
      <ul className="divide-y divide-line text-sm" aria-label="Recordatorios">
        {(reminders ?? []).map((r) => {
          const open = r.status === "pending" || r.status === "sent";
          const overdue = open && r.due_date < today;
          return (
            <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="font-medium">Vence {dateMx(r.due_date)}</span>{" "}
                <Badge tone={overdue ? "danger" : open ? "warning" : r.status === "booked" ? "success" : "neutral"}>
                  {overdue ? "Vencido" : (REMINDER_LABEL[r.status] ?? r.status)}
                </Badge>
                <span className="block text-xs text-muted">
                  {r.technique ? `Técnica: ${r.technique} · ` : ""}Recordar el {dateMx(r.remind_on)}
                </span>
              </span>
              {open ? (
                <span className="flex flex-wrap gap-2">
                  <Link href={bookHref(r.technique)} className={buttonClass}>
                    Agendar
                  </Link>
                  {r.status === "pending" ? <ReminderButton client={client.id} id={r.id} status="sent" label="Marcar enviado" /> : null}
                  <ReminderButton client={client.id} id={r.id} status="booked" label="Ya agendó" />
                  <ReminderButton client={client.id} id={r.id} status="dismissed" label="Descartar" />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ReminderButton({ client, id, status, label }: { client: string; id: string; status: string; label: string }) {
  return (
    <ActionForm action={updateReminderAction}>
      <input type="hidden" name="client_id" value={client} />
      <input type="hidden" name="reminder_id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant="secondary">{label}</SubmitButton>
    </ActionForm>
  );
}
