import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, ErrorNotice, PageHeader, secondaryButtonClass } from "@/components/ui";
import { ALL_ROLES, ROLE_LABEL, type AppRole } from "@/lib/roles";
import { can, requireStaff } from "@/lib/staff";
import { createStaffMember } from "./actions";
import { CreateStaffForm } from "./create-staff-form";

export const metadata: Metadata = { title: "Personal" };

type Person = {
  id: string;
  display_name: string;
  role: AppRole;
  is_bookable: boolean;
  is_active: boolean;
  email: string | null;
  calendar_color: string | null;
  location_id: string | null;
};

function PersonRow({ p, manage }: { p: Person; manage: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="size-3 shrink-0 rounded-full border border-line" style={{ background: p.calendar_color ?? "transparent" }} />
        <span className="min-w-0">
          {manage ? (
            <Link href={`/personal/${p.id}`} className="font-medium underline-offset-2 hover:underline">
              {p.display_name}
            </Link>
          ) : (
            <span className="font-medium">{p.display_name}</span>
          )}
          {manage && p.email ? <span className="block truncate text-xs text-muted">{p.email}</span> : null}
        </span>
      </span>
      <span className="flex flex-wrap gap-1">
        <Badge>{ROLE_LABEL[p.role]}</Badge>
        {p.is_bookable ? <Badge tone="success">Agendable</Badge> : null}
        {p.is_active ? null : <Badge tone="danger">Inactiva</Badge>}
      </span>
    </li>
  );
}

export default async function StaffPage() {
  const { staff, supabase } = await requireStaff();
  const manage = can(staff, "owner", "admin");
  let query = supabase
    .from("staff_members")
    .select("id, display_name, role, is_bookable, is_active, email, calendar_color, location_id")
    .order("display_name");
  if (!manage) query = query.eq("is_active", true);
  const [{ data, error }, locations] = await Promise.all([
    query,
    manage ? supabase.from("locations").select("id, name").eq("is_active", true).order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const people = (data ?? []) as Person[];
  const active = people.filter((p) => p.is_active);
  const inactive = people.filter((p) => !p.is_active);
  const roleOptions = ALL_ROLES.filter((r) => r !== "owner" || staff.role === "owner").map((r) => ({ value: r, label: ROLE_LABEL[r] }));

  return (
    <>
      <PageHeader
        title="Personal"
        subtitle={manage ? "Equipo, roles, turnos y servicios" : "Equipo del salón"}
        actions={
          <Link href="/personal/ausencias" className={secondaryButtonClass}>
            Ausencias y vacaciones
          </Link>
        }
      />
      {error ? <ErrorNotice message="No se pudo cargar el personal." /> : null}
      <div className={manage ? "grid gap-6 lg:grid-cols-[1fr_24rem]" : ""}>
        <Card title={`Personal activo (${active.length})`}>
          {active.length === 0 ? (
            <EmptyState title="Sin personal activo" />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {active.map((p) => (
                <PersonRow key={p.id} p={p} manage={manage} />
              ))}
            </ul>
          )}
          {manage && inactive.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-muted">Personal inactivo ({inactive.length})</summary>
              <ul className="divide-y divide-line text-sm">
                {inactive.map((p) => (
                  <PersonRow key={p.id} p={p} manage />
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
        {manage ? (
          <Card title="Alta de personal">
            <CreateStaffForm
              action={createStaffMember}
              roles={roleOptions}
              locations={(locations.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
              defaultLocation={staff.locationId}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}
