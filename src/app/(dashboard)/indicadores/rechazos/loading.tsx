/**
 * Skeleton full-page mientras corre `getRechazosComparado` (~400-800 ms en prod).
 * Server component sin JS — los skeletons usan animate-pulse de Tailwind.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      {/* Header con título + export btn */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skel className="h-8 w-72" />
          <Skel className="h-4 w-96" />
        </div>
        <Skel className="h-8 w-28" />
      </div>

      {/* Filtros bar */}
      <Skel className="h-28 w-full" />

      {/* Alertas (placeholder de 2 cards) */}
      <div className="space-y-2">
        <Skel className="h-16 w-full" />
        <Skel className="h-16 w-full" />
      </div>

      {/* KPI hero + cards grid 6 */}
      <div className="space-y-3">
        <Skel className="h-28 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skel key={i} className="h-24" />
          ))}
        </div>
      </div>

      {/* Top variaciones grid */}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <Skel className="h-4 w-48" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skel key={i} className="h-20" />
          ))}
        </div>
      </div>

      {/* Evolución temporal */}
      <Skel className="h-72 w-full" />

      {/* Pareto + canal 2-col */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skel className="h-80" />
        <Skel className="h-80" />
      </div>

      {/* Ranking choferes full-width */}
      <Skel className="h-96 w-full" />

      {/* Clientes + productos 2-col */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skel className="h-80" />
        <Skel className="h-80" />
      </div>
    </div>
  )
}

function Skel({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />
}
