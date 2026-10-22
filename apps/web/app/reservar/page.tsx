import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, ErrorNotice, Field, inputClass } from "@/components/ui";
import { hour, isIsoDate, longDate, mxn } from "@/lib/format";
import { bookableDateRange, type PortalService, portalContext, portalSlots, serviceStaff } from "@/lib/portal";
import { hasAdminKey } from "@/lib/supabase/admin";
import { BookingForm } from "./booking-form";
import { VisitCard } from "./visit-card";

export const metadata: Metadata = { title: "Reserva tu cita" };
export const dynamic = "force-dynamic";

type SP = { servicio?: string; especialista?: string; fecha?: string; hora?: string; asignada?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function priceLabel(s: PortalService) {
  if (s.priceCents === 0) return "Sin costo";
  return `${s.priceIsFrom ? "Desde " : ""}${mxn(s.priceCents)}`;
}

function Steps({ current }: { current: number }) {
  const steps = ["Servicio", "Fecha y hora", "Tus datos"];
  return (
    <ol className="mb-6 flex gap-2 text-xs" aria-label="Pasos">
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? "step" : undefined}
          className={`flex-1 rounded-full px-3 py-1.5 text-center ${i === current ? "bg-accent text-accent-fg" : i < current ? "bg-nude" : "border border-line text-muted"}`}
        >
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}

export default async function BookingPortalPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!hasAdminKey()) return (
      <div className="mx-auto max-w-2xl">
        <ErrorNotice message="Las reservas en línea no están disponibles por el momento. Llámanos o escríbenos por WhatsApp." />
      </div>
    );
  const sp = await searchParams;
  const ctx = await portalContext();
  if (ctx.error || !ctx.location) return (
      <div className="mx-auto max-w-2xl">
        <ErrorNotice message="No pudimos cargar el catálogo. Intenta de nuevo en unos minutos." />
      </div>
    );

  const service = UUID.test(sp.servicio ?? "") ? ctx.services.find((s) => s.id === sp.servicio && s.onlineBookable && !s.requiresConsultation) : undefined;

  // Paso 1: elegir servicio.
  if (!service) {
    const bookable = ctx.services.filter((s) => s.onlineBookable && !s.requiresConsultation);
    const consult = ctx.services.filter((s) => s.requiresConsultation);
    return (
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
       <div>
        <h1 className="mb-1 text-3xl">Reserva tu cita</h1>
        <p className="mb-4 text-sm text-muted">{ctx.location.name}</p>
        <Steps current={0} />
        {sp.servicio ? <div className="mb-4"><ErrorNotice message="Ese servicio no se puede reservar en línea. Elige otro." /></div> : null}
        {bookable.length === 0 && consult.length === 0 ? (
          <EmptyState title="Por ahora no hay servicios con reserva en línea" description="Contáctanos para agendar." />
        ) : null}
        <ul className="space-y-3">
          {bookable.map((s) => (
            <li key={s.id}>
              <Link
                href={`/reservar?servicio=${s.id}`}
                className="block rounded-2xl border border-line bg-surface p-5 transition hover:border-fg"
                data-testid="servicio"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-medium">{s.name}</span>
                  <span className="whitespace-nowrap text-sm tabular-nums">{priceLabel(s)}</span>
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {s.durationMin} min{s.category ? ` · ${s.category}` : ""}
                </span>
                {s.description ? <span className="mt-1 block text-sm">{s.description}</span> : null}
                {s.depositCents > 0 ? <span className="mt-2 block text-xs text-warning">Requiere anticipo de {mxn(s.depositCents)} para confirmar.</span> : null}
              </Link>
            </li>
          ))}
          {consult.map((s) => (
            <li key={s.id} className="rounded-2xl border border-dashed border-line p-5">
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium">{s.name}</span>
                <Badge tone="warning">Requiere valoración</Badge>
              </span>
              <span className="mt-1 block text-sm text-muted">
                {s.priceCents > 0 ? `${priceLabel(s)} · ` : ""}el precio final se confirma después de una valoración con una especialista.
              </span>
              {ctx.consultation ? (
                <Link href={`/reservar?servicio=${ctx.consultation.id}`} className={`${buttonClass} mt-3`}>
                  Reservar {ctx.consultation.name.toLowerCase()}
                </Link>
              ) : (
                <span className="mt-2 block text-sm">Contáctanos para agendar tu valoración.</span>
              )}
            </li>
          ))}
        </ul>
       </div>
        <aside className="mt-8 lg:sticky lg:top-6 lg:mt-0">
          <VisitCard location={ctx.location} facebookUrl={ctx.facebookUrl} displayName={ctx.displayName} />
        </aside>
      </div>
    );
  }

  // Paso 2: especialista (opcional), fecha y horarios.
  const range = bookableDateRange(ctx.policy);
  const date = isIsoDate(sp.fecha) && sp.fecha >= range.min && sp.fecha <= range.max ? sp.fecha : null;
  const staffChoice = UUID.test(sp.especialista ?? "") ? sp.especialista : undefined;
  const staff = await serviceStaff(service.id);
  const result = date ? await portalSlots({ locationId: ctx.location.id, serviceId: service.id, date, staffId: staffChoice, policy: ctx.policy }) : null;
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const chosenStart = sp.hora && !Number.isNaN(Date.parse(sp.hora)) ? Date.parse(sp.hora) : null;
  const chosenSlot = chosenStart !== null ? result?.slots.find((s) => s.start === chosenStart) : undefined;
  const base = new URLSearchParams({ servicio: service.id, ...(staffChoice ? { especialista: staffChoice } : {}), ...(date ? { fecha: date } : {}) });

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/reservar" className="text-sm underline">
        ← Cambiar servicio
      </Link>
      <h1 className="mb-1 mt-2 text-3xl">{service.name}</h1>
      <p className="mb-4 text-sm text-muted">
        {service.durationMin} min · {priceLabel(service)}
        {service.depositCents > 0 ? ` · anticipo ${mxn(service.depositCents)}` : ""}
      </p>
      <Steps current={chosenSlot ? 2 : 1} />

      <Card>
        <form method="get" action="/reservar" className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="servicio" value={service.id} />
          <Field label="Especialista">
            <select name="especialista" defaultValue={staffChoice ?? ""} className={inputClass}>
              <option value="">Cualquiera disponible</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha">
            <input type="date" name="fecha" min={range.min} max={range.max} defaultValue={date ?? ""} required className={inputClass} />
          </Field>
          <div className="flex items-end">
            <button className={`${buttonClass} w-full`}>Ver horarios</button>
          </div>
        </form>
        {sp.fecha && !date ? <p className="mt-2 text-sm text-danger">Elige una fecha entre hoy y {longDate(range.max)}.</p> : null}
        <p className="mt-2 text-xs text-muted">
          Reservas con al menos {Math.round(ctx.policy.minLeadMinutes / 60) || ctx.policy.minLeadMinutes} {ctx.policy.minLeadMinutes >= 60 ? "h" : "min"} de anticipación y
          hasta {ctx.policy.maxAdvanceDays} días.
        </p>
      </Card>

      {result ? (
        <section className="mt-6" aria-labelledby="horarios">
          <h2 id="horarios" className="mb-3 font-display text-xl">
            Horarios para el {longDate(date!)}
          </h2>
          {result.error ? <ErrorNotice message={result.error} /> : null}
          {result.slots.length === 0 ? (
            <EmptyState title="Sin horarios disponibles ese día" description="Prueba otra fecha u otra especialista." />
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {result.slots.map((slot) => {
                const a = slot.assignments[0]!;
                const q = new URLSearchParams(base);
                q.set("hora", new Date(slot.start).toISOString());
                const active = slot.start === chosenStart;
                return (
                  <Link
                    key={slot.start}
                    href={`/reservar?${q}#datos`}
                    aria-current={active ? "true" : undefined}
                    className={`rounded-xl border px-2 py-3 text-center text-sm transition ${active ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface hover:border-fg"}`}
                  >
                    <span className="block font-medium tabular-nums">{hour(slot.start)}</span>
                    {!staffChoice && a.staffId ? <span className="block truncate text-xs opacity-80">{names.get(a.staffId)}</span> : null}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {sp.hora && result && !chosenSlot ? (
        <div className="mt-4">
          <ErrorNotice message="Ese horario ya no está disponible. Elige otro." />
        </div>
      ) : null}

      {chosenSlot ? (
        <section id="datos" className="mt-8" aria-labelledby="tus-datos">
          <h2 id="tus-datos" className="mb-1 font-display text-xl">
            Tus datos
          </h2>
          <p className="mb-3 text-sm text-muted">
            {longDate(date!)} a las {hour(chosenSlot.start)}
            {chosenSlot.assignments[0]?.staffId ? ` con ${names.get(chosenSlot.assignments[0].staffId)}` : ""}
          </p>
          <Card>
            <BookingForm
              hidden={{
                service_id: service.id,
                staff_id: chosenSlot.assignments[0]?.staffId ?? "",
                date: date!,
                starts_at: new Date(chosenSlot.start).toISOString(),
                idempotency_key: crypto.randomUUID(),
              }}
              privacyVersion={ctx.privacyNoticeVersion}
              notice={
                service.depositCents > 0 ? (
                  <p className="rounded-brand border border-warning/40 bg-warning/10 p-3 text-sm">
                    Este servicio requiere un anticipo de {mxn(service.depositCents)}. El pago en línea aún no está habilitado: tu horario quedará apartado de
                    forma provisional por {ctx.policy.holdMinutes} minutos y el salón te contactará para confirmarlo.
                  </p>
                ) : null
              }
            />
          </Card>
        </section>
      ) : null}
    </div>
  );
}
