import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { ConfigTabs } from "./_components/config-tabs";
import { Forbidden, requireManager } from "./_lib/guard";
import { saveBusinessSettings, saveLocationInfo } from "./actions";
import { currentLocationId } from "@/lib/location";

export const metadata: Metadata = { title: "Configuración" };

type BookingPolicy = { hold_minutes?: number; min_lead_minutes?: number; max_advance_days?: number; slot_step_minutes?: number };

export default async function BusinessSettingsPage() {
  const { supabase, staff, allowed } = await requireManager();
  if (!allowed) return <Forbidden title="Configuración" />;
  const locationId = await currentLocationId(supabase, staff);
  const [{ data, error }, { data: location }] = await Promise.all([
    supabase.from("business_settings").select("display_name, legal_name, rfc, booking_policy, cancellation_policy, facebook_url").eq("id", 1).maybeSingle(),
    locationId
      ? supabase.from("locations").select("id, name, address, phone, maps_url, map_query").eq("id", locationId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const bp = (data?.booking_policy ?? {}) as BookingPolicy;
  const cp = (data?.cancellation_policy ?? {}) as { free_until_hours?: number };

  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos del negocio y políticas de reserva" />
      <ConfigTabs current="/configuracion" />
      {error || !data ? (
        <ErrorNotice message="No se pudo cargar la configuración del negocio." />
      ) : (
        <ActionForm action={saveBusinessSettings} className="space-y-4">
          <Card title="Negocio">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre comercial" className="sm:col-span-2">
                <input name="display_name" required defaultValue={data.display_name} className={inputClass} />
              </Field>
              <Field label="Razón social (opcional)">
                <input name="legal_name" defaultValue={data.legal_name ?? ""} className={inputClass} />
              </Field>
              <Field label="RFC (opcional)">
                <input name="rfc" defaultValue={data.rfc ?? ""} maxLength={13} className={inputClass} />
              </Field>
            </div>
          </Card>
          <Card title="Política de reservas">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Minutos de apartado" hint="Tiempo que se guarda un horario mientras llega el anticipo.">
                <input name="hold_minutes" inputMode="numeric" defaultValue={bp.hold_minutes ?? 15} className={inputClass} />
              </Field>
              <Field label="Anticipación mínima (minutos)" hint="Para reservas en línea.">
                <input name="min_lead_minutes" inputMode="numeric" defaultValue={bp.min_lead_minutes ?? 120} className={inputClass} />
              </Field>
              <Field label="Intervalo de horarios (minutos)" hint="Cada cuánto se ofrecen horarios (p. ej. 15).">
                <input name="slot_step_minutes" inputMode="numeric" defaultValue={bp.slot_step_minutes ?? 15} className={inputClass} />
              </Field>
              <Field label="Días máximos de anticipación">
                <input name="max_advance_days" inputMode="numeric" defaultValue={bp.max_advance_days ?? 90} className={inputClass} />
              </Field>
            </div>
          </Card>
          <Card title="Política de cancelación">
            <Field label="Cancelación sin costo hasta (horas antes)" hint="Cada servicio puede definir sus propias horas.">
              <input name="free_until_hours" inputMode="numeric" defaultValue={cp.free_until_hours ?? 24} className={`${inputClass} max-w-40`} />
            </Field>
          </Card>
          <SubmitButton>Guardar configuración</SubmitButton>
        </ActionForm>
      )}
      {data && location ? (
        <ActionForm action={saveLocationInfo} className="mt-6 space-y-4">
          <input type="hidden" name="location_id" value={location.id} />
          <Card title="Ubicación y redes">
            <p className="mb-4 text-sm text-muted">Se muestran en el portal de reservas: mapa, botón «Cómo llegar» y enlace a Facebook.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre de la sucursal" className="sm:col-span-2" hint="Aparece en el portal debajo de «Reserva tu cita».">
                <input name="location_name" required minLength={2} maxLength={120} defaultValue={location.name} className={inputClass} />
              </Field>
              <Field label="Dirección" className="sm:col-span-2" hint="Calle, número, colonia y ciudad, tal como la quieres mostrar.">
                <input name="address" maxLength={300} defaultValue={location.address ?? ""} className={inputClass} />
              </Field>
              <Field label="Teléfono del salón">
                <input name="phone" type="tel" maxLength={30} defaultValue={location.phone ?? ""} className={inputClass} />
              </Field>
              <Field label="Página de Facebook">
                <input name="facebook_url" type="url" maxLength={500} defaultValue={data.facebook_url ?? ""} className={inputClass} placeholder="https://www.facebook.com/…" />
              </Field>
              <Field label="Enlace de Google Maps" hint="El enlace de «Compartir» de Google Maps. Lo usa el botón «Cómo llegar».">
                <input name="maps_url" type="url" maxLength={500} defaultValue={location.maps_url ?? ""} className={inputClass} placeholder="https://maps.app.goo.gl/…" />
              </Field>
              <Field label="Texto para el mapa" hint="Lo que se busca en el mapa del portal: nombre del salón y ciudad, o la dirección.">
                <input name="map_query" maxLength={200} defaultValue={location.map_query ?? ""} className={inputClass} />
              </Field>
            </div>
          </Card>
          <SubmitButton>Guardar ubicación</SubmitButton>
        </ActionForm>
      ) : null}
    </>
  );
}
