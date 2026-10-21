import type { Metadata } from "next";
import { Badge, Card, EmptyState, inputClass, PageHeader } from "@/components/ui";
import { mxn } from "@/lib/format";
import { requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "Inventario" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const { supabase } = await requireStaff();
  const { q, low } = await searchParams;
  let query = supabase
    .from("v_stock_availability")
    .select("variant_id, sku, product_name, variant_name, tone, length_cm, texture, on_hand, reserved, available, min_stock, is_low, bin_location, price_cents")
    .order("product_name")
    .limit(200);
  if (q) {
    const term = q.replace(/[%,()]/g, " ").trim();
    query = query.or(`product_name.ilike.%${term}%,variant_name.ilike.%${term}%,sku.ilike.%${term}%,tone.ilike.%${term}%`);
  }
  if (low === "1") query = query.eq("is_low", true);
  const { data, error } = await query;

  return (
    <>
      <PageHeader title="Inventario" subtitle="Disponible = existencias − reservado (citas, apartados)" />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2" method="get">
          <input name="q" defaultValue={q} placeholder="Buscar por producto, SKU o tono" className={`${inputClass} max-w-sm`} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="low" value="1" defaultChecked={low === "1"} /> Solo bajo mínimo
          </label>
          <button className="rounded-brand border border-line px-3 text-sm">Filtrar</button>
        </form>
        {error ? <p className="text-sm text-danger">No se pudo cargar el inventario.</p> : null}
        {(data ?? []).length === 0 ? (
          <EmptyState title="Sin productos" description="Da de alta productos y registra entradas iniciales." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2">Producto</th>
                  <th>Tono / largo</th>
                  <th className="text-right">Existencias</th>
                  <th className="text-right">Reservado</th>
                  <th className="text-right">Disponible</th>
                  <th className="text-right">Precio</th>
                  <th>Ubicación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data!.map((v) => (
                  <tr key={v.variant_id}>
                    <td className="py-2">
                      <p className="font-medium">{v.variant_name}</p>
                      <p className="text-xs text-muted">{v.sku}</p>
                    </td>
                    <td>{[v.tone, v.length_cm ? `${v.length_cm} cm` : null, v.texture].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="text-right tabular-nums">{Number(v.on_hand)}</td>
                    <td className="text-right tabular-nums">{Number(v.reserved)}</td>
                    <td className="text-right tabular-nums">
                      {Number(v.available)} {v.is_low ? <Badge tone="danger">Bajo</Badge> : null}
                    </td>
                    <td className="text-right tabular-nums">{mxn(v.price_cents)}</td>
                    <td>{v.bin_location ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
