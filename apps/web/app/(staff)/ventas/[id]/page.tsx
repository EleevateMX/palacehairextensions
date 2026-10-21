import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Card, EmptyState, secondaryButtonClass } from "@/components/ui";
import { mxn, TZ } from "@/lib/format";
import { can, requireStaff } from "@/lib/staff";
import { METHOD_LABEL, STATUS_LABEL, statusTone } from "../../pos/_lib/labels";
import { MANAGER_ROLES, POS_ROLES } from "../../pos/_lib/session";
import { PayBalanceForm, PrintButton, RefundLineForm, VoidSaleForm } from "./sale-forms";

export const metadata: Metadata = { title: "Venta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, dateStyle: "long", timeStyle: "short", hourCycle: "h23" }).format(new Date(iso));
const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, ""));

// Comprobante imprimible: oculta la navegación y los controles al imprimir.
const PRINT_CSS = `
@media print {
  aside, nav, .no-print { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  body { background: #fff !important; color: #000 !important; }
  .receipt { border: none !important; }
}`;

function noticeText(aviso?: string, importe?: string): string | null {
  switch (aviso) {
    case "liquidada":
      return "Abono registrado. La cuenta quedó liquidada.";
    case "abono":
      return "Abono registrado.";
    case "devolucion":
      return /^\d+$/.test(importe ?? "") ? `Devolución registrada por ${mxn(Number(importe))}.` : "Devolución registrada.";
    case "cancelada":
      return "Venta cancelada. Se regresó el inventario y se liberaron anticipos y tarjetas.";
    default:
      return null;
  }
}

export default async function SalePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; importe?: string }>;
}) {
  const { staff, supabase } = await requireStaff();
  if (!can(staff, ...POS_ROLES)) redirect("/dashboard");
  const { id } = await params;
  const sp = await searchParams;
  const notice = noticeText(sp.aviso, sp.importe);
  if (!UUID.test(id)) notFound();

  const { data: sale } = await supabase
    .from("sales")
    .select("*, client:clients(first_name, last_name, phone), coupon:coupons(code), location:locations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!sale) notFound();

  const [linesRes, paymentsRes, refundsRes, peopleRes, settingsRes] = await Promise.all([
    supabase.from("sale_lines").select("*").eq("sale_id", id),
    supabase.from("sale_payments").select("*").eq("sale_id", id).order("created_at"),
    supabase.from("refunds").select("*").eq("sale_id", id).order("created_at"),
    supabase.from("staff_members").select("id, user_id, display_name"),
    supabase.from("business_settings").select("display_name").eq("id", 1).maybeSingle(),
  ]);
  const lines = linesRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const refunds = refundsRes.data ?? [];
  const gcIds = [...lines.map((l) => l.gift_card_id), ...payments.map((p) => p.gift_card_id)].filter(Boolean) as string[];
  const { data: giftCards } = gcIds.length
    ? await supabase.from("gift_cards").select("id, code, balance_cents, status").in("id", gcIds)
    : { data: [] as { id: string; code: string; balance_cents: number; status: string }[] };
  const gc = new Map((giftCards ?? []).map((g) => [g.id, g]));
  const people = peopleRes.data ?? [];
  const staffName = new Map(people.map((p) => [p.id, p.display_name as string]));
  const cashier = people.find((p) => p.user_id === sale.created_by)?.display_name;

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const client = one(sale.client as { first_name: string; last_name: string | null; phone: string | null } | null);
  const coupon = one(sale.coupon as { code: string } | null);
  const location = one(sale.location as { name: string } | null);
  const isManager = can(staff, ...MANAGER_ROLES);
  const voided = sale.status === "voided";
  const lineDiscounts = lines.reduce((s, l) => s + l.discount_cents, 0);
  const couponDiscount = sale.discount_cents - lineDiscounts;
  const refundedTotal = lines.reduce((s, l) => s + l.refunded_cents, 0);

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/ventas" className="text-sm underline">
          ← Ventas
        </Link>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <Link href="/pos" className={secondaryButtonClass}>
            Nueva venta
          </Link>
        </div>
      </div>

      {notice ? (
        <p role="status" className="no-print mx-auto mb-4 max-w-2xl rounded-brand border border-success/40 bg-success/10 p-3 text-sm text-success">
          {notice}
        </p>
      ) : null}
      <article className="receipt mx-auto max-w-2xl rounded-brand border border-line bg-surface p-4 sm:p-6">
        <header className="mb-4 border-b border-line pb-4 text-center">
          <p className="text-lg font-semibold">{settingsRes.data?.display_name ?? "Palace Hair Extensions"}</p>
          {location ? <p className="text-sm text-muted">{location.name}</p> : null}
          <h1 className="mt-2 text-2xl font-semibold tabular-nums">Folio {sale.folio}</h1>
          <p className="text-sm text-muted">{dateTime(sale.created_at)}</p>
          <div className="mt-2 flex justify-center">
            <Badge tone={statusTone(sale.status)}>{STATUS_LABEL[sale.status] ?? sale.status}</Badge>
          </div>
          <p className="mt-2 text-sm">
            {client ? `Clienta: ${[client.first_name, client.last_name].filter(Boolean).join(" ")}` : "Venta sin clienta"}
            {cashier ? ` · Atendió: ${cashier}` : ""}
          </p>
          {voided ? (
            <p className="mt-2 text-sm text-danger">
              Cancelada {sale.voided_at ? dateTime(sale.voided_at) : ""} · {sale.void_reason}
            </p>
          ) : null}
        </header>

        <section aria-label="Conceptos">
          {lines.length === 0 ? (
            <EmptyState title="Sin conceptos" />
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => {
                const qty = Number(l.quantity);
                const refundedQty = Number(l.refunded_qty);
                const card = l.gift_card_id ? gc.get(l.gift_card_id) : null;
                return (
                  <li key={l.id} className="py-2" data-testid="sale-line">
                    <div className="flex justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium">{l.description}</p>
                        <p className="text-xs text-muted">
                          {qtyText(qty)} × {mxn(l.unit_price_cents)}
                          {l.staff_id ? ` · ${staffName.get(l.staff_id) ?? ""}` : ""}
                        </p>
                        {l.discount_cents > 0 ? <p className="text-xs text-muted">Descuento −{mxn(l.discount_cents)}</p> : null}
                        {card ? (
                          <p className="text-xs">
                            Código: <strong data-testid="gift-card-code">{card.code}</strong> · saldo {mxn(card.balance_cents)}
                            {card.status === "void" ? " · anulada" : ""}
                          </p>
                        ) : null}
                        {refundedQty > 0 ? (
                          <p className="text-xs text-danger">
                            Devuelto {qtyText(refundedQty)} · {mxn(l.refunded_cents)}
                          </p>
                        ) : null}
                      </div>
                      <p className="tabular-nums">{mxn(l.total_cents)}</p>
                    </div>
                    {isManager && !voided && refundedQty < qty ? (
                      <RefundLineForm saleId={sale.id} lineId={l.id} description={l.description} maxQty={qty - refundedQty} isProduct={l.kind === "product"} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{mxn(sale.subtotal_cents)}</dd>
          </div>
          {lineDiscounts > 0 ? (
            <div className="flex justify-between">
              <dt>Descuentos</dt>
              <dd className="tabular-nums">−{mxn(lineDiscounts)}</dd>
            </div>
          ) : null}
          {couponDiscount > 0 ? (
            <div className="flex justify-between">
              <dt>Cupón {coupon?.code ?? ""}</dt>
              <dd className="tabular-nums">−{mxn(couponDiscount)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums" data-testid="sale-total">
              {mxn(sale.total_cents)}
            </dd>
          </div>
          <div className="flex justify-between text-xs text-muted">
            <dt>IVA incluido (16 %)</dt>
            <dd className="tabular-nums">{mxn(sale.tax_cents)}</dd>
          </div>
        </dl>

        <section aria-label="Pagos" className="mt-4 border-t border-line pt-3">
          <h2 className="mb-2 text-sm font-medium">Pagos</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-muted">Sin pagos.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3" data-testid="sale-payment">
                  <span>
                    {METHOD_LABEL[p.method] ?? p.method}
                    {p.provider_ref ? ` · ref. ${p.provider_ref}` : ""}
                    {p.gift_card_id ? ` · ${gc.get(p.gift_card_id)?.code ?? ""}` : ""}
                    {p.tip_cents > 0 ? ` · propina ${mxn(p.tip_cents)}${p.tip_staff_id ? ` para ${staffName.get(p.tip_staff_id) ?? ""}` : ""}` : ""}
                  </span>
                  <span className="tabular-nums">{mxn(p.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Pagado</dt>
              <dd className="tabular-nums">{mxn(sale.paid_cents)}</dd>
            </div>
            {sale.tip_cents > 0 ? (
              <div className="flex justify-between">
                <dt>Propinas</dt>
                <dd className="tabular-nums">{mxn(sale.tip_cents)}</dd>
              </div>
            ) : null}
            <div className={`flex justify-between font-medium ${sale.balance_due_cents > 0 ? "text-danger" : ""}`}>
              <dt>Saldo pendiente</dt>
              <dd className="tabular-nums" data-testid="sale-balance">
                {mxn(sale.balance_due_cents)}
              </dd>
            </div>
            {refundedTotal > 0 ? (
              <div className="flex justify-between text-danger">
                <dt>Devuelto</dt>
                <dd className="tabular-nums">{mxn(refundedTotal)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {refunds.length > 0 ? (
          <section aria-label="Devoluciones" className="mt-4 border-t border-line pt-3">
            <h2 className="mb-2 text-sm font-medium">Devoluciones</h2>
            <ul className="space-y-1 text-sm">
              {refunds.map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span>
                    {dateTime(r.created_at)} · {METHOD_LABEL[r.method] ?? r.method} · {r.reason}
                    {r.restocked ? " · reingresó a inventario" : ""}
                  </span>
                  <span className="tabular-nums">−{mxn(r.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="mt-6 text-center text-xs text-muted">Precios con IVA incluido. Comprobante interno, no es un CFDI.</p>
      </article>

      <div className="no-print mx-auto mt-6 max-w-2xl space-y-4">
        {sale.balance_due_cents > 0 && !voided ? (
          <Card title={`Abonar saldo (${mxn(sale.balance_due_cents)} pendientes)`}>
            <PayBalanceForm saleId={sale.id} balanceInput={(sale.balance_due_cents / 100).toFixed(2)} />
          </Card>
        ) : null}
        {isManager && sale.status === "completed" ? (
          <Card title="Cancelar venta completa">
            <p className="mb-3 text-sm text-muted">
              Solo para errores de captura: regresa el inventario, anula las tarjetas de regalo vendidas y libera anticipos. Si ya hubo devoluciones,
              usa devoluciones por línea.
            </p>
            <VoidSaleForm saleId={sale.id} folio={sale.folio} />
          </Card>
        ) : null}
        {!isManager && !voided ? (
          <p className="text-center text-xs text-muted">Devoluciones y cancelaciones: solo propietaria o administración.</p>
        ) : null}
      </div>
    </>
  );
}
