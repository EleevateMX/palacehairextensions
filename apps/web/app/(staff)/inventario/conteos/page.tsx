import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/forms";
import { KeepForm as ActionForm } from "@/app/(staff)/inventario/_lib/keep-form";
import { Badge, Card, DataTable, EmptyState, ErrorNotice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/staff";
import { canWrite, COUNT_STATUS_LABEL, dateTime, workingLocation } from "../_lib/shared";
import { Forbidden, InventoryTabs, NoLocation } from "../_lib/ui";
import { startCountAction } from "./actions";

export const metadata: Metadata = { title: "Conteos físicos" };

export default async function CountsPage() {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return <Forbidden what="hacer conteos físicos" />;
  const { location } = await workingLocation(supabase, staff);
  if (!location) return <NoLocation />;
  const { data, error } = await supabase
    .from("stock_counts")
    .select("id, status, started_at, applied_at, stock_count_lines(count)")
    .eq("location_id", location.id)
    .order("started_at", { ascending: false })
    .limit(100);
  const counts = (data ?? []) as any[];
  const open = counts.find((c) => c.status === "open");

  return (
    <>
      <PageHeader title="Conteos físicos" subtitle={`${location.name} · las diferencias se aplican como movimientos auditables`} />
      <InventoryTabs staff={staff} current="/inventario/conteos" />
      <div className="space-y-4">
        <Card title="Nuevo conteo">
          {open ? (
            <p className="text-sm">
              Hay un conteo abierto.{" "}
              <Link href={`/inventario/conteos/${open.id}`} className="underline">
                Continuar conteo
              </Link>
            </p>
          ) : (
            <ActionForm action={startCountAction} className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">Captura lo que hay físicamente en anaqueles; al aplicar, el sistema ajusta las diferencias.</p>
              <SubmitButton>Iniciar conteo</SubmitButton>
            </ActionForm>
          )}
        </Card>
        <Card title="Historial">
          {error ? <ErrorNotice message="No se pudieron cargar los conteos." /> : null}
          {counts.length === 0 ? (
            <EmptyState title="Sin conteos" description="Aún no se ha hecho ningún conteo en esta sucursal." />
          ) : (
            <DataTable head={["Inicio", "Estado", "Partidas", "Aplicado", ""]}>
              {counts.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-3">{dateTime(c.started_at, location.timezone)}</td>
                  <td className="pr-3">
                    <Badge tone={c.status === "applied" ? "success" : c.status === "open" ? "warning" : "neutral"}>{COUNT_STATUS_LABEL[c.status]}</Badge>
                  </td>
                  <td className="pr-3 tabular-nums">{c.stock_count_lines?.[0]?.count ?? 0}</td>
                  <td className="pr-3">{c.applied_at ? dateTime(c.applied_at, location.timezone) : "—"}</td>
                  <td className="pr-3">
                    <Link href={`/inventario/conteos/${c.id}`} className="underline">
                      {c.status === "open" ? "Capturar" : "Ver"}
                    </Link>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>
    </>
  );
}
