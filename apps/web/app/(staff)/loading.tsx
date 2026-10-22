/** Esqueleto inmediato mientras el servidor prepara la pantalla (se siente instantáneo al cambiar de módulo). */
export default function StaffLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="animate-pulse space-y-4">
      <div className="h-9 w-64 max-w-full rounded-xl bg-surface-muted" />
      <div className="h-4 w-40 rounded bg-surface-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-surface-muted" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-surface-muted" />
    </div>
  );
}
