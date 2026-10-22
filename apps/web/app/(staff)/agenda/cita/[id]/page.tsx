import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { utcToLocalDate } from "@palace/domain";
import { ActionForm, SubmitButton } from "@/components/forms";
import { KeepValuesForm } from "../../_components/keep-values-form";
import { buttonClass, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader, secondaryButtonClass, ToneDot } from "@/components/ui";
import { loadSlots } from "@/lib/availability";
import { hour, isIsoDate, longDate, mxn, TZ } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";
import { formatPhone } from "../../../clientes/_lib/crm";
import { clientName, DEPOSIT_METHOD, DEPOSIT_STATUS, one, StatusBadge } from "../../_lib/status";
import {
  cancelAppointmentAction,
  completeAppointmentAction,
  reassignAction,
  recordDepositAction,
  rescheduleAction,
  setAttendanceAction,
  updateNotesAction,
} from "./actions";

export const metadata: Metadata = { title: "Detalle de cita" };

type Ref<T> = T | T[] | null;
type Appointment = {
  id: string;
  location_id: string;
  booking_status: string;
  attendance_status: string;
  payment_status: string;
  materials_status: string;
  hold_expires_at: string | null;
  starts_at: string;
  ends_at: string;
  deposit_required_cents: number;
  notes: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  rescheduled_from: string | null;
  source: string;
  clients: Ref<{ id: string; first_name: string; last_name: string | null; phone: string | null }>;
};
type ServiceLine = {
  id: string;
  service_id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  position: number;
  services: Ref<{ name: string }>;
};
type Reservation = {
  id: string;
  quantity: number;
  status: string;
  expires_at: string | null;
  product_variants: Ref<{ name: string; sku: string; tone: string | null; unit: string }>;
};

const SOURCE: Record<string, string> = {
  reception: "Recepción",
  online: "Portal en línea",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  phone: "Teléfono",
  walk_in: "Sin cita",
};
const RES_STATUS: Record<string, string> = { active: "Reservado", consumed: "Consumido", released: "Liberado", expired: "Vencido" };

type SP = { reprogramar?: string; cancelada?: string; h?: string; reprogramada?: string };

export default async function AppointmentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { staff, supabase } = await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: apptData, error } = await supabase
    .from("appointments")
    .select(
      "id, location_id, booking_status, attendance_status, payment_status, materials_status, hold_expires_at, starts_at, ends_at, deposit_required_cents, notes, cancel_reason, cancelled_at, rescheduled_from, source, clients(id, first_name, last_name, phone)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return <ErrorNotice message="No se pudo cargar la cita." />;
  if (!apptData) notFound(); // inexistente o fuera del alcance del rol (RLS)
  const a = apptData as unknown as Appointment;

  const isFront = can(staff, "owner", "admin", "receptionist");
  const seesMoney = can(staff, "owner", "admin", "receptionist", "sales");
  const canAttend = isFront || can(staff, "stylist");

  const [{ data: linesData }, { data: resData }, { data: deposits }, { data: successor }, { data: people }] = await Promise.all([
    supabase.from("appointment_services").select("id, service_id, staff_id, starts_at, ends_at, price_cents, position, services(name)").eq("appointment_id", id).order("position"),
    supabase.from("stock_reservations").select("id, quantity, status, expires_at, product_variants(name, sku, tone, unit)").eq("appointment_id", id).order("created_at"),
    seesMoney
      ? supabase.from("appointment_deposits").select("id, amount_cents, method, provider_ref, status, received_at").eq("appointment_id", id).order("received_at")
      : Promise.resolve({ data: [] as { id: string; amount_cents: number; method: string; provider_ref: string; status: string; received_at: string }[] }),
    supabase.from("appointments").select("id").eq("rescheduled_from", id).maybeSingle(),
    supabase.from("staff_members").select("id, display_name").eq("is_active", true).order("display_name"),
  ]);
  const lines = (linesData ?? []) as unknown as ServiceLine[];
  const reservations = (resData ?? []) as unknown as Reservation[];
  const names = new Map((people ?? []).map((p) => [p.id, p.display_name as string]));
  const client = one(a.clients);

  const active = a.booking_status === "hold" || a.booking_status === "confirmed";
  const confirmed = a.booking_status === "confirmed";
  const att = a.attendance_status;
  const finished = att === "completed" || att === "no_show";
  const activeReservations = reservations.filter((r) => r.status === "active");
  const paidDeposits = (deposits ?? []).filter((d) => d.status === "received" || d.status === "applied").reduce((t, d) => t + d.amount_cents, 0);
  const pendingDeposit = Math.max(a.deposit_required_cents - paidDeposits, 0);
  const localDate = utcToLocalDate(Date.parse(a.starts_at), TZ);

  // Datos adicionales solo cuando aplican.
  const [qualified, variants, reschedule] = await Promise.all([
    isFront && active && !finished
      ? supabase
          .from("staff_services")
          .select("service_id, staff_id, staff_members!inner(display_name, is_active, is_bookable)")
          .in("service_id", lines.map((l) => l.service_id))
          .eq("staff_members.is_active", true)
      : Promise.resolve({ data: [] as { service_id: string; staff_id: string; staff_members: Ref<{ display_name: string }> }[] }),
    canAttend && confirmed && !finished
      ? supabase.from("product_variants").select("id, name, sku").eq("is_active", true).order("name").limit(300)
      : Promise.resolve({ data: [] as { id: string; name: string; sku: string }[] }),
    isFront && active && att === "scheduled" && isIsoDate(sp.reprogramar)
      ? loadSlots(supabase, { locationId: a.location_id, serviceIds: lines.map((l) => l.service_id), date: sp.reprogramar, ignoreAppointmentId: id })
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: `/agenda?date=${localDate}`, label: "Agenda" }}
        title={`${clientName(client)} · ${hour(a.starts_at)}`}
        subtitle={[
          longDate(localDate),
          lines.map((l) => one(l.services)?.name).filter(Boolean).join(", "),
          [...new Set(lines.map((l) => (l.staff_id ? names.get(l.staff_id) : null)).filter(Boolean))].join(", "),
          durationLabel(Date.parse(a.ends_at) - Date.parse(a.starts_at)),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          seesMoney && confirmed && att !== "no_show" ? (
            <Link className={att === "completed" ? buttonClass : secondaryButtonClass} href={`/pos?appointment=${a.id}`}>
              Cobrar en POS
            </Link>
          ) : null
        }
      />

      {sp.cancelada ? (
        <p role="status" className="mb-4 rounded-xl border border-line bg-surface p-3 text-sm">
          {sp.cancelada === "ya"
            ? "La cita ya estaba cancelada."
            : sp.cancelada === "tardia"
              ? `Cita cancelada. Cancelación tardía: faltaban menos de ${sp.h ?? "24"} h. Aplica la política de anticipos.`
              : `Cita cancelada con anticipación (más de ${sp.h ?? "24"} h). Materiales reservados liberados.`}
        </p>
      ) : null}
      {sp.reprogramada ? (
        <p role="status" className="mb-4 rounded-xl border border-success/30 bg-success/8 p-3 text-sm text-success">
          Cita reprogramada. Materiales y anticipos se movieron a este nuevo horario.
        </p>
      ) : null}
      {successor ? (
        <p className="mb-4 rounded-xl border border-line bg-surface p-3 text-sm">
          Esta cita fue reprogramada.{" "}
          <Link className="font-medium underline" href={`/agenda/cita/${successor.id}`}>
            Ver la nueva cita
          </Link>
        </p>
      ) : null}
      {a.booking_status === "hold" && a.hold_expires_at ? (
        <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          Apartado provisional: vence a las {hour(a.hold_expires_at)} si no se registra el anticipo.
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2" aria-label="Estados de la cita">
        <StatusBadge kind="booking" value={a.booking_status} />
        <StatusBadge kind="attendance" value={a.attendance_status} />
        <StatusBadge kind="payment" value={a.payment_status} />
        <StatusBadge kind="materials" value={a.materials_status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card title="Servicios">
            <ul className="divide-y divide-line">
              {lines.map((l) => {
                const options = (qualified.data ?? []).filter((q) => q.service_id === l.service_id && q.staff_id !== l.staff_id);
                return (
                  <li key={l.id} className="py-2 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">{one(l.services)?.name}</span>
                      <span className="tabular-nums">
                        {hour(l.starts_at)}–{hour(l.ends_at)}
                        {seesMoney ? ` · ${mxn(l.price_cents)}` : ""}
                      </span>
                    </div>
                    <p className="text-muted">Especialista: {l.staff_id ? (names.get(l.staff_id) ?? "—") : "Sin asignar"}</p>
                    {options.length > 0 ? (
                      <ActionForm action={reassignAction} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="line_id" value={l.id} />
                        <Field label={`Cambiar especialista · ${one(l.services)?.name ?? ""}`} className="min-w-48 flex-1">
                          <select name="staff_id" required defaultValue="" className={inputClass}>
                            <option value="">Selecciona…</option>
                            {options.map((o) => (
                              <option key={o.staff_id} value={o.staff_id}>
                                {one(o.staff_members)?.display_name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <SubmitButton variant="secondary">Cambiar</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Materiales reservados">
            {reservations.length === 0 ? (
              <p className="text-sm text-muted">
                {a.materials_status === "missing" ? "Falta material: revisa las alertas operativas para conseguirlo." : "Sin materiales reservados."}
              </p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {reservations.map((r) => {
                  const v = one(r.product_variants);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <ToneDot tone={v?.tone} />
                        {v?.name ?? "Variante"} <span className="text-xs text-muted">{v?.sku}</span>
                      </span>
                      <span className="tabular-nums">
                        {Number(r.quantity)} · {RES_STATUS[r.status] ?? r.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {canAttend && confirmed && (att === "scheduled" || att === "arrived") ? (
            <Card title="Asistencia">
              <div className="flex flex-wrap gap-2">
                {att === "scheduled" ? <AttendanceButton id={a.id} status="arrived" label="Llegó" variant="primary" /> : null}
                {att === "scheduled" || att === "arrived" ? (
                  <AttendanceButton id={a.id} status="in_service" label="En servicio" variant={att === "arrived" ? "primary" : "secondary"} />
                ) : null}
                {att === "scheduled" || att === "arrived" ? (
                  <AttendanceButton id={a.id} status="no_show" label="No asistió" variant="danger" confirm="¿Marcar que la clienta no asistió? Se libera el resto del horario." />
                ) : null}
              </div>
            </Card>
          ) : null}

          {canAttend && confirmed && !finished ? (
            <Card title="Completar servicio">
              <KeepValuesForm action={completeAppointmentAction} className="space-y-3">
                <input type="hidden" name="appointment_id" value={a.id} />
                {activeReservations.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted">Cantidad REAL usada (lo no usado se libera al inventario):</p>
                    {activeReservations.map((r) => {
                      const v = one(r.product_variants);
                      return (
                        <Field key={r.id} label={`Usado · ${v?.name ?? "material"}`} hint={`Reservado: ${Number(r.quantity)}`}>
                          <input name={`actual_${r.id}`} type="number" min="0" step="any" required defaultValue={Number(r.quantity)} className={inputClass} />
                        </Field>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No hay materiales reservados.</p>
                )}
                <details className="rounded-brand border border-line p-2">
                  <summary className="cursor-pointer text-sm">Consumo adicional (opcional)</summary>
                  <div className="mt-2 space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem]">
                        <Field label={`Producto adicional ${i + 1}`}>
                          <select name={`extra_variant_${i}`} defaultValue="" className={inputClass}>
                            <option value="">—</option>
                            {(variants.data ?? []).map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} · {v.sku}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={`Cantidad adicional ${i + 1}`}>
                          <input name={`extra_qty_${i}`} type="number" min="0" step="any" className={inputClass} />
                        </Field>
                      </div>
                    ))}
                  </div>
                </details>
                <SubmitButton confirm="¿Completar la cita? Se descontará el material del inventario.">Completar</SubmitButton>
              </KeepValuesForm>
            </Card>
          ) : null}

          {isFront && active && att === "scheduled" ? (
            <Card title="Reprogramar">
              <form method="get" className="flex flex-wrap items-end gap-2">
                <Field label="Nueva fecha" className="min-w-40">
                  <input type="date" name="reprogramar" defaultValue={isIsoDate(sp.reprogramar) ? sp.reprogramar : localDate} required className={inputClass} />
                </Field>
                <button className={secondaryButtonClass}>Ver horarios</button>
              </form>
              {reschedule ? (
                <KeepValuesForm action={rescheduleAction} className="mt-3">
                  <input type="hidden" name="appointment_id" value={a.id} />
                  {reschedule.error ? <ErrorNotice message={reschedule.error} /> : null}
                  {reschedule.slots.length === 0 ? (
                    <EmptyState title="Sin horarios ese día" description="Prueba otra fecha." />
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Horarios para reprogramar">
                      {reschedule.slots.map((slot) => (
                        <button
                          key={slot.start}
                          type="submit"
                          name="slot"
                          value={JSON.stringify(
                            slot.assignments.map((x) => ({
                              service_id: x.serviceId,
                              staff_id: x.staffId,
                              resource_ids: x.resourceIds,
                              starts_at: new Date(x.start).toISOString(),
                            })),
                          )}
                          className="rounded-xl border border-line bg-surface p-2.5 text-left text-sm transition hover:border-fg"
                        >
                          <span className="block font-medium tabular-nums">Mover a {hour(slot.start)}</span>
                          <span className="block truncate text-xs text-muted">
                            {[...new Set(slot.assignments.map((x) => (x.staffId ? names.get(x.staffId) : null)).filter(Boolean))].join(" + ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </KeepValuesForm>
              ) : null}
            </Card>
          ) : null}

          {isFront && active && att !== "in_service" && att !== "completed" ? (
            <Card title="Cancelar cita">
              <KeepValuesForm action={cancelAppointmentAction} className="space-y-2">
                <input type="hidden" name="appointment_id" value={a.id} />
                <Field label="Motivo de cancelación">
                  <input name="reason" required minLength={3} maxLength={500} className={inputClass} placeholder="p. ej. la clienta pidió cancelar" />
                </Field>
                <SubmitButton variant="danger" confirm="¿Cancelar la cita? Se liberan el horario y los materiales reservados.">
                  Cancelar cita
                </SubmitButton>
              </KeepValuesForm>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card title="Clienta">
            <p className="text-sm font-medium">{clientName(client)}</p>
            {client?.phone ? <p className="text-sm text-muted">{formatPhone(client.phone)}</p> : null}
            <p className="mt-2 text-xs text-muted">Origen: {SOURCE[a.source] ?? a.source}</p>
            {a.cancel_reason ? <p className="mt-2 text-sm">Motivo de cancelación: {a.cancel_reason === "rescheduled" ? "reprogramada" : a.cancel_reason}</p> : null}
            {a.rescheduled_from ? (
              <p className="mt-2 text-sm">
                <Link className="underline" href={`/agenda/cita/${a.rescheduled_from}`}>
                  Ver cita original
                </Link>
              </p>
            ) : null}
          </Card>

          {seesMoney ? (
            <Card title="Anticipos">
              <p className="text-sm">
                Requerido: <span className="tabular-nums">{mxn(a.deposit_required_cents)}</span>
                {a.deposit_required_cents > 0 ? (
                  <>
                    {" "}
                    · Pendiente: <span className="tabular-nums">{mxn(pendingDeposit)}</span>
                  </>
                ) : null}
              </p>
              {(deposits ?? []).length > 0 ? (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {deposits!.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2 py-1">
                      <span>
                        {DEPOSIT_METHOD[d.method] ?? d.method} · {DEPOSIT_STATUS[d.status] ?? d.status}
                      </span>
                      <span className="tabular-nums">{mxn(d.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {isFront && a.booking_status !== "cancelled" ? (
                <KeepValuesForm action={recordDepositAction} className="mt-3 space-y-2" resetOnSuccess>
                  <input type="hidden" name="appointment_id" value={a.id} />
                  <Field label="Importe del anticipo (MXN)">
                    <input name="amount" inputMode="decimal" required defaultValue={pendingDeposit ? (pendingDeposit / 100).toFixed(2) : ""} className={inputClass} />
                  </Field>
                  <Field label="Método">
                    <select name="method" defaultValue="cash" className={inputClass}>
                      <option value="cash">Efectivo</option>
                      <option value="card">Tarjeta (terminal)</option>
                      <option value="transfer">Transferencia</option>
                    </select>
                  </Field>
                  <Field label="Referencia" hint="Folio de la terminal o de la transferencia. Evita registrar dos veces el mismo pago.">
                    <input name="reference" maxLength={120} className={inputClass} />
                  </Field>
                  <SubmitButton variant="secondary">Registrar anticipo</SubmitButton>
                </KeepValuesForm>
              ) : null}
            </Card>
          ) : null}

          <Card title="Notas">
            {isFront ? (
              <KeepValuesForm action={updateNotesAction} className="space-y-2">
                <input type="hidden" name="appointment_id" value={a.id} />
                <label className="sr-only" htmlFor="notes">
                  Notas de la cita
                </label>
                <textarea id="notes" name="notes" rows={4} maxLength={1000} defaultValue={a.notes ?? ""} className={`${inputClass} py-2`} />
                <SubmitButton variant="secondary">Guardar notas</SubmitButton>
              </KeepValuesForm>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{a.notes || "Sin notas."}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function durationLabel(ms: number): string {
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

function AttendanceButton({
  id,
  status,
  label,
  variant = "secondary",
  confirm,
}: {
  id: string;
  status: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  confirm?: string;
}) {
  return (
    <ActionForm action={setAttendanceAction}>
      <input type="hidden" name="appointment_id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant} confirm={confirm}>
        {label}
      </SubmitButton>
    </ActionForm>
  );
}
