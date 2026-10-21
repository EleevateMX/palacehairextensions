import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { todayLocal } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";
import { dateTime } from "../../configuracion/_lib/format";
import { cancelTimeOff, decideTimeOff, requestTimeOff } from "./actions";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Ausencias" };

const KIND_LABEL = { vacation: "Vacaciones", permit: "Permiso", sick: "Incapacidad", training: "Capacitación", other: "Otro" } as const;
const STATUS = {
  requested: { label: "Pendiente", tone: "warning" },
  approved: { label: "Aprobada", tone: "success" },
  rejected: { label: "Rechazada", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
} as const;

type TimeOff = {
  id: string;
  staff_id: string;
  kind: keyof typeof KIND_LABEL;
  starts_at: string;
  ends_at: string;
  status: keyof typeof STATUS;
  reason: string | null;
  created_at: string;
};

function Period({ t }: { t: TimeOff }) {
  return (
    <span className="tabular-nums">
      {dateTime(t.starts_at)} → {dateTime(t.ends_at)}
    </span>
  );
}

function CancelButton({ id }: { id: string }) {
  return (
    <ActionForm action={cancelTimeOff}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="secondary" confirm="¿Cancelar esta ausencia?">
        Cancelar
      </SubmitButton>
    </ActionForm>
  );
}

export default async function TimeOffPage() {
  const { staff, supabase } = await requireStaff();
  const manage = can(staff, "owner", "admin");
  const seesTeam = manage || can(staff, "receptionist");
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data, error }, people] = await Promise.all([
    // RLS: cada quien ve las suyas; owner/admin/recepción ven todas.
    supabase
      .from("staff_time_off")
      .select("id, staff_id, kind, starts_at, ends_at, status, reason, created_at")
      .gte("ends_at", since)
      .order("starts_at")
      .limit(300),
    supabase.from("staff_members").select("id, display_name").eq("is_active", true).order("display_name"),
  ]);
  const list = (data ?? []) as TimeOff[];
  const name = new Map((people.data ?? []).map((p) => [p.id, p.display_name]));
  const mine = list.filter((t) => t.staff_id === staff.id);
  const pending = list.filter((t) => t.status === "requested");
  const approved = list.filter((t) => t.status === "approved" && Date.parse(t.ends_at) > Date.now());
  const today = todayLocal();

  return (
    <>
      <PageHeader
        title="Ausencias y vacaciones"
        subtitle="Al aprobarse, la agenda bloquea ese periodo"
        actions={
          <Link href="/personal" className="text-sm underline">
            ← Personal
          </Link>
        }
      />
      {error ? <ErrorNotice message="No se pudieron cargar las ausencias." /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Solicitar ausencia">
          <ActionForm action={requestTimeOff} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            {manage ? (
              <Field label="Para" className="sm:col-span-2">
                <select name="staff_id" defaultValue={staff.id} className={inputClass}>
                  {(people.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                      {p.id === staff.id ? " (yo)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Tipo" className="sm:col-span-2">
              <select name="kind" className={inputClass}>
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Desde (fecha)">
              <input type="date" name="start_date" required defaultValue={today} className={inputClass} />
            </Field>
            <Field label="Desde (hora, opcional)" hint="Vacío = todo el día">
              <input type="time" name="start_time" className={inputClass} />
            </Field>
            <Field label="Hasta (fecha)">
              <input type="date" name="end_date" required defaultValue={today} className={inputClass} />
            </Field>
            <Field label="Hasta (hora, opcional)" hint="Vacío = incluye todo el día">
              <input type="time" name="end_time" className={inputClass} />
            </Field>
            <Field label="Motivo (opcional)" className="sm:col-span-2">
              <input name="reason" maxLength={300} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Enviar solicitud</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card title="Mis ausencias">
          {mine.length === 0 ? (
            <EmptyState title="Sin ausencias recientes" />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {mine.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{KIND_LABEL[t.kind]}</span> <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
                    <span className="block text-muted">
                      <Period t={t} />
                    </span>
                    {t.reason ? <span className="block text-xs text-muted">{t.reason}</span> : null}
                  </span>
                  {t.status === "requested" || (manage && t.status === "approved") ? <CancelButton id={t.id} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {seesTeam ? (
          <Card title={`Pendientes de aprobación (${pending.length})`}>
            {pending.length === 0 ? (
              <EmptyState title="No hay solicitudes pendientes" />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {pending.map((t) => {
                  const who = name.get(t.staff_id) ?? "Persona inactiva";
                  return (
                    <li key={t.id} className="space-y-2 py-3" data-testid="pending-time-off">
                      <p>
                        <span className="font-medium">{who}</span> · {KIND_LABEL[t.kind]}
                        <span className="block text-muted">
                          <Period t={t} />
                        </span>
                        {t.reason ? <span className="block text-xs text-muted">{t.reason}</span> : null}
                      </p>
                      {manage ? <DecisionForm id={t.id} who={who} action={decideTimeOff} /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ) : null}

        {seesTeam ? (
          <Card title="Ausencias aprobadas próximas">
            {approved.length === 0 ? (
              <EmptyState title="Sin ausencias aprobadas próximas" />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {approved.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="approved-time-off">
                    <span>
                      <span className="font-medium">{name.get(t.staff_id) ?? "Persona inactiva"}</span> · {KIND_LABEL[t.kind]}
                      <span className="block text-muted">
                        <Period t={t} />
                      </span>
                    </span>
                    {manage ? <CancelButton id={t.id} /> : null}
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
