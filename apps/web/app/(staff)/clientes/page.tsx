import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, ErrorNotice, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";
import { can, requireStaff } from "@/lib/staff";
import { dateMx, formatPhone, SEGMENTS, searchTerm } from "./_lib/crm";

export const metadata: Metadata = { title: "Clientas" };

type SP = { q?: string; segmento?: string };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, staff } = await requireStaff();
  const { q = "", segmento = "" } = await searchParams;

  if (can(staff, "inventory")) {
    return (
      <>
        <PageHeader title="Clientas" />
        <EmptyState title="Tu rol no tiene acceso a clientas" description="Inventarios trabaja con existencias y apartados, sin datos personales." />
      </>
    );
  }

  let query = supabase
    .from("v_client_activity")
    .select(
      "client_id, first_name, last_name, phone, hair_tone, extension_technique, next_visit_suggested, last_visit_at, next_appointment_at, completed_visits_180d, next_maintenance_due, is_new, is_frequent, is_inactive, maintenance_due_soon",
    )
    .eq("is_anonymized", false)
    .order("first_name")
    .order("last_name")
    .limit(200);
  const term = searchTerm(q);
  if (term) {
    const digits = term.replace(/\D/g, "");
    const parts = [`first_name.ilike.%${term}%`, `last_name.ilike.%${term}%`, `email.ilike.%${term}%`];
    if (digits.length >= 3) parts.push(`phone.ilike.%${digits}%`);
    // "Nombre Apellido": busca también por la combinación.
    const [a, ...rest] = term.split(/\s+/);
    if (a && rest.length) parts.push(`and(first_name.ilike.%${a}%,last_name.ilike.%${rest.join(" ")}%)`);
    query = query.or(parts.join(","));
  }
  if (segmento === "nuevas") query = query.eq("is_new", true);
  if (segmento === "frecuentes") query = query.eq("is_frequent", true);
  if (segmento === "inactivas") query = query.eq("is_inactive", true);
  if (segmento === "mantenimiento") query = query.eq("maintenance_due_soon", true);
  const { data, error } = await query;
  const rows = data ?? [];
  const canCreate = can(staff, "owner", "admin", "receptionist", "sales");
  const qs = (seg: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (seg) p.set("segmento", seg);
    const s = p.toString();
    return s ? `/clientes?${s}` : "/clientes";
  };

  return (
    <>
      <PageHeader
        title="Clientas"
        subtitle={can(staff, "stylist") ? "Solo ves las clientas que atiendes" : "Expedientes, consentimientos y seguimiento"}
        actions={
          canCreate ? (
            <Link href="/clientes/nueva" className={buttonClass}>
              Nueva clienta
            </Link>
          ) : null
        }
      />
      <Card>
        <form method="get" className="mb-3 flex flex-wrap gap-2" role="search">
          {segmento ? <input type="hidden" name="segmento" value={segmento} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, teléfono o correo"
            aria-label="Buscar clienta"
            className={`${inputClass} sm:max-w-sm`}
          />
          <button className={secondaryButtonClass}>Buscar</button>
        </form>
        <nav aria-label="Segmentos" className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {SEGMENTS.map((s) => (
            <a
              key={s.value}
              href={qs(s.value)}
              aria-current={segmento === s.value ? "page" : undefined}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${
                segmento === s.value ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:bg-surface-muted"
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>
        {error ? <ErrorNotice message="No se pudieron cargar las clientas. Intenta de nuevo." /> : null}
        {!error && rows.length === 0 ? (
          <EmptyState
            title={q || segmento ? "Sin resultados" : "Aún no hay clientas"}
            description={q || segmento ? "Prueba con otro nombre, teléfono o segmento." : canCreate ? "Registra a la primera con «Nueva clienta»." : undefined}
          />
        ) : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-line text-sm" aria-label="Lista de clientas">
            {rows.map((c) => (
              <li key={c.client_id}>
                <Link href={`/clientes/${c.client_id}`} className="flex flex-col gap-1 py-3 hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between sm:px-2">
                  <span>
                    <span className="font-medium">
                      {c.first_name} {c.last_name ?? ""}
                    </span>
                    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                      {c.is_new ? <Badge tone="success">Nueva</Badge> : null}
                      {c.is_frequent ? <Badge>Frecuente</Badge> : null}
                      {c.is_inactive ? <Badge tone="warning">Inactiva</Badge> : null}
                      {c.maintenance_due_soon ? <Badge tone="danger">Mantenimiento {dateMx(c.next_maintenance_due)}</Badge> : null}
                    </span>
                    <span className="block text-xs text-muted">
                      {[c.hair_tone ? `Tono ${c.hair_tone}` : null, c.extension_technique].filter(Boolean).join(" · ") || "Sin perfil capilar"}
                    </span>
                  </span>
                  <span className="text-muted tabular-nums">{formatPhone(c.phone)}</span>
                  <span className="text-xs text-muted">
                    {c.next_appointment_at
                      ? `Próxima cita: ${dateMx(c.next_appointment_at)}`
                      : c.last_visit_at
                        ? `Última visita: ${dateMx(c.last_visit_at)}`
                        : "Sin visitas"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {rows.length === 200 ? <p className="mt-3 text-xs text-muted">Se muestran las primeras 200. Usa la búsqueda para acotar.</p> : null}
      </Card>
    </>
  );
}
