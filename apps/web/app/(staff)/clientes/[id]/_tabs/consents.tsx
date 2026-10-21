import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorNotice } from "@/components/ui";
import { can } from "@/lib/staff";
import { CONSENT_LABEL, CONSENT_PURPOSES, dateMx } from "../../_lib/crm";
import { recordConsentAction } from "../../actions";
import type { TabProps } from "./types";

export async function ConsentsTab({ supabase, staff, client }: TabProps) {
  const [{ data: current, error }, { data: history }, { data: people }] = await Promise.all([
    supabase.from("v_client_current_consents").select("purpose, granted, recorded_at, source").eq("client_id", client.id),
    supabase
      .from("client_consents")
      .select("id, purpose, granted, source, evidence, privacy_notice_version, recorded_by, recorded_at")
      .eq("client_id", client.id)
      .order("recorded_at", { ascending: false })
      .limit(100),
    supabase.from("staff_members").select("id, display_name"),
  ]);
  if (error) return <ErrorNotice message="No se pudieron cargar los consentimientos." />;
  const byPurpose = new Map((current ?? []).map((c) => [c.purpose as string, c]));
  // "Revocado" solo si alguna vez estuvo otorgado; si nunca se otorgó, "No otorgado".
  const everGranted = new Set((history ?? []).filter((h) => h.granted).map((h) => h.purpose as string));
  const who = (id: string | null) => people?.find((p) => p.id === id)?.display_name ?? "Sistema / portal";
  const editable = can(staff, "owner", "admin", "receptionist", "sales") && !client.is_anonymized;

  return (
    <div className="space-y-4">
      <Card title="Estado vigente">
        <p className="mb-3 text-xs text-muted">
          Cada cambio agrega un registro nuevo al historial; nunca se sobrescribe. Revocar el aviso de privacidad equivale a oponerse al
          tratamiento: valora con administración si procede anonimizar.
        </p>
        <ul className="divide-y divide-line text-sm" aria-label="Consentimientos vigentes">
          {CONSENT_PURPOSES.map((p) => {
            const c = byPurpose.get(p);
            return (
              <li key={p} className="flex flex-wrap items-center justify-between gap-2 py-2" data-purpose={p}>
                <span>
                  <span className="font-medium">{CONSENT_LABEL[p]}</span>{" "}
                  {c ? (
                    <Badge tone={c.granted ? "success" : "danger"}>{c.granted ? "Otorgado" : everGranted.has(p) ? "Revocado" : "No otorgado"}</Badge>
                  ) : (
                    <Badge tone="warning">Sin registro</Badge>
                  )}
                  {c ? <span className="block text-xs text-muted">Desde {dateMx(c.recorded_at, true)} · {c.source}</span> : null}
                </span>
                {editable ? (
                  <ActionForm action={recordConsentAction}>
                    <input type="hidden" name="client_id" value={client.id} />
                    <input type="hidden" name="purpose" value={p} />
                    <input type="hidden" name="granted" value={c?.granted ? "false" : "true"} />
                    <SubmitButton
                      variant={c?.granted ? "secondary" : "primary"}
                      confirm={c?.granted && p === "privacy_notice" ? "¿Registrar que la clienta revoca el aviso de privacidad?" : undefined}
                    >
                      {c?.granted ? "Revocar" : "Otorgar"}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title="Historial">
        {(history ?? []).length === 0 ? (
          <EmptyState title="Sin registros de consentimiento" />
        ) : (
          <ol className="divide-y divide-line text-sm" aria-label="Historial de consentimientos">
            {history!.map((h, i) => (
              <li key={h.id} className="py-2">
                <span className="font-medium">{CONSENT_LABEL[h.purpose] ?? h.purpose}</span>{" "}
                <Badge tone={h.granted ? "success" : "danger"}>{h.granted ? "Otorgado" : history!.slice(i + 1).find((o) => o.purpose === h.purpose)?.granted ? "Revocado" : "No otorgado"}</Badge>
                <span className="block text-xs text-muted">
                  {dateMx(h.recorded_at, true)} · {h.source} · {who(h.recorded_by)}
                  {h.privacy_notice_version ? ` · aviso ${h.privacy_notice_version}` : ""}
                  {h.evidence ? ` · ${h.evidence}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
