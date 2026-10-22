import type { Metadata } from "next";
import Link from "next/link";
import { formatPhone } from "../../clientes/_lib/crm";
import { redirect } from "next/navigation";
import { KeepValuesForm } from "../_components/keep-values-form";
import { buttonClass, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader, slotButtonClass, StepIndicator } from "@/components/ui";
import { loadSlots } from "@/lib/availability";
import { hour, isIsoDate, longDate, mxn, todayLocal } from "@/lib/format";
import { currentLocationId } from "@/lib/location";
import { can, requireStaff } from "@/lib/staff";
import { one } from "../_lib/status";
import { createAppointmentAction } from "./actions";

export const metadata: Metadata = { title: "Nueva cita" };

type SP = { date?: string; service?: string; service2?: string; service3?: string; client?: string; staff?: string; error?: string };

type Service = {
  id: string;
  name: string;
  price_cents: number;
  price_is_from: boolean;
  duration_min: number;
  requires_consultation: boolean;
  deposit_type: string;
  technique: string | null;
  service_materials: { material_role: string; quantity: number; is_variable: boolean }[] | null;
};

type HairVariant = {
  id: string;
  name: string;
  tone: string | null;
  length_cm: number | null;
  products: { name: string; kind: string; technique: string | null } | { name: string; kind: string; technique: string | null }[] | null;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) redirect("/agenda");
  const sp = await searchParams;
  const date = isIsoDate(first(sp.date)) ? first(sp.date) : todayLocal();
  const locationId = await currentLocationId(supabase, staff);

  const [{ data: servicesData, error: svcError }, { data: clients }, { data: people }, { data: settings }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, price_cents, price_is_from, duration_min, requires_consultation, deposit_type, technique, service_materials(material_role, quantity, is_variable)")
      .eq("is_active", true)
      .order("name"),
    supabase.from("clients").select("id, first_name, last_name, phone").eq("is_anonymized", false).order("first_name").limit(300),
    supabase.from("staff_members").select("id, display_name").eq("is_bookable", true).eq("is_active", true).order("display_name"),
    supabase.from("business_settings").select("booking_policy").eq("id", 1).maybeSingle(),
  ]);
  const services = (servicesData ?? []) as unknown as Service[];
  const names = new Map((people ?? []).map((p) => [p.id, p.display_name as string]));
  const selected = [first(sp.service), first(sp.service2), first(sp.service3)]
    .filter(Boolean)
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is Service => Boolean(s));
  const clientId = first(sp.client);
  const ready = Boolean(selected.length && clientId && locationId);
  const result = ready
    ? await loadSlots(supabase, { locationId: locationId!, serviceIds: selected.map((s) => s.id), date, preferredStaffId: first(sp.staff) || undefined })
    : null;

  // Material variable de cabello (tono) por servicio.
  const needsHair = selected.map((s) => (s.service_materials ?? []).find((m) => m.is_variable && m.material_role === "hair") ?? null);
  let hairVariants: (HairVariant & { available: number })[] = [];
  if (needsHair.some(Boolean)) {
    const [{ data: variants }, { data: stock }] = await Promise.all([
      supabase
        .from("product_variants")
        .select("id, name, tone, length_cm, products!inner(name, kind, technique)")
        .eq("is_active", true)
        .eq("products.kind", "hair_extension")
        .order("name"),
      supabase.from("v_stock_availability").select("variant_id, available").eq("location_id", locationId!).eq("kind", "hair_extension"),
    ]);
    const avail = new Map((stock ?? []).map((s) => [s.variant_id as string, Number(s.available)]));
    hairVariants = ((variants ?? []) as unknown as HairVariant[]).map((v) => ({ ...v, available: avail.get(v.id) ?? 0 }));
  }
  const depositRequired = selected.some((s) => s.deposit_type !== "none");
  const holdMinutes = Number((settings?.booking_policy as { hold_minutes?: number } | null)?.hold_minutes ?? 15);
  const totalMin = selected.reduce((t, s) => t + s.duration_min, 0);

  const serviceSelect = (name: keyof SP, label: string, required: boolean, value: string) => (
    <Field label={label} className="md:col-span-2">
      <select name={name} defaultValue={value} required={required} className={inputClass}>
        <option value="">{required ? "Selecciona…" : "Ninguno"}</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.duration_min} min · {s.price_is_from ? "desde " : ""}
            {mxn(s.price_cents)}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <>
      <PageHeader
        back={{ href: `/agenda?date=${date}`, label: "Agenda" }}
        title="Nueva cita"
        subtitle={longDate(date)}
        actions={<StepIndicator steps={["Clienta y servicio", "Horario"]} current={result?.slots.length ? 2 : 1} />}
      />
      {sp.error ? (
        <div className="mb-4">
          <ErrorNotice message={first(sp.error)} />
        </div>
      ) : null}
      {svcError ? (
        <div className="mb-4">
          <ErrorNotice message="No se pudo cargar el catálogo de servicios." />
        </div>
      ) : null}
      <Card>
        <form className="grid gap-3 md:grid-cols-6" method="get">
          <Field label="Clienta" className="md:col-span-3">
            <select name="client" defaultValue={clientId} required className={inputClass}>
              <option value="">Selecciona…</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name ?? ""} {c.phone ? `· ${formatPhone(c.phone)}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha" className="md:col-span-1">
            <input type="date" name="date" defaultValue={date} className={inputClass} />
          </Field>
          <Field label="Especialista (opcional)" className="md:col-span-2">
            <select name="staff" defaultValue={first(sp.staff)} className={inputClass}>
              <option value="">Cualquiera disponible</option>
              {(people ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </Field>
          {serviceSelect("service", "Servicio", true, first(sp.service))}
          {serviceSelect("service2", "Seguido de (opcional)", false, first(sp.service2))}
          {serviceSelect("service3", "Y después (opcional)", false, first(sp.service3))}
          <div className="flex items-end md:col-span-6">
            <button className={buttonClass}>Buscar horarios</button>
          </div>
        </form>
      </Card>

      {selected.some((s) => s.requires_consultation) ? (
        <p className="mt-4 text-sm text-warning">Incluye un servicio que requiere valoración previa: el precio final se confirma tras la consulta.</p>
      ) : null}
      {selected.length > 1 ? (
        <p className="mt-2 text-sm text-muted">
          Visita de {selected.length} servicios consecutivos · {totalMin} min en total.
        </p>
      ) : null}

      {result ? (
        <KeepValuesForm action={createAppointmentAction} className="mt-6 space-y-4" messagesOnTop>
          <input type="hidden" name="location_id" value={locationId!} />
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="service_ids" value={selected.map((s) => s.id).join(",")} />
          <input type="hidden" name="idempotency_key" value={crypto.randomUUID()} />

          <Card title="Detalles de la cita">
              <div className="grid gap-3 md:grid-cols-2">
                {selected.map((s, i) => {
                  const hair = needsHair[i];
                  if (!hair) return null;
                  const techniqueOk = (v: HairVariant) => {
                    const p = one(v.products);
                    return !s.technique || !p?.technique || p.technique === s.technique;
                  };
                  const options = hairVariants.filter(techniqueOk);
                  return (
                    <div key={`${s.id}-${i}`} className="grid gap-2 rounded-xl border border-line p-3.5 sm:grid-cols-[1fr_8rem] md:col-span-2">
                      <Field label={`Tono de cabello · ${s.name}`} hint="Se reserva del inventario al crear la cita.">
                        <select name={`mat_${i}_variant`} defaultValue="" className={inputClass}>
                          <option value="">Sin reservar tono (definir en valoración)</option>
                          {options.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                              {v.tone && !v.name.includes(v.tone) ? ` · tono ${v.tone}` : ""} · disponible {v.available}
                              {v.available < Number(hair.quantity) ? " (insuficiente)" : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Cantidad a reservar">
                        <input name={`mat_${i}_qty`} type="number" min="0.001" step="any" defaultValue={Number(hair.quantity)} className={inputClass} />
                      </Field>
                    </div>
                  );
                })}
                {depositRequired ? (
                  <label className="flex items-start gap-2 text-sm md:col-span-2">
                    <input type="checkbox" name="hold" value="1" className="mt-1" />
                    <span>
                      Apartado provisional: el horario se retiene {holdMinutes} min mientras se registra el anticipo; si no llega, se libera solo.
                    </span>
                  </label>
                ) : null}
                <label className="flex items-start gap-2 text-sm md:col-span-2">
                  <input type="checkbox" name="allow_missing" value="1" className="mt-1" />
                  <span>
                    Crear aunque falte material.{" "}
                    <span className="text-warning">La cita quedará marcada con «Material faltante» y se generará una alerta para conseguirlo.</span>
                  </span>
                </label>
                <Field label="Notas" className="md:col-span-2">
                  <textarea name="notes" rows={2} maxLength={1000} className={`${inputClass} py-2`} placeholder="Indicaciones para el equipo (opcional)" />
                </Field>
              </div>
            </Card>

          {result.error ? <ErrorNotice message={result.error} /> : null}
          {result.slots.length === 0 ? (
            <EmptyState title="Sin horarios disponibles" description="Prueba otra fecha, otra especialista o menos servicios." />
          ) : (
            <div>
              <p className="eyebrow mb-3">Elige un horario para crear la cita</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {result.slots.map((slot) => {
                  const items = slot.assignments.map((a) => ({
                    service_id: a.serviceId,
                    staff_id: a.staffId,
                    resource_ids: a.resourceIds,
                    starts_at: new Date(a.start).toISOString(),
                  }));
                  const staffNames = [...new Set(slot.assignments.map((a) => (a.staffId ? names.get(a.staffId) : null)).filter(Boolean))].join(" + ");
                  return (
                    <button
                      key={slot.start}
                      type="submit"
                      name="slot"
                      value={JSON.stringify(items)}
                      className={`group ${slotButtonClass}`}
                    >
                      <span className="block font-medium tabular-nums">{hour(slot.start)}</span>
                      <span className="block truncate text-xs text-muted group-hover:text-accent-fg/80">{staffNames}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </KeepValuesForm>
      ) : null}
    </>
  );
}
