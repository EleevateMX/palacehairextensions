import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, inputClass } from "@/components/ui";
import { can } from "@/lib/staff";
import { anonymizeClientAction } from "../../actions";
import type { TabProps } from "./types";

export async function PrivacyTab({ staff, client }: TabProps) {
  if (!can(staff, "owner", "admin")) {
    return <p className="text-sm text-muted">Solo propietaria o administración atienden solicitudes de privacidad.</p>;
  }
  return (
    <div className="space-y-4">
      <Card title="Derechos ARCO">
        <div className="space-y-2 text-sm">
          <p>
            La clienta puede pedir <strong>Acceso</strong>, <strong>Rectificación</strong>, <strong>Cancelación</strong> u{" "}
            <strong>Oposición</strong> sobre sus datos personales (LFPDPPP). Registra la fecha de la solicitud y responde dentro del plazo legal.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Acceso: entrega una copia de su expediente (perfil, consentimientos e historial).</li>
            <li>Rectificación: corrige los datos en la pestaña Perfil.</li>
            <li>Oposición a finalidades: revoca el consentimiento correspondiente en Consentimientos.</li>
            <li>Cancelación: anonimiza el expediente (abajo).</li>
          </ul>
          <p className="text-xs text-muted">Plazos y texto del aviso de privacidad pendientes de validar con asesoría legal.</p>
        </div>
      </Card>
      <Card title="Anonimizar expediente">
        {client.is_anonymized ? (
          <p className="text-sm">Este expediente ya fue anonimizado.</p>
        ) : (
          <ActionForm action={anonymizeClientAction} className="space-y-3">
            <input type="hidden" name="client_id" value={client.id} />
            <p className="text-sm">
              Se borran de forma <strong>irreversible</strong> nombre, teléfono, correo, nacimiento, tono, preferencias, notas y fotos. Se
              conservan citas y ventas sin datos personales por obligaciones contables. Los archivos de fotos en Storage se eliminarán con la
              tarea de mantenimiento cuando esté habilitada.
            </p>
            <Field label="Escribe ANONIMIZAR para confirmar">
              <input name="confirmation" required autoComplete="off" pattern="ANONIMIZAR" className={`${inputClass} max-w-xs`} />
            </Field>
            <SubmitButton variant="danger" confirm="Esta acción no se puede deshacer. ¿Anonimizar a la clienta?">
              Anonimizar clienta
            </SubmitButton>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
