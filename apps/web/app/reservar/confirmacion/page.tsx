import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, ErrorNotice, secondaryButtonClass } from "@/components/ui";
import { hour, mxn, TZ } from "@/lib/format";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Reserva recibida" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fullDate = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

/**
 * Confirmación pública. Solo muestra citas creadas en línea y NUNCA datos de la clienta
 * (nombre, teléfono, correo): el enlace podría compartirse.
 */
export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  if (!id || !UUID.test(id) || !hasAdminKey()) return <NotFound />;
  const { data: a } = await createAdminClient()
    .from("appointments")
    .select("id, booking_status, starts_at, hold_expires_at, deposit_required_cents, payment_status, appointment_services(position, services(name), staff_members(display_name)), locations(name, address, phone)")
    .eq("id", id)
    .eq("source", "online")
    .maybeSingle();
  if (!a) return <NotFound />;

  type Line = { position: number; services: { name: string } | null; staff_members: { display_name: string } | null };
  const lines = ((a.appointment_services ?? []) as unknown as Line[]).sort((x, y) => x.position - y.position);
  const loc = (Array.isArray(a.locations) ? a.locations[0] : a.locations) as { name: string; address: string | null; phone: string | null } | null;
  const isHold = a.booking_status === "hold";
  const holdActive = isHold && a.hold_expires_at && Date.parse(a.hold_expires_at) > Date.now();

  return (
    <>
      <h1 className="mb-4 text-3xl">
        {a.booking_status === "confirmed" ? "¡Tu cita está confirmada!" : isHold ? "Recibimos tu solicitud" : "Estado de tu reserva"}
      </h1>

      {isHold && a.deposit_required_cents > 0 ? (
        <div role="status" className="mb-4 rounded-brand border border-warning/40 bg-warning/10 p-4 text-sm" data-testid="pago-pendiente">
          <p className="font-medium">
            Apartado provisional hasta las {hour(a.hold_expires_at!)}: el pago en línea del anticipo aún no está habilitado; el salón te contactará para
            confirmarlo.
          </p>
          <p className="mt-1">
            Anticipo requerido: {mxn(a.deposit_required_cents)}. Tu cita no está confirmada hasta recibirlo.
            {holdActive ? "" : " El apartado ya venció; si no te hemos contactado, llámanos para reagendar."}
          </p>
        </div>
      ) : null}
      {a.booking_status === "expired" || a.booking_status === "cancelled" ? (
        <div className="mb-4">
          <ErrorNotice message={a.booking_status === "expired" ? "El apartado venció sin confirmarse." : "Esta cita fue cancelada."} />
        </div>
      ) : null}

      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Servicio</dt>
            <dd className="font-medium">{lines.map((l) => l.services?.name).filter(Boolean).join(", ")}</dd>
          </div>
          <div>
            <dt className="text-muted">Especialista</dt>
            <dd>{lines.map((l) => l.staff_members?.display_name).filter(Boolean).join(", ") || "Por asignar"}</dd>
          </div>
          <div>
            <dt className="text-muted">Fecha</dt>
            <dd className="first-letter:uppercase">{fullDate(a.starts_at)}</dd>
          </div>
          <div>
            <dt className="text-muted">Hora</dt>
            <dd className="tabular-nums">{hour(a.starts_at)} (hora del centro de México)</dd>
          </div>
          <div>
            <dt className="text-muted">Estado</dt>
            <dd>
              {a.booking_status === "confirmed" ? (
                <Badge tone="success">Confirmada</Badge>
              ) : isHold ? (
                <Badge tone="warning">Pago pendiente</Badge>
              ) : (
                <Badge tone="danger">{a.booking_status === "expired" ? "Vencida" : "Cancelada"}</Badge>
              )}
            </dd>
          </div>
          {loc ? (
            <div>
              <dt className="text-muted">Lugar</dt>
              <dd>
                {loc.name}
                {loc.address ? <span className="block text-muted">{loc.address}</span> : null}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>
      <p className="mt-4 text-sm text-muted">
        Guarda esta página. Si necesitas cambiar o cancelar tu cita, contáctanos{loc?.phone ? ` al ${loc.phone}` : ""} con anticipación.
      </p>
      <Link href="/reservar" className={`${secondaryButtonClass} mt-4`}>
        Hacer otra reserva
      </Link>
    </>
  );
}

function NotFound() {
  return (
    <div className="space-y-4">
      <ErrorNotice message="No encontramos esa reserva. Revisa el enlace o vuelve a intentarlo." />
      <Link href="/reservar" className={secondaryButtonClass}>
        Ir a reservas
      </Link>
    </div>
  );
}
