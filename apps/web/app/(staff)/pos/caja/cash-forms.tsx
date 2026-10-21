"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { mxn } from "@/lib/format";
import { DENOMINATIONS, toBreakdown } from "../_lib/money";
import { closeCashAction, openCashAction } from "./actions";

const ctl = "min-h-11 w-full rounded-brand border border-line bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40";

/** Contador de billetes y monedas. Devuelve piezas por fila. */
function DenominationCounter({ pieces, onChange }: { pieces: Record<string, number>; onChange: (p: Record<string, number>) => void }) {
  const groups = [
    { title: "Billetes", kind: "bill" as const },
    { title: "Monedas", kind: "coin" as const },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map((g) => (
        <fieldset key={g.kind} className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{g.title}</legend>
          {DENOMINATIONS.filter((d) => d.kind === g.kind).map((d) => {
            const n = pieces[d.key] ?? 0;
            const name = `${g.kind === "bill" ? "Billetes" : "Monedas"} de ${d.label}`;
            return (
              <div key={d.key} className="grid grid-cols-[80px_1fr_110px] items-center gap-2">
                <span className="text-sm tabular-nums">{d.label}</span>
                <input
                  aria-label={name}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={n === 0 ? "" : n}
                  placeholder="0"
                  onChange={(e) => {
                    const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    onChange({ ...pieces, [d.key]: v });
                  }}
                  className={ctl}
                />
                <span className="text-right text-sm tabular-nums text-muted">{mxn(d.cents * n)}</span>
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

export function OpenCashForm({ next }: { next: string }) {
  const [useCounter, setUseCounter] = useState(false);
  const [float, setFloat] = useState("");
  const [pieces, setPieces] = useState<Record<string, number>>({});
  const { breakdown, totalCents } = useMemo(() => toBreakdown(pieces), [pieces]);
  return (
    <ActionForm action={openCashAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="breakdown" value={useCounter && totalCents > 0 ? JSON.stringify(breakdown) : ""} />
      {useCounter ? (
        <>
          <DenominationCounter pieces={pieces} onChange={setPieces} />
          <p className="text-sm">
            Fondo inicial: <strong data-testid="opening-total">{mxn(totalCents)}</strong>
          </p>
        </>
      ) : (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Fondo inicial (pesos)</span>
          <input name="float" value={float} onChange={(e) => setFloat(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${ctl} max-w-xs`} aria-label="Fondo inicial" />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={useCounter} onChange={(e) => setUseCounter(e.target.checked)} />
        Contar el fondo por billetes y monedas
      </label>
      <SubmitButton>Abrir caja</SubmitButton>
    </ActionForm>
  );
}

export function CloseCashForm({ sessionId, expectedCents }: { sessionId: string; expectedCents: number }) {
  const [pieces, setPieces] = useState<Record<string, number>>({});
  const { breakdown, totalCents } = useMemo(() => toBreakdown(pieces), [pieces]);
  const diff = totalCents - expectedCents;
  const [notes, setNotes] = useState("");
  return (
    <ActionForm action={closeCashAction} className="space-y-4">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="breakdown" value={JSON.stringify(breakdown)} />
      <input type="hidden" name="counted_cents" value={totalCents} />
      <DenominationCounter pieces={pieces} onChange={setPieces} />
      <dl className="grid grid-cols-3 gap-2 rounded-brand bg-surface-muted p-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Esperado (hasta ahora)</dt>
          <dd className="font-medium tabular-nums">{mxn(expectedCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Contado</dt>
          <dd className="font-medium tabular-nums" data-testid="counted-total">
            {mxn(totalCents)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Diferencia</dt>
          <dd className={`font-medium tabular-nums ${diff < 0 ? "text-danger" : diff > 0 ? "text-warning" : "text-success"}`}>{mxn(diff)}</dd>
        </div>
      </dl>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Notas del corte (opcional)</span>
        <textarea name="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${ctl} py-2`} aria-label="Notas del corte" />
      </label>
      <SubmitButton variant="danger" confirm={`¿Cerrar la caja con ${mxn(totalCents)} contados? Esta acción no se puede deshacer.`}>
        Cerrar caja
      </SubmitButton>
    </ActionForm>
  );
}
