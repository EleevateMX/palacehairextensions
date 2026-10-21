"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { payBalanceAction, refundLineAction, voidSaleAction } from "./actions";

const ctl = "min-h-11 w-full rounded-brand border border-line bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex min-h-11 items-center justify-center rounded-brand border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
    >
      Imprimir comprobante
    </button>
  );
}

export function PayBalanceForm({ saleId, balanceInput }: { saleId: string; balanceInput: string }) {
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState(balanceInput);
  const [reference, setReference] = useState("");
  return (
    <ActionForm action={payBalanceAction} className="grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="sale_id" value={saleId} />
      <label className="space-y-1">
        <span className="text-sm">Método</span>
        <select name="method" value={method} onChange={(e) => setMethod(e.target.value)} className={ctl} aria-label="Método del abono">
          <option value="cash">Efectivo</option>
          <option value="card">Tarjeta</option>
          <option value="transfer">Transferencia</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-sm">Importe (pesos)</span>
        <input name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={ctl} aria-label="Importe del abono" />
      </label>
      {method !== "cash" ? (
        <label className="space-y-1">
          <span className="text-sm">{method === "card" ? "Referencia de la terminal" : "Referencia (opcional)"}</span>
          <input name="reference" value={reference} onChange={(e) => setReference(e.target.value)} className={ctl} aria-label="Referencia del abono" autoComplete="off" />
        </label>
      ) : (
        <div />
      )}
      <div className="flex items-end">
        <SubmitButton>Registrar abono</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RefundLineForm({
  saleId,
  lineId,
  description,
  maxQty,
  isProduct,
}: {
  saleId: string;
  lineId: string;
  description: string;
  maxQty: number;
  isProduct: boolean;
}) {
  const [qty, setQty] = useState(String(maxQty));
  const [reason, setReason] = useState("");
  return (
    <details className="no-print mt-2 rounded-brand border border-line p-2">
      <summary className="cursor-pointer text-sm font-medium">Devolver {description}</summary>
      <ActionForm action={refundLineAction} className="mt-2 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="sale_id" value={saleId} />
        <input type="hidden" name="line_id" value={lineId} />
        <label className="space-y-1">
          <span className="text-xs text-muted">Cantidad (máx. {maxQty})</span>
          <input
            name="quantity"
            type="number"
            min={1}
            max={maxQty}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={ctl}
            aria-label={`Cantidad a devolver de ${description}`}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted">Reembolso en</span>
          <select name="method" defaultValue="cash" className={ctl} aria-label={`Método de reembolso de ${description}`}>
            <option value="cash">Efectivo</option>
            <option value="card">Tarjeta</option>
            <option value="transfer">Transferencia</option>
          </select>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs text-muted">Motivo</span>
          <input
            name="reason"
            required
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={ctl}
            aria-label={`Motivo de devolución de ${description}`}
          />
        </label>
        {isProduct ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="restock" defaultChecked aria-label={`Regresar ${description} al inventario`} /> Regresar al inventario
          </label>
        ) : null}
        <div className="sm:col-span-2">
          <SubmitButton variant="danger" confirm={`¿Registrar la devolución de ${description}?`}>
            Registrar devolución
          </SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}

export function VoidSaleForm({ saleId, folio }: { saleId: string; folio: number }) {
  // Controlados: conservan lo escrito si el servidor rechaza la cancelación.
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  return (
    <ActionForm action={voidSaleAction} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="sale_id" value={saleId} />
      <label className="space-y-1 sm:col-span-2">
        <span className="text-sm">Motivo de la cancelación</span>
        <input
          name="reason"
          required
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={ctl}
          aria-label="Motivo de la cancelación"
        />
      </label>
      <label className="space-y-1">
        <span className="text-sm">Escribe CANCELAR</span>
        <input
          name="confirm"
          required
          autoComplete="off"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className={ctl}
          aria-label="Confirmación de cancelación"
        />
      </label>
      <div className="sm:col-span-3">
        <SubmitButton
          variant="danger"
          confirm={`¿Cancelar por completo la venta folio ${folio}? Se regresa el inventario, se anulan sus tarjetas de regalo y se liberan anticipos. No se puede deshacer.`}
        >
          Cancelar venta
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
