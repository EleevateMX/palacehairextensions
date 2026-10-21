import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-brand border border-line bg-surface p-4 ${className}`}>
      {title ? <h2 className="mb-3 text-sm font-medium text-muted">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-brand border border-line bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-brand border border-dashed border-line p-8 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-brand border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
      {message}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const tones = {
    neutral: "bg-surface-muted text-fg",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
  } as const;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-brand bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50";
export const inputClass =
  "min-h-11 w-full rounded-brand border border-line bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <a
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${t.href === current ? "border-accent font-medium" : "border-transparent text-muted"}`}
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
        <thead className="text-left text-xs text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
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

export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-brand border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-muted";
