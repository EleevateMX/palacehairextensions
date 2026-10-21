export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-3">
      <div className="h-8 w-48 animate-pulse rounded-brand bg-surface-muted" />
      <div className="h-32 animate-pulse rounded-brand bg-surface-muted" />
    </div>
  );
}
