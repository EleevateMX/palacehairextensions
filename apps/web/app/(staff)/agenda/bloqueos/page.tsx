import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { parsePgRange, utcToLocalDate } from "@palace/domain";
import { ActionForm, SubmitButton } from "@/components/forms";
import { KeepValuesForm } from "../_components/keep-values-form";
import { Card, EmptyState, ErrorNotice, Field, inputClass, PageHeader } from "@/components/ui";
import { hour, isIsoDate, longDate, todayLocal, TZ } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";
import { one } from "../_lib/status";
import { createBlockAction, removeBlockAction } from "./actions";

export const metadata: Metadata = { title: "Bloqueos de agenda" };

type Block = {
  id: string;
  occupied: string;
  reason: string | null;
  staff_id: string | null;
  resource_id: string | null;
  staff_members: { display_name: string } | { display_name: string }[] | null;
  resources: { name: string } | { name: string }[] | null;
};

export default async function BlocksPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, "owner", "admin", "receptionist")) redirect("/agenda");
  const sp = await searchParams;
  const date = isIsoDate(sp.date) ? sp.date : todayLocal();
  const now = new Date();
  const horizon = new Date(now.getTime() + 90 * 86_400_000);

  const [{ data: people }, { data: resources }, { data: blocksData, error }] = await Promise.all([
    supabase.from("staff_members").select("id, display_name").eq("is_bookable", true).eq("is_active", true).order("display_name"),
    supabase.from("resources").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    supabase
      .from("appointment_allocations")
      .select("id, occupied, reason, staff_id, resource_id, staff_members(display_name), resources(name)")
      .eq("kind", "block")
      .eq("active", true)
      .overlaps("occupied", `[${now.toISOString()},${horizon.toISOString()})`),
  ]);
  const blocks = ((blocksData ?? []) as unknown as Block[])
    .map((b) => ({ ...b, range: parsePgRange(b.occupied) }))
    .sort((x, y) => x.range.start - y.range.start);

  return (
    <>
      <PageHeader
        title="Bloqueos de agenda"
        subtitle="Horarios no disponibles para una especialista o un recurso (juntas, mantenimiento, capacitación)"
        actions={
          <Link className="rounded-brand border border-line px-3 py-2 text-sm" href={`/agenda?date=${date}`}>
            ← Agenda
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Nuevo bloqueo">
          <KeepValuesForm action={createBlockAction} className="space-y-3" resetOnSuccess>
            <Field label="Bloquear a">
              <select name="target" required defaultValue="" className={inputClass}>
                <option value="">Selecciona…</option>
                <optgroup label="Especialistas">
                  {(people ?? []).map((p) => (
                    <option key={p.id} value={`staff:${p.id}`}>
                      {p.display_name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Recursos">
                  {(resources ?? []).map((r) => (
                    <option key={r.id} value={`resource:${r.id}`}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <Field label="Día">
              <input type="date" name="date" required defaultValue={date} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Desde">
                <input type="time" name="start" required step={900} className={inputClass} />
              </Field>
              <Field label="Hasta">
                <input type="time" name="end" required step={900} className={inputClass} />
              </Field>
            </div>
            <Field label="Motivo">
              <input name="reason" required minLength={3} maxLength={200} className={inputClass} placeholder="p. ej. capacitación" />
            </Field>
            <SubmitButton>Crear bloqueo</SubmitButton>
          </KeepValuesForm>
        </Card>

        <Card title="Próximos bloqueos (90 días)">
          {error ? <ErrorNotice message="No se pudieron cargar los bloqueos." /> : null}
          {blocks.length === 0 ? (
            <EmptyState title="Sin bloqueos próximos" />
          ) : (
            <ul className="divide-y divide-line">
              {blocks.map((b) => {
                const who = b.staff_id ? one(b.staff_members)?.display_name : one(b.resources)?.name;
                const day = utcToLocalDate(b.range.start, TZ);
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-medium">
                        {who ?? "—"} <span className="text-xs font-normal text-muted">{b.staff_id ? "Especialista" : "Recurso"}</span>
                      </p>
                      <p className="text-muted">
                        <span className="capitalize">{longDate(day)}</span> · <span className="tabular-nums">{hour(b.range.start)}–{hour(b.range.end)}</span>
                        {b.reason ? ` · ${b.reason}` : ""}
                      </p>
                    </div>
                    <ActionForm action={removeBlockAction}>
                      <input type="hidden" name="allocation_id" value={b.id} />
                      <SubmitButton variant="secondary" confirm="¿Quitar este bloqueo? El horario volverá a ofrecerse.">
                        Quitar
                      </SubmitButton>
                    </ActionForm>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
