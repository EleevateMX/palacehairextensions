import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SubmitButton } from "@/components/forms";
import { KeepForm as ActionForm } from "@/app/(staff)/inventario/_lib/keep-form";
import { Badge, Card, DataTable, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";
import { mxn } from "@/lib/format";
import { requireStaff } from "@/lib/staff";
import { canWrite, dateTime, PO_STATUS_LABEL, qty } from "../../_lib/shared";
import { Forbidden, InventoryTabs } from "../../_lib/ui";
import { cancelPurchaseOrderAction, markSentAction, receiveLineAction } from "../actions";

export const metadata: Metadata = { title: "Orden de compra" };

export default async function PurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { id } = await params;
  const { ok } = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return <Forbidden what="ver órdenes de compra" />;
  const { data: po } = await supabase
    .from("purchase_orders")
    .select(
      "id, status, expected_at, notes, created_at, suppliers(name, phone, email), locations(name, timezone), purchase_order_lines(id, variant_id, qty_ordered, qty_received, unit_cost_cents, product_variants(sku, name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!po) notFound();
  const o = po as any;
  const tz = o.locations?.timezone ?? "America/Mexico_City";
  const lines = ((o.purchase_order_lines ?? []) as any[]).sort((a, b) => (a.product_variants?.sku ?? "").localeCompare(b.product_variants?.sku ?? ""));
  const receivable = o.status !== "received" && o.status !== "cancelled";
  const total = lines.reduce((a, l) => a + Math.round(Number(l.qty_ordered) * l.unit_cost_cents), 0);

  return (
    <>
      <PageHeader
        title={`Orden de compra · ${o.suppliers?.name ?? ""}`}
        subtitle={`${o.locations?.name ?? ""} · creada ${dateTime(o.created_at, tz)}${o.expected_at ? ` · esperada ${o.expected_at}` : ""}`}
        actions={
          <Link href="/inventario/compras" className={secondaryButtonClass}>
            Volver
          </Link>
        }
      />
      <InventoryTabs staff={staff} current="/inventario/compras" />
      {ok === "enviada" || ok === "cancelada" ? (
        <p role="status" className="mb-3 rounded-brand border border-success/40 bg-success/10 p-2 text-sm text-success">
          {ok === "enviada" ? "Orden marcada como enviada." : "Orden cancelada."}
        </p>
      ) : null}
      <p className="mb-3 text-sm">
        Estado: <Badge tone={o.status === "received" ? "success" : o.status === "cancelled" ? "danger" : "warning"}>{PO_STATUS_LABEL[o.status]}</Badge>
        {o.notes ? ` · ${o.notes}` : ""}
        {o.suppliers?.phone || o.suppliers?.email ? ` · ${[o.suppliers?.phone, o.suppliers?.email].filter(Boolean).join(" · ")}` : ""}
      </p>
      <Card title="Partidas">
        <DataTable head={["Producto", "Pedido", "Recibido", "Pendiente", "Costo unitario", "Importe", ...(receivable ? ["Recibir"] : [])]}>
          {lines.map((l) => {
            const pending = Number(l.qty_ordered) - Number(l.qty_received);
            return (
              <tr key={l.id} data-testid={`po-line-${l.product_variants?.sku}`}>
                <td className="py-2 pr-3">
                  <Link href={`/inventario/kardex/${l.variant_id}`} className="font-medium hover:underline">
                    {l.product_variants?.name}
                  </Link>
                  <p className="text-xs text-muted">{l.product_variants?.sku}</p>
                </td>
                <td className="pr-3 tabular-nums">{qty(l.qty_ordered)}</td>
                <td className="pr-3 tabular-nums">{qty(l.qty_received)}</td>
                <td className="pr-3 tabular-nums">{qty(pending)}</td>
                <td className="pr-3 tabular-nums">{mxn(l.unit_cost_cents)}</td>
                <td className="pr-3 tabular-nums">{mxn(Math.round(Number(l.qty_ordered) * l.unit_cost_cents))}</td>
                {receivable ? (
                  <td className="pr-3">
                    {pending > 0 ? (
                      <ActionForm action={receiveLineAction} className="flex items-center gap-2">
                        <input type="hidden" name="po_id" value={o.id} />
                        <input type="hidden" name="line_id" value={l.id} />
                        <input
                          name="quantity"
                          aria-label={`Recibir ${l.product_variants?.sku}`}
                          inputMode="decimal"
                          defaultValue={String(pending)}
                          className={`${inputClass} w-24`}
                        />
                        <SubmitButton variant="secondary">Recibir</SubmitButton>
                      </ActionForm>
                    ) : (
                      <span className="text-xs text-muted">Completa</span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </DataTable>
        <p className="mt-2 text-right text-sm">
          Total: <strong className="tabular-nums">{mxn(total)}</strong>
        </p>
      </Card>
      <div className="mt-4 flex flex-wrap gap-3">
        {o.status === "draft" ? (
          <ActionForm action={markSentAction}>
            <input type="hidden" name="po_id" value={o.id} />
            <SubmitButton variant="secondary">Marcar como enviada</SubmitButton>
          </ActionForm>
        ) : null}
        {o.status === "draft" || o.status === "sent" ? (
          <ActionForm action={cancelPurchaseOrderAction}>
            <input type="hidden" name="po_id" value={o.id} />
            <SubmitButton variant="danger" confirm="¿Cancelar la orden de compra?">
              Cancelar orden
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    </>
  );
}
