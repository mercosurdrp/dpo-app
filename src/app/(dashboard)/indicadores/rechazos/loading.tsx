/**
 * Skeleton full-page mientras corre `getRechazosComparado` (warm ~800ms cold ~1.5s).
 * Server component — sin estado, sin animaciones JS.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
      <div className="space-y-3">
        <div className="h-8 w-72 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  )
}
