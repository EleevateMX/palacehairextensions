import type { ReactNode } from "react";

/*
 * Componentes base con la identidad "Champagne Luxe".
 * Tarjetas blancas sobre marfil, títulos en Prata, acciones en negro (oro en modo oscuro).
 */

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: string; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <a href={back.href} className="mb-1 inline-block text-sm text-muted hover:text-fg">
            ← {back.label}
          </a>
        ) : null}
        <h1 className="text-3xl leading-tight md:text-[2rem]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 md:p-6 ${className}`}>
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="font-display text-xl">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "muted", progress, size = "md" }: {
  label: string;
  value: string;
  hint?: string;
  tone?: "muted" | "success" | "warning" | "danger";
  /** 0–100: barra dorada de avance (p. ej. ocupación). */
  progress?: number;
  /** "sm" para indicadores secundarios en rejillas angostas. */
  size?: "sm" | "md";
}) {
  const hintTone = { muted: "text-muted", success: "text-success", warning: "text-warning", danger: "text-danger" }[tone];
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 md:p-5">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 font-display tabular-nums ${size === "sm" ? "text-2xl" : "text-3xl"}`}>{value}</p>
      {typeof progress === "number" ? (
        <div className="mt-3 h-1 rounded-full bg-surface-muted" aria-hidden>
          <div className="h-1 rounded-full bg-gold" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
      {hint ? <p className={`mt-1 text-xs font-medium ${hintTone}`}>{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-8 text-center">
      <p className="font-display text-lg">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger/8 p-3 text-sm text-danger">
      {message}
    </div>
  );
}

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "dark" | "nude";

/** Píldora de estado: Confirmada (success), Apartado/Pendiente (warning), No asistió (danger), En servicio (dark/nude). */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-surface-muted text-fg",
    nude: "bg-nude text-fg",
    success: "bg-success/12 text-success",
    warning: "bg-warning/14 text-warning",
    danger: "bg-danger/10 text-danger",
    dark: "bg-accent text-accent-fg",
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-medium text-fg transition hover:border-gold disabled:opacity-50";
export const dangerButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-danger/40 bg-surface px-5 text-sm font-medium text-danger transition hover:bg-danger/5 disabled:opacity-50";
export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm outline-none transition placeholder:text-muted/70 focus:border-gold focus:ring-2 focus:ring-gold/25";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/** Pestañas subrayadas (expediente, configuración). */
export function Tabs({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return (
    <nav className="mb-5 flex gap-5 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <a
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm transition ${
            t.href === current ? "border-fg font-medium text-fg" : "border-transparent text-muted hover:text-fg"
          }`}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}

/** Control segmentado (Día / Semana / Estación; Servicios / Productos). */
export function Segmented({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="inline-flex rounded-xl bg-surface-muted p-1">
      {items.map((t) => (
        <a
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`rounded-lg px-4 py-1.5 text-sm transition ${t.key === current ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}

export function DataTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left">
          <tr className="border-b border-line">
            {head.map((h) => (
              <th key={h} className="eyebrow py-2.5 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

/** Inicial en círculo nude (clientas y personal). */
export function Avatar({ name, size = "md", dark = false }: { name: string; size?: "sm" | "md" | "lg"; dark?: boolean }) {
  const s = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-16 w-16 text-2xl" }[size];
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span aria-hidden className={`inline-flex flex-none items-center justify-center rounded-full font-display ${s} ${dark ? "bg-accent text-accent-fg" : "bg-nude text-fg"}`}>
      {initial}
    </span>
  );
}

/**
 * Color aproximado de un tono de extensión para la muestra (punto) junto a su nombre.
 * Escala estándar de la industria: 1 negro … 613 rubio platino. Es solo una referencia visual.
 */
export function toneColor(tone: string | null | undefined): string {
  const t = (tone ?? "").toLowerCase().trim();
  if (!t) return "#cfc6bb";
  if (/613|platin/.test(t)) return "#e8d7b0";
  if (/^1b|negro natural/.test(t)) return "#2b211c";
  if (/^1\b|^1$|negro/.test(t)) return "#171311";
  if (/^2\b|^2$/.test(t)) return "#3a2a22";
  if (/^3\b|^3$/.test(t)) return "#4b3326";
  if (/^4\b|^4$|castaño oscuro/.test(t)) return "#5b3b29";
  if (/^5\b|^5$/.test(t)) return "#6d4630";
  if (/^6\b|^6$|castaño/.test(t)) return "#7b5236";
  if (/^7\b|^7$/.test(t)) return "#8d6342";
  if (/^8\b|^8$|rubio oscuro/.test(t)) return "#a07a52";
  if (/^1[0-2]\b|rubio/.test(t)) return "#c4a272";
  if (/^(18|22|24|27)\b|miel/.test(t)) return "#c9a06a";
  if (/^(30|33)\b|cobr|rojiz/.test(t)) return "#8e4b2b";
  if (/^60\b|blanc|gris/.test(t)) return "#e4ddd0";
  return "#a08770";
}

/** Chip de tono: muestra de color + nombre. */
export function ToneChip({ tone, label, selected = false }: { tone: string | null | undefined; label?: string; selected?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
        selected ? "border-fg bg-nude font-medium" : "border-line bg-surface"
      }`}
    >
      <span aria-hidden className="h-4 w-4 flex-none rounded-full ring-1 ring-black/10" style={{ background: toneColor(tone) }} />
      {label ?? tone ?? "Sin tono"}
    </span>
  );
}

/** Punto de color de tono (para listas compactas). */
export function ToneDot({ tone }: { tone: string | null | undefined }) {
  return <span aria-hidden className="inline-block h-3.5 w-3.5 flex-none rounded-full ring-1 ring-black/10" style={{ background: toneColor(tone) }} />;
}

/** Fila etiqueta–valor (perfil capilar, desglose de pago). */
export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/** Indicador de pasos (Nueva cita, portal): número en círculo y línea entre pasos. */
export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol aria-label="Pasos" className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "next";
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden className="h-px w-6 bg-line" /> : null}
            <span
              aria-hidden
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                state === "next" ? "border border-line text-muted" : "bg-accent text-accent-fg"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={state === "next" ? "text-muted" : "font-medium"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Botón de horario: seleccionable en rejilla. */
export const slotButtonClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-sm transition hover:border-fg hover:bg-accent hover:text-accent-fg";
