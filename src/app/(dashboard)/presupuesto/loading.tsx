/**
 * Esqueleto de /presupuesto mientras el servidor junta los datos (anual, EERR,
 * tareas, iniciativas, inversiones, KPIs). Sin esto el click en el menú no
 * mostraba nada hasta que llegaba la página entera y se sentía colgado.
 */
export default function PresupuestoLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Cargando presupuesto">
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 rounded bg-slate-200" />
        <div className="h-8 w-40 rounded bg-slate-200" />
      </div>
      <div className="h-9 w-full max-w-xl rounded bg-slate-100" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border bg-slate-50" />
        ))}
      </div>
      <div className="h-72 rounded-lg border bg-slate-50" />
      <div className="h-48 rounded-lg border bg-slate-50" />
    </div>
  )
}
