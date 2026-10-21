import type { ReactNode } from "react";
import { type Period, presets } from "@/lib/period";
import { buttonClass, inputClass, secondaryButtonClass } from "./ui";

/** Selector de periodo (GET): fechas locales del salón, ambos extremos incluidos. */
export function PeriodFilter({ period, basePath, children }: { period: Period; basePath: string; children?: ReactNode }) {
  return (
    <div className="mb-6 space-y-3">
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-sm font-medium">Desde</span>
          <input type="date" name="desde" defaultValue={period.from} required className={inputClass} />
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-medium">Hasta</span>
          <input type="date" name="hasta" defaultValue={period.to} required className={inputClass} />
        </label>
        <button className={buttonClass}>Aplicar</button>
        {children}
      </form>
      <nav aria-label="Periodos rápidos" className="flex flex-wrap gap-2">
        {presets().map((p) => {
          const active = p.from === period.from && p.to === period.to;
          return (
            <a
              key={p.label}
              href={`${basePath}?desde=${p.from}&hasta=${p.to}`}
              aria-current={active ? "true" : undefined}
              className={`rounded-full border px-3 py-1 text-xs ${active ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:bg-surface-muted"}`}
            >
              {p.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

/** Barra horizontal accesible: el valor numérico siempre va en texto junto a la barra. */
export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 min-w-16 flex-1 rounded-full bg-surface-muted" aria-hidden="true">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${width}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs tabular-nums">{label}</span>
    </div>
  );
}

export function ExportLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={`${secondaryButtonClass} min-h-9 px-3 text-xs`} download>
      {children}
    </a>
  );
}

export const td = "py-2 pr-3 align-top";
export const tdNum = "py-2 pr-3 text-right tabular-nums align-top";
