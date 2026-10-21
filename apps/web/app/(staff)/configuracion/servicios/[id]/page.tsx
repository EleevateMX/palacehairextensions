import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { mxn } from "@/lib/format";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { ConfigTabs } from "../../_components/config-tabs";
import { bpsToPercent, centsToPesos, MATERIAL_ROLE_LABEL, MATERIAL_ROLES } from "../../_lib/fields";
import { Forbidden, requireManager } from "../../_lib/guard";
import {
  addCostItem,
  addMaterial,
  addRequirement,
  removeCostItem,
  removeMaterial,
  removeRequirement,
  saveQualifiedStaff,
  updateService,
} from "./actions";

export const metadata: Metadata = { title: "Editar servicio" };

const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="size-5" /> {label}
    </label>
  );
}

export default async function ServiceEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  const { supabase, allowed } = await requireManager();
  if (!allowed) return <Forbidden title="Editar servicio" />;
  const { id } = await params;
  const { nuevo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [svcRes, categories, staffRes, qualified, types, reqs, materials, variants, costs] = await Promise.all([
    supabase.from("services").select("*").eq("id", id).maybeSingle(),
    supabase.from("service_categories").select("id, name").order("sort_order").order("name"),
    supabase.from("staff_members").select("id, display_name, role, is_bookable").eq("is_active", true).order("display_name"),
    supabase.from("staff_services").select("staff_id, duration_min, price_cents").eq("service_id", id),
    supabase.from("resource_types").select("id, name, code").order("name"),
    supabase.from("service_resource_requirements").select("resource_type_id, quantity").eq("service_id", id),
    supabase.from("service_materials").select("id, variant_id, material_role, quantity, is_variable, reserve_on_booking, notes, product_variants(sku, name)").eq("service_id", id),
    supabase.from("product_variants").select("id, sku, name").eq("is_active", true).order("name").limit(500),
    supabase.from("service_cost_items").select("id, label, amount_cents").eq("service_id", id).order("label"),
  ]);
  if (svcRes.error) return <ErrorNotice message="No se pudo cargar el servicio." />;
  const s = svcRes.data;
  if (!s) notFound();

  const q = new Map((qualified.data ?? []).map((r) => [r.staff_id, r]));
  const typeName = new Map((types.data ?? []).map((t) => [t.id, t.name]));
  const usedTypes = new Set((reqs.data ?? []).map((r) => r.resource_type_id));
  const depositShown = s.deposit_type === "fixed" ? centsToPesos(s.deposit_value) : s.deposit_type === "percent" ? bpsToPercent(s.deposit_value) : "";
  const costTotal = (costs.data ?? []).reduce((a, c) => a + c.amount_cents, 0);
  const staffList = [...(staffRes.data ?? [])].sort((a, b) => Number(b.is_bookable) - Number(a.is_bookable));

  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={`${s.price_is_from ? "desde " : ""}${mxn(s.price_cents)} · ${s.duration_min} min`}
        actions={
          <Link href="/configuracion/servicios" className="text-sm underline">
            ← Todos los servicios
          </Link>
        }
      />
      <ConfigTabs current="/configuracion/servicios" />
      {nuevo ? (
        <p role="status" className="mb-4 rounded-brand border border-success/40 bg-success/10 p-2 text-sm text-success">
          Servicio creado. Completa su configuración y actívalo.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Datos del servicio" className="lg:col-span-2">
          <ActionForm action={updateService} className="grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="service_id" value={s.id} />
            <Field label="Nombre" className="sm:col-span-3">
              <input name="name" required defaultValue={s.name} className={inputClass} />
            </Field>
            <Field label="Categoría" className="sm:col-span-3">
              <select name="category_id" defaultValue={s.category_id ?? ""} className={inputClass}>
                <option value="">Sin categoría</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descripción" className="sm:col-span-6">
              <textarea name="description" rows={2} defaultValue={s.description ?? ""} className={`${inputClass} py-2`} />
            </Field>
            <Field label="Precio (MXN)" className="sm:col-span-2">
              <input name="price" inputMode="decimal" required defaultValue={centsToPesos(s.price_cents)} className={inputClass} />
            </Field>
            <div className="sm:col-span-4 sm:pt-6">
              <Check name="price_is_from" label="Precio «desde» (sujeto a valoración)" checked={s.price_is_from} />
            </div>
            <Field label="Duración (min)" className="sm:col-span-2">
              <input name="duration_min" inputMode="numeric" defaultValue={s.duration_min} className={inputClass} />
            </Field>
            <Field label="Preparación (min)" className="sm:col-span-2">
              <input name="prep_min" inputMode="numeric" defaultValue={s.prep_min} className={inputClass} />
            </Field>
            <Field label="Limpieza (min)" className="sm:col-span-2">
              <input name="cleanup_min" inputMode="numeric" defaultValue={s.cleanup_min} className={inputClass} />
            </Field>
            <Field label="Margen entre citas (min)" className="sm:col-span-2">
              <input name="buffer_min" inputMode="numeric" defaultValue={s.buffer_min} className={inputClass} />
            </Field>
            <div className="sm:col-span-4 sm:pt-6">
              <Check name="cleanup_occupies_staff" label="La limpieza ocupa a la especialista" checked={s.cleanup_occupies_staff} />
            </div>
            <Field label="Anticipo" className="sm:col-span-2">
              <select name="deposit_type" defaultValue={s.deposit_type} className={inputClass}>
                <option value="none">Sin anticipo</option>
                <option value="fixed">Monto fijo (MXN)</option>
                <option value="percent">Porcentaje (%)</option>
              </select>
            </Field>
            <Field label="Valor del anticipo" hint="Pesos si es fijo; % si es porcentaje." className="sm:col-span-2">
              <input name="deposit_value" inputMode="decimal" defaultValue={depositShown} className={inputClass} />
            </Field>
            <Field label="Cancelación sin costo (horas)" hint="Vacío = política general." className="sm:col-span-2">
              <input name="cancellation_min_hours" inputMode="numeric" defaultValue={s.cancellation_min_hours ?? ""} className={inputClass} />
            </Field>
            <Field label="Mantenimiento cada (días)" hint="Vacío = sin recordatorio." className="sm:col-span-2">
              <input name="maintenance_interval_days" inputMode="numeric" defaultValue={s.maintenance_interval_days ?? ""} className={inputClass} />
            </Field>
            <Field label="Técnica" hint="p. ej. cinta, keratina, microlink" className="sm:col-span-2">
              <input name="technique" defaultValue={s.technique ?? ""} className={inputClass} />
            </Field>
            <div className="grid gap-1 sm:col-span-6 sm:grid-cols-3">
              <Check name="requires_consultation" label="Requiere valoración previa" checked={s.requires_consultation} />
              <Check name="online_bookable" label="Reservable en línea" checked={s.online_bookable} />
              <Check name="is_active" label="Activo" checked={s.is_active} />
            </div>
            <div className="sm:col-span-6">
              <SubmitButton>Guardar servicio</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card title="Personal capacitado">
          {staffList.length === 0 ? (
            <EmptyState title="Sin personal activo" />
          ) : (
            <ActionForm action={saveQualifiedStaff} className="space-y-3">
              <input type="hidden" name="service_id" value={s.id} />
              <p className="text-xs text-muted">Duración y precio por persona son opcionales; vacío = los del servicio.</p>
              <ul className="divide-y divide-line">
                {staffList.map((p) => {
                  const row = q.get(p.id);
                  return (
                    <li key={p.id} className="grid grid-cols-2 items-end gap-2 py-2 sm:grid-cols-[1fr_7rem_8rem]">
                      <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm sm:col-span-1">
                        <input type="checkbox" name="staff" value={p.id} defaultChecked={Boolean(row)} aria-label={`Capacitada: ${p.display_name}`} className="size-5" />
                        <span>
                          {p.display_name}
                          <span className="block text-xs text-muted">
                            {ROLE_LABEL[p.role as AppRole]}
                            {p.is_bookable ? "" : " · no agendable"}
                          </span>
                        </span>
                      </label>
                      <input
                        name={`dur_${p.id}`}
                        inputMode="numeric"
                        placeholder="min"
                        aria-label={`Duración de ${p.display_name}`}
                        defaultValue={row?.duration_min ?? ""}
                        className={inputClass}
                      />
                      <input
                        name={`price_${p.id}`}
                        inputMode="decimal"
                        placeholder="precio"
                        aria-label={`Precio de ${p.display_name}`}
                        defaultValue={row?.price_cents != null ? centsToPesos(row.price_cents) : ""}
                        className={inputClass}
                      />
                    </li>
                  );
                })}
              </ul>
              <SubmitButton>Guardar personal capacitado</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card title="Recursos requeridos">
          {(reqs.data ?? []).length === 0 ? (
            <p className="mb-3 text-sm text-muted">No requiere recursos físicos.</p>
          ) : (
            <ul className="mb-3 divide-y divide-line text-sm">
              {reqs.data!.map((r) => (
                <li key={r.resource_type_id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {typeName.get(r.resource_type_id) ?? "—"} × {r.quantity}
                  </span>
                  <ActionForm action={removeRequirement}>
                    <input type="hidden" name="service_id" value={s.id} />
                    <input type="hidden" name="resource_type_id" value={r.resource_type_id} />
                    <SubmitButton variant="secondary">Quitar</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          {(types.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">
              Primero crea tipos de recurso en <Link href="/configuracion/recursos" className="underline">Recursos</Link>.
            </p>
          ) : (
            <ActionForm action={addRequirement} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="service_id" value={s.id} />
              <Field label="Tipo de recurso" className="min-w-40 flex-1">
                <select name="resource_type_id" className={inputClass}>
                  {types.data!.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {usedTypes.has(t.id) ? " (actualizar)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad" className="w-24">
                <input name="quantity" inputMode="numeric" defaultValue="1" className={inputClass} />
              </Field>
              <SubmitButton variant="secondary">Agregar recurso</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card title="Materiales (receta)">
          {(materials.data ?? []).length === 0 ? (
            <p className="mb-3 text-sm text-muted">Sin materiales configurados.</p>
          ) : (
            <ul className="mb-3 divide-y divide-line text-sm">
              {materials.data!.map((m) => {
                const v = one(m.product_variants);
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{MATERIAL_ROLE_LABEL[m.material_role as keyof typeof MATERIAL_ROLE_LABEL] ?? m.material_role}</span> ·{" "}
                      {m.is_variable ? <Badge tone="warning">Variable: se elige al reservar</Badge> : `${v?.name ?? "—"} (${v?.sku ?? ""})`} · ×{" "}
                      {Number(m.quantity)}
                      {m.reserve_on_booking ? "" : " · no se reserva"}
                      {m.notes ? <span className="block text-xs text-muted">{m.notes}</span> : null}
                    </span>
                    <ActionForm action={removeMaterial}>
                      <input type="hidden" name="service_id" value={s.id} />
                      <input type="hidden" name="id" value={m.id} />
                      <SubmitButton variant="secondary">Quitar</SubmitButton>
                    </ActionForm>
                  </li>
                );
              })}
            </ul>
          )}
          <ActionForm action={addMaterial} resetOnSuccess className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="service_id" value={s.id} />
            <Field label="Modo">
              <select name="mode" className={inputClass} defaultValue="fixed">
                <option value="fixed">Producto fijo</option>
                <option value="variable">Variable (p. ej. tono de cabello)</option>
              </select>
            </Field>
            <Field label="Tipo de material">
              <select name="material_role" className={inputClass}>
                {MATERIAL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {MATERIAL_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Producto (si es fijo)" className="sm:col-span-2">
              <select name="variant_id" className={inputClass} defaultValue="">
                <option value="">—</option>
                {(variants.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.sku}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cantidad">
              <input name="quantity" inputMode="decimal" defaultValue="1" className={inputClass} />
            </Field>
            <Field label="Nota (opcional)">
              <input name="notes" className={inputClass} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="reserve_on_booking" defaultChecked className="size-5" /> Reservar al agendar
            </label>
            <div className="sm:col-span-2">
              <SubmitButton variant="secondary">Agregar material</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card title="Costos configurados (solo administración)">
          {(costs.data ?? []).length === 0 ? (
            <p className="mb-3 text-sm text-muted">Sin costos adicionales (mano de obra, energía, amortización…).</p>
          ) : (
            <ul className="mb-3 divide-y divide-line text-sm">
              {costs.data!.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {c.label} · <span className="tabular-nums">{mxn(c.amount_cents)}</span>
                  </span>
                  <ActionForm action={removeCostItem}>
                    <input type="hidden" name="service_id" value={s.id} />
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton variant="secondary">Quitar</SubmitButton>
                  </ActionForm>
                </li>
              ))}
              <li className="py-2 text-right font-medium tabular-nums">Total por servicio: {mxn(costTotal)}</li>
            </ul>
          )}
          <ActionForm action={addCostItem} resetOnSuccess className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="service_id" value={s.id} />
            <Field label="Concepto" className="min-w-40 flex-1">
              <input name="label" required className={inputClass} />
            </Field>
            <Field label="Importe (MXN)" className="w-32">
              <input name="amount" inputMode="decimal" required className={inputClass} />
            </Field>
            <SubmitButton variant="secondary">Agregar costo</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
