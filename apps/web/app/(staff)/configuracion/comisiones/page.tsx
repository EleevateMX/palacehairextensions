import type { CommissionRule } from "@palace/domain";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { ConfigTabs } from "../_components/config-tabs";
import { Repeater } from "../_components/repeater";
import { describeRule } from "../_lib/commission-text";
import { COMMISSION_KIND_LABEL, commissionRuleSchema } from "../_lib/fields";
import { dateTime } from "../_lib/format";
import { Forbidden, requireManager } from "../_lib/guard";
import { createCommissionRule, deactivateCommissionRule } from "./actions";

export const metadata: Metadata = { title: "Comisiones" };

function BaseSelect() {
  return (
    <Field label="Base">
      <select name="base" className={inputClass}>
        <option value="services">Servicios</option>
        <option value="products">Productos</option>
        <option value="all">Servicios + productos</option>
      </select>
    </Field>
  );
}

function RuleForm({ kind, staffId, children }: { kind: CommissionRule["kind"]; staffId: string; children: ReactNode }) {
  return (
    <details className="rounded-brand border border-line p-3">
      <summary className="min-h-8 cursor-pointer text-sm font-medium">{COMMISSION_KIND_LABEL[kind]}</summary>
      <ActionForm action={createCommissionRule} resetOnSuccess className="mt-3 space-y-3">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="staff_id" value={staffId} />
        {children}
        <Field label="Notas (opcional)">
          <input name="notes" className={inputClass} />
        </Field>
        <SubmitButton>Crear regla</SubmitButton>
      </ActionForm>
    </details>
  );
}

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  const { supabase, allowed } = await requireManager();
  if (!allowed) return <Forbidden title="Comisiones" />;
  const sp = await searchParams;
  const [people, services] = await Promise.all([
    supabase.from("staff_members").select("id, display_name, role").eq("is_active", true).order("display_name"),
    supabase.from("services").select("id, name").eq("is_active", true).order("name"),
  ]);
  const staffList = people.data ?? [];
  const selected = staffList.find((p) => p.id === sp.staff) ?? null;
  const rules = selected
    ? await supabase.from("commission_rules").select("id, rule, notes, is_active, created_at").eq("staff_id", selected.id).order("created_at", { ascending: false })
    : null;
  const svcName = new Map((services.data ?? []).map((s) => [s.id, s.name]));
  const nameOf = (id: string) => svcName.get(id) ?? "servicio inactivo";

  const serviceChecks = (
    <fieldset>
      <legend className="text-sm font-medium">Servicios (vacío = todos)</legend>
      <div className="mt-1 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
        {(services.data ?? []).map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="service_ids" value={s.id} className="size-4" /> {s.name}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <>
      <PageHeader title="Comisiones" subtitle="Reglas por persona. El sistema genera reportes; no sustituye nómina." />
      <ConfigTabs current="/configuracion/comisiones" />
      {people.error ? <ErrorNotice message="No se pudo cargar el personal." /> : null}

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <Field label="Persona" className="min-w-56">
          <select name="staff" defaultValue={selected?.id ?? ""} className={inputClass}>
            <option value="">Selecciona…</option>
            {staffList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} · {ROLE_LABEL[p.role as AppRole]}
              </option>
            ))}
          </select>
        </Field>
        <button className={secondaryButtonClass}>Ver reglas</button>
      </form>

      {!selected ? (
        <EmptyState title="Elige a una persona" description="Verás sus reglas vigentes y podrás crear nuevas." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={`Reglas de ${selected.display_name}`}>
            {rules?.error ? <ErrorNotice message="No se pudieron cargar las reglas." /> : null}
            {(rules?.data ?? []).length === 0 ? (
              <EmptyState title="Sin reglas" description="Crea la primera con los formularios." />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {rules!.data!.map((r) => {
                  const parsed = commissionRuleSchema.safeParse(r.rule);
                  return (
                    <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {parsed.success ? COMMISSION_KIND_LABEL[parsed.data.kind] : "Regla con formato inválido"}{" "}
                          {r.is_active ? <Badge tone="success">Vigente</Badge> : <Badge>Inactiva</Badge>}
                        </p>
                        <p className="text-muted">{parsed.success ? describeRule(parsed.data, nameOf) : JSON.stringify(r.rule)}</p>
                        {r.notes ? <p className="text-xs text-muted">{r.notes}</p> : null}
                        <p className="text-xs text-muted">Creada {dateTime(r.created_at)}</p>
                      </div>
                      {r.is_active ? (
                        <ActionForm action={deactivateCommissionRule}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton variant="secondary" confirm="¿Desactivar esta regla?">
                            Desactivar
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Nueva regla">
            <div className="space-y-2">
              <RuleForm kind="percent_service" staffId={selected.id}>
                <Field label="Porcentaje (%)">
                  <input name="pct" inputMode="decimal" required placeholder="10" className={inputClass} />
                </Field>
                {serviceChecks}
              </RuleForm>
              <RuleForm kind="fixed_service" staffId={selected.id}>
                <Field label="Monto por servicio (MXN)">
                  <input name="amount" inputMode="decimal" required placeholder="150" className={inputClass} />
                </Field>
                {serviceChecks}
              </RuleForm>
              <RuleForm kind="percent_product" staffId={selected.id}>
                <Field label="Porcentaje sobre productos (%)">
                  <input name="pct" inputMode="decimal" required placeholder="5" className={inputClass} />
                </Field>
              </RuleForm>
              <RuleForm kind="tiered" staffId={selected.id}>
                <BaseSelect />
                <Field label="Cálculo">
                  <select name="marginal" className={inputClass}>
                    <option value="no">La tasa del tramo alcanzado aplica a todo</option>
                    <option value="si">Marginal: cada tramo paga su tasa</option>
                  </select>
                </Field>
                <Repeater
                  legend="tramo"
                  addLabel="Agregar tramo"
                  fields={[
                    { name: "tier_from", label: "Desde (MXN)", type: "number" },
                    { name: "tier_pct", label: "Tasa (%)", type: "number" },
                  ]}
                  initial={[{ tier_from: "0", tier_pct: "" }]}
                />
              </RuleForm>
              <RuleForm kind="goal_bonus" staffId={selected.id}>
                <BaseSelect />
                <Field label="Meta del periodo (MXN)">
                  <input name="target" inputMode="decimal" required className={inputClass} />
                </Field>
                <Field label="Bono (MXN)">
                  <input name="bonus" inputMode="decimal" required className={inputClass} />
                </Field>
              </RuleForm>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
