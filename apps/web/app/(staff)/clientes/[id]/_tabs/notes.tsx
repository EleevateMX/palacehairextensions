import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorNotice, Field, inputClass } from "@/components/ui";
import { can } from "@/lib/staff";
import { dateMx } from "../../_lib/crm";
import { addNoteAction } from "../../actions";
import type { TabProps } from "./types";

export async function NotesTab({ supabase, staff, client }: TabProps) {
  // RLS: las notas sensibles solo llegan a propietaria/administración.
  const [{ data: notes, error }, { data: people }] = await Promise.all([
    supabase
      .from("client_notes")
      .select("id, sensitivity, body, author_staff_id, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("staff_members").select("id, display_name"),
  ]);
  const canSensitive = can(staff, "owner", "admin");
  const author = (id: string | null) => people?.find((p) => p.id === id)?.display_name ?? "—";

  return (
    <div className="space-y-4">
      {!client.is_anonymized ? (
        <Card title="Nueva nota">
          <ActionForm action={addNoteAction} resetOnSuccess className="space-y-3">
            <input type="hidden" name="client_id" value={client.id} />
            <Field label="Nota">
              <textarea name="body" required rows={3} maxLength={4000} className={`${inputClass} py-2`} />
            </Field>
            {canSensitive ? (
              <Field label="Tipo de nota" hint="Sensible: salud capilar, alergias u otros datos delicados. Solo propietaria y administración la ven.">
                <select name="sensitivity" defaultValue="general" className={inputClass}>
                  <option value="general">General (operativa)</option>
                  <option value="sensitive">Sensible</option>
                </select>
              </Field>
            ) : (
              <p className="text-xs text-muted">
                Las notas que registres son generales. Si la clienta comparte datos de salud, pide a administración que los registre como nota
                sensible.
              </p>
            )}
            <SubmitButton>Guardar nota</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}
      <Card title="Notas">
        {error ? <ErrorNotice message="No se pudieron cargar las notas." /> : null}
        {!error && (notes ?? []).length === 0 ? <EmptyState title="Sin notas" /> : null}
        <ul className="divide-y divide-line text-sm" aria-label="Notas de la clienta">
          {(notes ?? []).map((n) => (
            <li key={n.id} className="py-3">
              <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                {n.sensitivity === "sensitive" ? <Badge tone="danger">Sensible</Badge> : <Badge>General</Badge>}
                {dateMx(n.created_at, true)} · {author(n.author_staff_id)}
              </p>
              <p className="whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
        {!canSensitive ? <p className="mt-3 text-xs text-muted">Las notas sensibles no se muestran a tu rol.</p> : null}
      </Card>
    </div>
  );
}
