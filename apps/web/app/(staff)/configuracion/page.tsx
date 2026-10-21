import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { ConfigTabs } from "./_components/config-tabs";
import { Forbidden, requireManager } from "./_lib/guard";
import { saveBusinessSettings } from "./actions";

export const metadata: Metadata = { title: "Configuración" };

type BookingPolicy = { hold_minutes?: number; min_lead_minutes?: number; max_advance_days?: number; slot_step_minutes?: number };

export default async function BusinessSettingsPage() {
  const { supabase, allowed } = await requireManager();
  if (!allowed) return <Forbidden title="Configuración" />;
  const { data, error } = await supabase
    .from("business_settings")
    .select("display_name, legal_name, rfc, booking_policy, cancellation_policy")
    .eq("id", 1)
    .maybeSingle();
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
    </>
  );
}
