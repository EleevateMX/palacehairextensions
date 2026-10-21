import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, DataTable, EmptyState, ErrorNotice, PageHeader, secondaryButtonClass } from "@/components/ui";
import { mxn } from "@/lib/format";
import { requireStaff } from "@/lib/staff";
import { reorderSuggestions, type Suggestion } from "../_lib/reorder";
import { canWrite, dateTime, PO_STATUS_LABEL, qty, workingLocation } from "../_lib/shared";
import { Forbidden, InventoryTabs, NoLocation } from "../_lib/ui";

export const metadata: Metadata = { title: "Compras" };

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "warning",
  partial: "warning",
  received: "success",
  cancelled: "danger",
};

export default async function PurchasesPage() {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return <Forbidden what="administrar compras" />;
  const { location } = await workingLocation(supabase, staff);
  if (!location) return <NoLocation />;
  const [{ data, error }, suggestions] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, status, expected_at, created_at, suppliers(name), purchase_order_lines(qty_ordered, qty_received, unit_cost_cents)")
      .eq("location_id", location.id)
      .order("created_at", { ascending: false })
      .limit(100),
    reorderSuggestions(supabase, location.id),
  ]);
  const orders = (data ?? []) as any[];
  const groups = new Map<string, Suggestion[]>();
  for (const s of suggestions) {
    const k = s.supplier_id ?? "";
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  return (
    <>
      <PageHeader
        title="Compras"
        subtitle={location.name}
        actions={
          <Link href="/inventario/compras/nueva" className={buttonClass}>
            Nueva orden
          </Link>
        }
      />
      <InventoryTabs staff={staff} current="/inventario/compras" />
      <div className="space-y-4">
        <Card title="Sugerencias de reabasto">
          <p className="mb-3 text-xs text-muted">
            Variantes con disponible ≤ mínimo. Sugerido = mínimo × 2 − disponible − lo que ya viene en órdenes abiertas.
          </p>
          {suggestions.length === 0 ? (
            <EmptyState title="Nada por reabastecer" description="Todas las variantes con mínimo están por encima de él." />
          ) : (
            <div className="space-y-4">
              {[...groups.entries()].map(([supplierId, items]) => {
                const lines = items.map((s) => `${s.variant_id}:${s.suggested}`).join(",");
                const href = `/inventario/compras/nueva?lines=${encodeURIComponent(lines)}${supplierId ? `&supplier=${supplierId}` : ""}`;
                return (
                  <div key={supplierId || "none"} data-testid="reorder-group">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{items[0]?.supplier_name ?? "Sin proveedor asignado"}</p>
                      <Link href={href} className={secondaryButtonClass}>
                        Crear orden
                      </Link>
                    </div>
                    <DataTable head={["Producto", "Disponible", "Mínimo", "En camino", "Sugerido", "Costo"]}>
                      {items.map((s) => (
                        <tr key={s.variant_id}>
                          <td className="py-2 pr-3">
                            <p className="font-medium">{s.variant_name}</p>
                            <p className="text-xs text-muted">{s.sku}</p>
                          </td>
                          <td className="pr-3 tabular-nums">{qty(s.available)}</td>
                          <td className="pr-3 tabular-nums">{qty(s.min_stock)}</td>
                          <td className="pr-3 tabular-nums">{qty(s.pending)}</td>
                          <td className="pr-3 font-medium tabular-nums">{qty(s.suggested)}</td>
                          <td className="pr-3 tabular-nums">{s.cost_cents === null ? "—" : mxn(s.cost_cents)}</td>
                        </tr>
                      ))}
                    </DataTable>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Órdenes de compra">
          {error ? <ErrorNotice message="No se pudieron cargar las órdenes." /> : null}
          {orders.length === 0 ? (
            <EmptyState title="Sin órdenes" description="Crea una orden para registrar lo que pides a tus proveedores." />
          ) : (
            <DataTable head={["Fecha", "Proveedor", "Estado", "Partidas", "Recibido", "Total", ""]}>
              {orders.map((o) => {
                const ls = (o.purchase_order_lines ?? []) as any[];
                const ordered = ls.reduce((a, l) => a + Number(l.qty_ordered), 0);
                const received = ls.reduce((a, l) => a + Number(l.qty_received), 0);
                const total = ls.reduce((a, l) => a + Math.round(Number(l.qty_ordered) * l.unit_cost_cents), 0);
                return (
                  <tr key={o.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{dateTime(o.created_at, location.timezone)}</td>
                    <td className="pr-3">{o.suppliers?.name ?? "—"}</td>
                    <td className="pr-3">
                      <Badge tone={STATUS_TONE[o.status]}>{PO_STATUS_LABEL[o.status]}</Badge>
                    </td>
                    <td className="pr-3 tabular-nums">{ls.length}</td>
                    <td className="pr-3 tabular-nums">
                      {qty(received)} / {qty(ordered)}
                    </td>
                    <td className="pr-3 tabular-nums">{mxn(total)}</td>
                    <td className="pr-3">
                      <Link href={`/inventario/compras/${o.id}`} className="underline">
                        Ver
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </Card>
      </div>
    </>
  );
}
