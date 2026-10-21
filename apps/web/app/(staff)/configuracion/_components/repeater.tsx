"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

export type RepeaterField = {
  name: string;
  label: string;
  type: "text" | "number" | "time" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
};

type Row = { key: number; values: Record<string, string> };

/**
 * Filas repetibles para formularios con Server Actions: cada campo se envía con el mismo
 * `name` en todas las filas (se lee con FormData.getAll). Las filas vacías se ignoran en el servidor.
 */
export function Repeater({
  fields,
  initial,
  addLabel = "Agregar",
  legend,
}: {
  fields: RepeaterField[];
  initial: Record<string, string>[];
  addLabel?: string;
  /** Texto accesible que distingue cada grupo (p. ej. el día de la semana). */
  legend: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((values, i) => ({ key: i, values })));
  const [next, setNext] = useState(initial.length);
  const add = () => {
    setRows((r) => [...r, { key: next, values: {} }]);
    setNext((n) => n + 1);
  };
  return (
    <div className="space-y-2">
      {rows.length === 0 ? <p className="text-sm text-muted">Sin registros.</p> : null}
      {rows.map((row, i) => (
        <div key={row.key} className="flex flex-wrap items-end gap-2">
          {fields.map((f) => {
            const label = `${f.label} ${legend} ${i + 1}`;
            return (
              <label key={f.name} className={`block space-y-1 ${f.className ?? "min-w-28 flex-1"}`}>
                <span className="text-xs text-muted">{f.label}</span>
                {f.type === "select" ? (
                  <select name={f.name} aria-label={label} defaultValue={row.values[f.name] ?? f.options?.[0]?.value} className={inputClass}>
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={f.name}
                    aria-label={label}
                    type={f.type === "number" ? "text" : f.type}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    placeholder={f.placeholder}
                    defaultValue={row.values[f.name] ?? ""}
                    className={inputClass}
                  />
                )}
              </label>
            );
          })}
          <button
            type="button"
            onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
            className="min-h-11 rounded-brand border border-line px-3 text-sm text-danger hover:bg-surface-muted"
            aria-label={`Quitar ${legend} ${i + 1}`}
          >
            Quitar
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="min-h-11 rounded-brand border border-dashed border-line px-3 text-sm hover:bg-surface-muted">
        + {addLabel}
      </button>
    </div>
  );
}
