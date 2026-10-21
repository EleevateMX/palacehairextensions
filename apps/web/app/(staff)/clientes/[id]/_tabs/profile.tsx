import { SubmitButton } from "@/components/forms";
import { Card, Field, inputClass } from "@/components/ui";
import { can } from "@/lib/staff";
import { loadQuoteConfig } from "../../../cotizador/_lib/quote-config";
import { CHANNELS, channelLabel, dateMx, formatPhone } from "../../_lib/crm";
import { KeepValuesForm } from "../../_lib/keep-values-form";
import { updateProfileAction } from "../../actions";
import type { TabProps } from "./types";

export async function ProfileTab({ supabase, staff, client }: TabProps) {
  const [{ data: people }, settings] = await Promise.all([
    supabase.from("staff_members").select("id, display_name, is_bookable").eq("is_active", true).order("display_name"),
    loadQuoteConfig(supabase),
  ]);
  const techniques = Object.entries(settings.config?.techniques ?? {});
  const editable = can(staff, "owner", "admin", "receptionist", "sales") && !client.is_anonymized;
  const staffName = (id: string | null) => people?.find((p) => p.id === id)?.display_name ?? "Sin preferencia";
  const techLabel = (k: string | null) => (k ? (settings.config?.techniques[k]?.label ?? k) : "—");

  if (!editable) {
    const rows: [string, string][] = [
      ["Teléfono", formatPhone(client.phone)],
      ["Correo", client.email ?? "—"],
      ["Nacimiento", dateMx(client.birth_date)],
      ["Canal", channelLabel(client.acquisition_channel)],
      ["Especialista preferida", staffName(client.preferred_staff_id)],
      ["Tono", client.hair_tone ?? "—"],
      ["Técnica", techLabel(client.extension_technique)],
      ["Largo", client.extension_length_cm ? `${Number(client.extension_length_cm)} cm` : "—"],
      ["Preferencias de estilo", client.style_preferences ?? "—"],
      ["Notas de mantenimiento", client.maintenance_notes ?? "—"],
      ["Próxima visita sugerida", dateMx(client.next_visit_suggested)],
    ];
    return (
      <Card>
        {client.is_anonymized ? <p className="mb-3 text-sm text-warning">Expediente anonimizado: no se puede editar.</p> : null}
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="whitespace-pre-wrap">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    );
  }

  return (
    <KeepValuesForm action={updateProfileAction} className="space-y-4">
      <input type="hidden" name="client_id" value={client.id} />
      <Card title="Datos comerciales">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input name="first_name" required maxLength={80} defaultValue={client.first_name} className={inputClass} />
          </Field>
          <Field label="Apellidos">
            <input name="last_name" maxLength={80} defaultValue={client.last_name ?? ""} className={inputClass} />
          </Field>
          <Field label="Teléfono" hint="10 dígitos (+52) o formato internacional">
            <input name="phone" type="tel" inputMode="tel" defaultValue={client.phone ?? ""} className={inputClass} />
          </Field>
          <Field label="Correo">
            <input name="email" type="email" defaultValue={client.email ?? ""} className={inputClass} />
          </Field>
          <Field label="Fecha de nacimiento">
            <input name="birth_date" type="date" defaultValue={client.birth_date ?? ""} className={inputClass} />
          </Field>
          <Field label="¿Cómo nos conoció?">
            <select name="acquisition_channel" defaultValue={client.acquisition_channel ?? ""} className={inputClass}>
              <option value="">Sin especificar</option>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              {client.acquisition_channel && !CHANNELS.some((c) => c.value === client.acquisition_channel) ? (
                <option value={client.acquisition_channel}>{client.acquisition_channel}</option>
              ) : null}
            </select>
          </Field>
          <Field label="Especialista preferida">
            <select name="preferred_staff_id" defaultValue={client.preferred_staff_id ?? ""} className={inputClass}>
              <option value="">Sin preferencia</option>
              {(people ?? [])
                .filter((p) => p.is_bookable || p.id === client.preferred_staff_id)
                .map((p) => (
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
            <input name="hair_tone" defaultValue={client.hair_tone ?? ""} className={inputClass} />
          </Field>
          <Field label="Técnica de extensiones">
            <select name="extension_technique" defaultValue={client.extension_technique ?? ""} className={inputClass}>
              <option value="">Sin extensiones / por definir</option>
              {techniques.map(([key, t]) => (
                <option key={key} value={key}>
                  {t.label}
                </option>
              ))}
              {client.extension_technique && !techniques.some(([k]) => k === client.extension_technique) ? (
                <option value={client.extension_technique}>{client.extension_technique}</option>
              ) : null}
            </select>
          </Field>
          <Field label="Largo (cm)">
            <input
              name="extension_length_cm"
              type="number"
              min={1}
              max={150}
              step="0.5"
              inputMode="decimal"
              defaultValue={client.extension_length_cm != null ? String(Number(client.extension_length_cm)) : ""}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Preferencias de estilo">
            <textarea name="style_preferences" rows={3} maxLength={2000} defaultValue={client.style_preferences ?? ""} className={`${inputClass} py-2`} />
          </Field>
          <Field label="Notas de mantenimiento">
            <textarea name="maintenance_notes" rows={3} maxLength={2000} defaultValue={client.maintenance_notes ?? ""} className={`${inputClass} py-2`} />
          </Field>
          <Field label="Próxima visita sugerida">
            <input name="next_visit_suggested" type="date" defaultValue={client.next_visit_suggested ?? ""} className={inputClass} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted">
          No anotes aquí datos de salud (alergias, padecimientos del cuero cabelludo): usa una nota sensible, visible solo para propietaria y
          administración.
        </p>
      </Card>
      <SubmitButton>Guardar perfil</SubmitButton>
    </KeepValuesForm>
  );
}
