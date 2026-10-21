import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/forms";
import { Card, Field, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";
import { can, requireStaff } from "@/lib/staff";
import { loadQuoteConfig } from "../../cotizador/_lib/quote-config";
import { CHANNELS, CONSENT_LABEL } from "../_lib/crm";
import { KeepValuesForm } from "../_lib/keep-values-form";
import { createClientAction } from "../actions";

export const metadata: Metadata = { title: "Nueva clienta" };

const OPTIONAL_CONSENTS = ["appointment_reminders", "marketing_whatsapp", "marketing_email", "photos_internal", "photos_marketing"] as const;

export default async function NewClientPage() {
  const { supabase, staff } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist", "sales")) redirect("/clientes");
  const [{ data: people }, settings] = await Promise.all([
    supabase.from("staff_members").select("id, display_name").eq("is_bookable", true).eq("is_active", true).order("display_name"),
    loadQuoteConfig(supabase),
  ]);
  const techniques = Object.entries(settings.config?.techniques ?? {});

  return (
    <>
      <PageHeader title="Nueva clienta" subtitle="Datos comerciales, perfil capilar y consentimientos" />
      <KeepValuesForm action={createClientAction} className="space-y-4">
        <Card title="Contacto">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <input name="first_name" required maxLength={80} autoComplete="off" className={inputClass} />
            </Field>
            <Field label="Apellidos">
              <input name="last_name" maxLength={80} autoComplete="off" className={inputClass} />
            </Field>
            <Field label="Teléfono" hint="10 dígitos (se guarda como +52…) o formato internacional">
              <input name="phone" type="tel" inputMode="tel" placeholder="999 123 4567" className={inputClass} />
            </Field>
            <Field label="Correo">
              <input name="email" type="email" className={inputClass} />
            </Field>
            <Field label="Fecha de nacimiento" hint="Opcional">
              <input name="birth_date" type="date" className={inputClass} />
            </Field>
            <Field label="¿Cómo nos conoció?">
              <select name="acquisition_channel" defaultValue="" className={inputClass}>
                <option value="">Sin especificar</option>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Especialista preferida">
              <select name="preferred_staff_id" defaultValue="" className={inputClass}>
                <option value="">Sin preferencia</option>
                {(people ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Perfil capilar">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tono">
              <input name="hair_tone" placeholder="p. ej. 4, 613" className={inputClass} />
            </Field>
            <Field label="Técnica de extensiones">
              <select name="extension_technique" defaultValue="" className={inputClass}>
                <option value="">Sin extensiones / por definir</option>
                {techniques.map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Largo (cm)">
              <input name="extension_length_cm" type="number" min={1} max={150} step="0.5" inputMode="decimal" className={inputClass} />
            </Field>
          </div>
        </Card>

        <Card title="Consentimientos">
          <p className="mb-3 text-sm text-muted">
            Lee o entrega a la clienta el aviso de privacidad{settings.privacyVersion ? ` (versión ${settings.privacyVersion})` : ""}. Sin su
            aceptación no se puede registrar. Cada finalidad adicional es opcional y se puede revocar después.
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Finalidades</legend>
            <label className="flex min-h-11 items-start gap-3 rounded-brand border border-line p-3">
              <input type="checkbox" name="consent_privacy_notice" required className="mt-1 size-4" />
              <span>
                <span className="font-medium">{CONSENT_LABEL.privacy_notice} (obligatorio)</span>
                <span className="block text-xs text-muted">Tratamiento de datos para agendar, atender y cobrar.</span>
              </span>
            </label>
            {OPTIONAL_CONSENTS.map((p) => (
              <label key={p} className="flex min-h-11 items-center gap-3 rounded-brand border border-line p-3">
                <input type="checkbox" name={`consent_${p}`} defaultChecked={p === "appointment_reminders"} className="size-4" />
                <span>{CONSENT_LABEL[p]}</span>
              </label>
            ))}
          </fieldset>
        </Card>

        <div className="flex flex-wrap gap-2">
          <SubmitButton>Registrar clienta</SubmitButton>
          <Link href="/clientes" className={secondaryButtonClass}>
            Cancelar
          </Link>
        </div>
      </KeepValuesForm>
    </>
  );
}
