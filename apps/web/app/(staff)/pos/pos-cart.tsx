"use client";

import { type ReactNode, startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { formatPhone } from "../clientes/_lib/crm";
import { mxn } from "@/lib/format";
import { couponPreview, centsToInput, parsePesos } from "./_lib/money";
import { METHOD_LABEL } from "./_lib/labels";
import { type ClientHit, checkCouponAction, checkGiftCardAction, checkoutAction, searchClientsAction } from "./actions";

export interface CatalogProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  productName: string;
  priceCents: number;
  regularPriceCents: number;
  available: number;
}
export interface CatalogService {
  id: string;
  name: string;
  priceCents: number;
  priceIsFrom: boolean;
}
export interface StaffOption {
  id: string;
  name: string;
  bookable: boolean;
}
export interface AppointmentPreload {
  id: string;
  label: string;
  client: ClientHit | null;
  services: { appointmentServiceId: string; serviceId: string; staffId: string | null; name: string; priceCents: number; priceIsFrom: boolean }[];
  deposits: { id: string; amountCents: number; method: string }[];
  existingSale: { id: string; folio: number } | null;
}

type Kind = "product" | "service" | "gift_card";
interface Line {
  key: string;
  kind: Kind;
  variantId?: string;
  serviceId?: string;
  appointmentServiceId?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  /** Precio editable: servicios "desde" y tarjetas de regalo. */
  priceEditable: boolean;
  /** Precio del catálogo (solo se manda si cambia en un servicio "desde"). */
  basePriceCents: number;
  discount: string;
  staffId: string;
  available?: number;
}
type Method = "cash" | "card" | "transfer" | "gift_card" | "deposit";
interface Payment {
  key: string;
  method: Method;
  amount: string;
  tip: string;
  tipStaffId: string;
  reference: string;
  giftCardCode: string;
  received: string;
  depositId?: string;
  depositLabel?: string;
  giftCardInfo?: string;
}

/** UUID v4 también en contextos no seguros (tableta por http en la red local). */
function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const emptyPayment = (method: Method = "cash", tipStaffId = ""): Payment => ({
  key: newKey(),
  method,
  amount: "",
  tip: "",
  tipStaffId,
  reference: "",
  giftCardCode: "",
  received: "",
});

const ctl = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/25";
const smallBtn = "inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-3 text-sm transition hover:border-fg disabled:opacity-50";

function Lbl({ text, children, className = "" }: { text: string; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <span className="block text-xs font-medium text-muted">{text}</span>
      {children}
    </div>
  );
}

function initialLines(appt: AppointmentPreload | null): Line[] {
  if (!appt) return [];
  return appt.services.map((s) => ({
    key: newKey(),
    kind: "service",
    serviceId: s.serviceId,
    appointmentServiceId: s.appointmentServiceId,
    description: s.name,
    quantity: "1",
    unitPrice: centsToInput(s.priceCents),
    priceEditable: s.priceIsFrom,
    basePriceCents: s.priceCents,
    discount: "",
    staffId: s.staffId ?? "",
  }));
}

function initialPayments(appt: AppointmentPreload | null): Payment[] {
  const firstStaff = appt?.services.find((s) => s.staffId)?.staffId ?? "";
  const deposits: Payment[] = (appt?.deposits ?? []).map((d) => ({
    ...emptyPayment("deposit", firstStaff),
    amount: centsToInput(d.amountCents),
    depositId: d.id,
    depositLabel: `Anticipo recibido (${METHOD_LABEL[d.method] ?? d.method})`,
  }));
  return [...deposits, emptyPayment("cash", firstStaff)];
}

export function PosCart({
  products,
  services,
  staff,
  canDiscount,
  appointment,
}: {
  products: CatalogProduct[];
  services: CatalogService[];
  staff: StaffOption[];
  canDiscount: boolean;
  appointment: AppointmentPreload | null;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [lines, setLines] = useState<Line[]>(() => initialLines(appointment));
  const [payments, setPayments] = useState<Payment[]>(() => initialPayments(appointment));
  const [client, setClient] = useState<ClientHit | null>(appointment?.client ?? null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientHits, setClientHits] = useState<ClientHit[]>([]);
  const [coupon, setCoupon] = useState<{ code: string; kind: "percent" | "fixed"; value: number } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [allowBalance, setAllowBalance] = useState(false);
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const [state, dispatch, pending] = useActionState(checkoutAction, {});
  const busy = useRef(false);
  useEffect(() => {
    if (state.error) busy.current = false;
  }, [state]);

  // Búsqueda de clientas con espera corta.
  useEffect(() => {
    if (client || clientQuery.trim().length < 2) {
      setClientHits([]);
      return;
    }
    const t = setTimeout(() => {
      searchClientsAction(clientQuery).then(setClientHits, () => setClientHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [clientQuery, client]);

  const productHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return products
      .filter((p) => `${p.name} ${p.productName} ${p.sku} ${p.barcode ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, products]);

  const staffOptions = useMemo(() => [...staff].sort((a, b) => Number(b.bookable) - Number(a.bookable)), [staff]);

  // ---------------------------------------------------------------------------
  // Totales (solo vista previa; el servidor recalcula todo)
  // ---------------------------------------------------------------------------
  const totals = useMemo(() => {
    let subtotal = 0;
    let lineDisc = 0;
    let invalid = false;
    for (const l of lines) {
      const unit = parsePesos(l.unitPrice);
      const qty = Number(l.quantity);
      const disc = parsePesos(l.discount);
      if (unit === null || disc === null || !Number.isFinite(qty) || qty <= 0) {
        invalid = true;
        continue;
      }
      subtotal += Math.round(unit * qty);
      lineDisc += disc;
    }
    const couponDisc = couponPreview(coupon, subtotal - lineDisc);
    const total = subtotal - lineDisc - couponDisc;
    let paid = 0;
    let tips = 0;
    for (const p of payments) {
      const a = parsePesos(p.amount);
      const t = parsePesos(p.tip);
      if (a === null || t === null) {
        invalid = true;
        continue;
      }
      paid += a;
      tips += t;
    }
    return { subtotal, lineDisc, couponDisc, total, paid, tips, remaining: total - paid, invalid };
  }, [lines, payments, coupon]);

  // ---------------------------------------------------------------------------
  // Carrito
  // ---------------------------------------------------------------------------
  function addProduct(p: CatalogProduct) {
    setNotice(null);
    const existing = lines.find((l) => l.kind === "product" && l.variantId === p.id);
    const nextQty = existing ? Number(existing.quantity) + 1 : 1;
    if (nextQty > p.available) {
      setNotice(p.available <= 0 ? `${p.name}: sin existencias disponibles.` : `${p.name}: solo hay ${p.available} disponibles.`);
      return;
    }
    if (existing) {
      setLines((ls) => ls.map((l) => (l.key === existing.key ? { ...l, quantity: String(nextQty) } : l)));
    } else {
      setLines((ls) => [
        ...ls,
        {
          key: newKey(),
          kind: "product",
          variantId: p.id,
          description: p.name,
          quantity: "1",
          unitPrice: centsToInput(p.priceCents),
          priceEditable: false,
          basePriceCents: p.priceCents,
          discount: "",
          staffId: "",
          available: p.available,
        },
      ]);
    }
  }

  function onScan() {
    const code = scan.trim().toLowerCase();
    if (!code) return;
    const p = products.find((x) => (x.barcode ?? "").toLowerCase() === code || x.sku.toLowerCase() === code);
    if (p) addProduct(p);
    else setNotice(`No se encontró ningún producto con el código «${scan.trim()}».`);
    setScan("");
  }

  function addService() {
    const s = services.find((x) => x.id === serviceId);
    if (!s) return;
    setLines((ls) => [
      ...ls,
      {
        key: newKey(),
        kind: "service",
        serviceId: s.id,
        description: s.name,
        quantity: "1",
        unitPrice: centsToInput(s.priceCents),
        priceEditable: s.priceIsFrom,
        basePriceCents: s.priceCents,
        discount: "",
        staffId: "",
      },
    ]);
    setServiceId("");
  }

  function addGiftCard() {
    const cents = parsePesos(giftAmount);
    if (!cents) {
      setNotice("Escribe el importe de la tarjeta de regalo.");
      return;
    }
    setNotice(null);
    setLines((ls) => [
      ...ls,
      {
        key: newKey(),
        kind: "gift_card",
        description: "Tarjeta de regalo",
        quantity: "1",
        unitPrice: centsToInput(cents),
        priceEditable: true,
        basePriceCents: cents,
        discount: "",
        staffId: "",
      },
    ]);
    setGiftAmount("");
  }

  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const updatePayment = (key: string, patch: Partial<Payment>) => setPayments((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  async function applyCoupon() {
    setCouponMsg(null);
    const r = await checkCouponAction(couponInput);
    if (r.ok) {
      setCoupon({ code: r.code, kind: r.kind, value: r.value });
      setCouponInput("");
    } else setCouponMsg(r.error);
  }

  async function checkGiftCard(p: Payment) {
    const r = await checkGiftCardAction(p.giftCardCode);
    if (!r.ok) {
      updatePayment(p.key, { giftCardInfo: r.error });
      return;
    }
    const others = payments.filter((x) => x.key !== p.key).reduce((s, x) => s + (parsePesos(x.amount) ?? 0), 0);
    const use = Math.max(0, Math.min(r.balanceCents, totals.total - others));
    updatePayment(p.key, {
      giftCardCode: r.code,
      giftCardInfo: `Saldo disponible: ${mxn(r.balanceCents)}`,
      amount: p.amount || centsToInput(use),
    });
  }

  function fillRemaining(p: Payment) {
    const others = payments.filter((x) => x.key !== p.key).reduce((s, x) => s + (parsePesos(x.amount) ?? 0), 0);
    updatePayment(p.key, { amount: centsToInput(Math.max(0, totals.total - others)) });
  }

  function resetCart() {
    setLines([]);
    setPayments([emptyPayment()]);
    setClient(null);
    setCoupon(null);
    setAllowBalance(false);
    setLocalError(null);
    setIdempotencyKey(newKey());
  }

  // ---------------------------------------------------------------------------
  // Cobro
  // ---------------------------------------------------------------------------
  function submit() {
    if (busy.current || pending) return;
    setLocalError(null);
    if (lines.length === 0) return setLocalError("El carrito está vacío.");
    if (totals.invalid) return setLocalError("Revisa los importes: usa pesos, p. ej. 1250.50.");
    if (totals.paid > totals.total) return setLocalError("Los pagos superan el total.");
    if (totals.remaining > 0 && !allowBalance)
      return setLocalError(`Faltan ${mxn(totals.remaining)} por cobrar. Agrega un pago o marca «Dejar saldo pendiente».`);
    if (totals.remaining > 0 && !client) return setLocalError("Para dejar saldo pendiente selecciona a la clienta.");

    const payload = {
      idempotency_key: idempotencyKey,
      client_id: client?.id,
      appointment_id: appointment?.id,
      coupon_code: coupon?.code,
      allow_balance: totals.remaining > 0 && allowBalance,
      lines: lines.map((l) => {
        const unit = parsePesos(l.unitPrice)!;
        const sendPrice = l.kind === "gift_card" || (l.priceEditable && unit !== l.basePriceCents);
        return {
          kind: l.kind,
          variant_id: l.variantId,
          service_id: l.serviceId,
          appointment_service_id: l.appointmentServiceId,
          staff_id: l.staffId || undefined,
          quantity: Number(l.quantity),
          ...(sendPrice ? { unit_price_cents: unit } : {}),
          discount_cents: canDiscount ? parsePesos(l.discount)! : 0,
        };
      }),
      payments: payments
        .map((p) => ({ p, amount: parsePesos(p.amount)!, tip: parsePesos(p.tip)! }))
        .filter(({ amount, tip }) => amount > 0 || tip > 0)
        .map(({ p, amount, tip }) => ({
          method: p.method,
          amount_cents: amount,
          tip_cents: tip,
          tip_staff_id: tip > 0 ? p.tipStaffId || undefined : undefined,
          provider_ref: p.reference.trim() || undefined,
          gift_card_code: p.giftCardCode.trim() || undefined,
          deposit_id: p.depositId,
        })),
    };
    busy.current = true;
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    startTransition(() => dispatch(fd));
  }

  const error = localError ?? state.error ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      {/* Columna izquierda: agregar y carrito */}
      <div className="space-y-4">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="eyebrow mb-3">Agregar al carrito</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Lbl text="Código de barras o SKU (Enter para agregar)">
              <input
                aria-label="Código de barras o SKU"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onScan();
                  }
                }}
                autoComplete="off"
                inputMode="search"
                className={ctl}
              />
            </Lbl>
            <Lbl text="Buscar producto">
              <input
                aria-label="Buscar producto"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, tono o SKU"
                className={ctl}
              />
            </Lbl>
          </div>
          {productHits.length > 0 ? (
            <ul className="mt-2 divide-y divide-line rounded-brand border border-line">
              {productHits.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted">
                      {p.sku} · disponible {p.available} · {mxn(p.priceCents)}
                      {p.priceCents !== p.regularPriceCents ? ` (antes ${mxn(p.regularPriceCents)})` : ""}
                    </p>
                  </div>
                  <button type="button" aria-label={`Agregar ${p.name}`} disabled={p.available <= 0} onClick={() => addProduct(p)} className={smallBtn}>
                    {p.available <= 0 ? "Agotado" : "Agregar"}
                  </button>
                </li>
              ))}
            </ul>
          ) : search.trim().length >= 2 ? (
            <p className="mt-2 text-sm text-muted">Sin coincidencias.</p>
          ) : null}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="flex items-end gap-2">
              <Lbl text="Servicio" className="flex-1">
                <select aria-label="Servicio" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={ctl}>
                  <option value="">Selecciona…</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.priceIsFrom ? "desde " : ""}
                      {mxn(s.priceCents)}
                    </option>
                  ))}
                </select>
              </Lbl>
              <button type="button" onClick={addService} disabled={!serviceId} className={smallBtn}>
                Agregar servicio
              </button>
            </div>
            <div className="flex items-end gap-2">
              <Lbl text="Tarjeta de regalo (pesos)" className="flex-1">
                <input
                  aria-label="Importe de la tarjeta de regalo"
                  value={giftAmount}
                  onChange={(e) => setGiftAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={ctl}
                />
              </Lbl>
              <button type="button" onClick={addGiftCard} className={smallBtn}>
                Agregar tarjeta de regalo
              </button>
            </div>
          </div>
          {notice ? (
            <p role="status" className="mt-2 text-sm text-warning">
              {notice}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow">
              Carrito {appointment ? `· ${appointment.label}` : ""}
            </h2>
            {lines.length > 0 ? (
              <button type="button" onClick={resetCart} className="text-sm text-muted underline">
                Vaciar
              </button>
            ) : null}
          </div>
          {lines.length === 0 ? (
            <p className="rounded-brand border border-dashed border-line p-6 text-center text-sm text-muted">
              Agrega productos, servicios o tarjetas de regalo.
            </p>
          ) : (
            <ul className="space-y-3">
              {lines.map((l) => {
                const unit = parsePesos(l.unitPrice) ?? 0;
                const qty = Number(l.quantity) || 0;
                const disc = parsePesos(l.discount) ?? 0;
                return (
                  <li key={l.key} className="rounded-xl border border-line p-3.5" data-testid="cart-line">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{l.description}</p>
                        <p className="text-xs text-muted">
                          {l.kind === "product" ? `Producto · disponible ${l.available ?? "?"}` : l.kind === "service" ? "Servicio" : "Tarjeta de regalo"}
                          {l.appointmentServiceId ? " · de la cita" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Quitar ${l.description}`}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        className="text-sm text-danger"
                      >
                        Quitar
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Lbl text="Precio">
                        {l.priceEditable ? (
                          <input
                            aria-label={`Precio de ${l.description}`}
                            value={l.unitPrice}
                            inputMode="decimal"
                            onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                            className={ctl}
                          />
                        ) : (
                          <p className="min-h-11 py-3 text-sm tabular-nums">{mxn(unit)}</p>
                        )}
                      </Lbl>
                      <Lbl text="Cantidad">
                        {l.kind === "product" ? (
                          <input
                            aria-label={`Cantidad de ${l.description}`}
                            type="number"
                            min={1}
                            max={l.available}
                            step={1}
                            value={l.quantity}
                            onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                            className={ctl}
                          />
                        ) : (
                          <p className="min-h-11 py-3 text-sm">1</p>
                        )}
                      </Lbl>
                      {l.kind !== "gift_card" ? (
                        <Lbl text={l.kind === "service" ? "Especialista" : "Vendió"}>
                          <select
                            aria-label={`Especialista de ${l.description}`}
                            value={l.staffId}
                            onChange={(e) => updateLine(l.key, { staffId: e.target.value })}
                            className={ctl}
                          >
                            <option value="">—</option>
                            {staffOptions.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </Lbl>
                      ) : (
                        <div />
                      )}
                      {canDiscount && l.kind !== "gift_card" ? (
                        <Lbl text="Descuento (pesos)">
                          <input
                            aria-label={`Descuento de ${l.description}`}
                            value={l.discount}
                            inputMode="decimal"
                            placeholder="0.00"
                            onChange={(e) => updateLine(l.key, { discount: e.target.value })}
                            className={ctl}
                          />
                        </Lbl>
                      ) : null}
                    </div>
                    <p className="mt-2 text-right text-sm font-medium tabular-nums">{mxn(Math.round(unit * qty) - (canDiscount ? disc : 0))}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Columna derecha: clienta, cupón, pagos y totales */}
      <div className="space-y-4">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="eyebrow mb-3">Clienta (opcional)</h2>
          {client ? (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium" data-testid="selected-client">
                  {client.name}
                </p>
                {client.phone ? <p className="text-xs text-muted">{formatPhone(client.phone)}</p> : null}
              </div>
              <button
                type="button"
                className={smallBtn}
                onClick={() => {
                  setClient(null);
                  setClientQuery("");
                }}
              >
                Cambiar clienta
              </button>
            </div>
          ) : (
            <>
              <input
                aria-label="Buscar clienta"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                placeholder="Nombre o teléfono"
                className={ctl}
              />
              {clientHits.length > 0 ? (
                <ul className="mt-2 divide-y divide-line rounded-brand border border-line">
                  {clientHits.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => setClient(c)} className="w-full p-2 text-left text-sm hover:bg-surface-muted">
                        {c.name} {c.phone ? <span className="text-muted">· {formatPhone(c.phone)}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="eyebrow mb-3">Cupón</h2>
          {coupon ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <p role="status">
                Cupón <strong>{coupon.code}</strong> aplicado ({coupon.kind === "percent" ? `${coupon.value / 100} %` : mxn(coupon.value)})
              </p>
              <button type="button" className={smallBtn} onClick={() => setCoupon(null)}>
                Quitar cupón
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input aria-label="Código de cupón" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} className={ctl} />
              <button type="button" onClick={applyCoupon} className={smallBtn}>
                Aplicar cupón
              </button>
            </div>
          )}
          {couponMsg ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {couponMsg}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow">Pagos</h2>
            <button type="button" className={smallBtn} onClick={() => setPayments((ps) => [...ps, emptyPayment("card", ps[0]?.tipStaffId ?? "")])}>
              Agregar pago
            </button>
          </div>
          <ul className="space-y-3">
            {payments.map((p, i) => {
              const n = i + 1;
              const amount = parsePesos(p.amount) ?? 0;
              const tip = parsePesos(p.tip) ?? 0;
              const received = parsePesos(p.received) ?? 0;
              return (
                <li key={p.key} className="rounded-xl border border-line p-3.5" data-testid="payment-row">
                  <div className="flex items-center justify-between gap-2">
                    {p.method === "deposit" ? (
                      <p className="text-sm font-medium">{p.depositLabel}</p>
                    ) : (
                      <select
                        aria-label={`Método (pago ${n})`}
                        value={p.method}
                        onChange={(e) => updatePayment(p.key, { method: e.target.value as Method, giftCardInfo: undefined })}
                        className={`${ctl} max-w-48`}
                      >
                        <option value="cash">Efectivo</option>
                        <option value="card">Tarjeta</option>
                        <option value="transfer">Transferencia</option>
                        <option value="gift_card">Tarjeta de regalo</option>
                      </select>
                    )}
                    {payments.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Quitar pago ${n}`}
                        onClick={() => setPayments((ps) => ps.filter((x) => x.key !== p.key))}
                        className="text-sm text-danger"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Lbl text="Importe (pesos)">
                      {p.method === "deposit" ? (
                        <p className="min-h-11 py-3 text-sm tabular-nums">{mxn(amount)}</p>
                      ) : (
                        <div className="flex gap-1">
                          <input
                            aria-label={`Importe (pago ${n})`}
                            value={p.amount}
                            inputMode="decimal"
                            placeholder="0.00"
                            onChange={(e) => updatePayment(p.key, { amount: e.target.value })}
                            className={ctl}
                          />
                          <button type="button" aria-label={`Restante (pago ${n})`} title="Completar con lo que falta" onClick={() => fillRemaining(p)} className={smallBtn}>
                            =
                          </button>
                        </div>
                      )}
                    </Lbl>
                    {p.method === "card" ? (
                      <Lbl text="Referencia de la terminal">
                        <input
                          aria-label={`Referencia de terminal (pago ${n})`}
                          value={p.reference}
                          onChange={(e) => updatePayment(p.key, { reference: e.target.value })}
                          autoComplete="off"
                          className={ctl}
                        />
                      </Lbl>
                    ) : p.method === "transfer" ? (
                      <Lbl text="Referencia (opcional)">
                        <input
                          aria-label={`Referencia (pago ${n})`}
                          value={p.reference}
                          onChange={(e) => updatePayment(p.key, { reference: e.target.value })}
                          autoComplete="off"
                          className={ctl}
                        />
                      </Lbl>
                    ) : p.method === "gift_card" ? (
                      <Lbl text="Código de la tarjeta">
                        <div className="flex gap-1">
                          <input
                            aria-label={`Código de tarjeta (pago ${n})`}
                            value={p.giftCardCode}
                            onChange={(e) => updatePayment(p.key, { giftCardCode: e.target.value.toUpperCase(), giftCardInfo: undefined })}
                            autoComplete="off"
                            className={ctl}
                          />
                          <button type="button" aria-label={`Consultar saldo (pago ${n})`} onClick={() => checkGiftCard(p)} className={smallBtn}>
                            Saldo
                          </button>
                        </div>
                      </Lbl>
                    ) : p.method === "cash" ? (
                      <Lbl text="Efectivo recibido (opcional)">
                        <input
                          aria-label={`Efectivo recibido (pago ${n})`}
                          value={p.received}
                          inputMode="decimal"
                          placeholder="0.00"
                          onChange={(e) => updatePayment(p.key, { received: e.target.value })}
                          className={ctl}
                        />
                      </Lbl>
                    ) : (
                      <div />
                    )}
                    <Lbl text="Propina (pesos)">
                      <input
                        aria-label={`Propina (pago ${n})`}
                        value={p.tip}
                        inputMode="decimal"
                        placeholder="0.00"
                        onChange={(e) => updatePayment(p.key, { tip: e.target.value })}
                        className={ctl}
                      />
                    </Lbl>
                    <Lbl text="Propina para">
                      <select
                        aria-label={`Propina para (pago ${n})`}
                        value={p.tipStaffId}
                        onChange={(e) => updatePayment(p.key, { tipStaffId: e.target.value })}
                        className={ctl}
                      >
                        <option value="">—</option>
                        {staffOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </Lbl>
                  </div>
                  {p.giftCardInfo ? <p className="mt-2 text-sm text-muted">{p.giftCardInfo}</p> : null}
                  {p.method === "cash" && received > 0 ? (
                    <p className="mt-2 text-sm" data-testid="change">
                      {received >= amount + tip ? (
                        <>
                          Cambio: <strong className="tabular-nums">{mxn(received - amount - tip)}</strong>
                        </>
                      ) : (
                        <span className="text-danger">Lo recibido no cubre el importe y la propina.</span>
                      )}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5" aria-label="Totales">
          <dl className="space-y-1 text-sm">
            <Row label="Subtotal" value={mxn(totals.subtotal)} />
            {totals.lineDisc > 0 ? <Row label="Descuentos" value={`−${mxn(totals.lineDisc)}`} /> : null}
            {totals.couponDisc > 0 ? <Row label="Cupón (estimado)" value={`−${mxn(totals.couponDisc)}`} /> : null}
            <Row label="Total" value={mxn(totals.total)} strong testId="total-preview" />
            <Row label="Pagado" value={mxn(totals.paid)} />
            {totals.tips > 0 ? <Row label="Propinas (aparte)" value={mxn(totals.tips)} /> : null}
            <Row
              label={totals.remaining >= 0 ? "Por cobrar" : "Excedente"}
              value={mxn(Math.abs(totals.remaining))}
              testId="remaining-preview"
              tone={totals.remaining < 0 ? "danger" : undefined}
            />
          </dl>
          <p className="mt-2 text-xs text-muted">Vista previa: el total definitivo lo calcula el servidor (precios vigentes, cupón e IVA incluido).</p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowBalance} onChange={(e) => setAllowBalance(e.target.checked)} aria-label="Dejar saldo pendiente" />
            Dejar saldo pendiente (requiere clienta)
          </label>
          {error ? (
            <p role="alert" className="mt-3 rounded-brand border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="mt-4 inline-flex min-h-13 w-full items-center justify-center rounded-xl bg-accent px-4 text-base font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Cobrando…" : "Cobrar"}
          </button>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, strong, testId, tone }: { label: string; value: string; strong?: boolean; testId?: string; tone?: "danger" }) {
  return (
    <div className={`flex items-baseline justify-between ${strong ? "mt-2 border-t border-line pt-3 text-lg font-semibold" : ""} ${tone === "danger" ? "text-danger" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
