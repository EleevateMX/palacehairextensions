export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="mx-auto max-w-2xl space-y-3">
      <div className="h-8 w-56 animate-pulse rounded-brand bg-surface-muted" />
      <div className="h-24 animate-pulse rounded-brand bg-surface-muted" />
      <div className="h-24 animate-pulse rounded-brand bg-surface-muted" />
    </div>
  );
}
