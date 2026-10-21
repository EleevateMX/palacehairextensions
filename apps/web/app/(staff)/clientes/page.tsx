import type { Metadata } from "next";
import { Card, EmptyState, inputClass, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "Clientas" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await requireStaff();
  const { q } = await searchParams;
  let query = supabase
    .from("clients")
    .select("id, first_name, last_name, phone, hair_tone, extension_technique, next_visit_suggested")
    .eq("is_anonymized", false)
    .order("first_name")
    .limit(200);
  if (q) {
    const term = q.replace(/[%,()]/g, " ").trim();
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const { data } = await query;
  return (
    <>
      <PageHeader title="Clientas" subtitle="Solo verás las clientas que tu rol permite" />
      <Card>
        <form method="get" className="mb-4">
          <input name="q" defaultValue={q} placeholder="Buscar por nombre o teléfono" className={`${inputClass} max-w-sm`} />
        </form>
        {(data ?? []).length === 0 ? (
          <EmptyState title="Sin resultados" />
        ) : (
          <ul className="divide-y divide-line text-sm">
            {data!.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-medium">
                  {c.first_name} {c.last_name ?? ""}
                </span>
                <span className="text-muted">{c.phone ?? "—"}</span>
                <span className="text-muted">{[c.hair_tone, c.extension_technique].filter(Boolean).join(" · ") || "Sin perfil capilar"}</span>
                <span className="text-muted">Próxima visita: {c.next_visit_suggested ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
