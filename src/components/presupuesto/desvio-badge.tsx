import { Badge } from "@/components/ui/badge"

/**
 * Badge del % de desvío con los umbrales del módulo: verde <5%, ámbar <15%,
 * rojo ≥15% (los mismos que usa el generador de tareas desde el EERR).
 *
 * Vive acá y no en la página porque lo comparten el módulo de Presupuesto y el
 * bloque de desvíos de la reunión de presupuesto: el criterio de qué desvío es
 * grave se define una sola vez.
 */
export function DesvioBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) {
    return <span className="text-muted-foreground">—</span>
  }
  const abs = Math.abs(pct)
  const sign = pct > 0 ? "+" : ""
  if (abs < 5) {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        {sign}
        {pct.toFixed(1)}%
      </Badge>
    )
  }
  if (abs < 15) {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        {sign}
        {pct.toFixed(1)}%
      </Badge>
    )
  }
  return (
    <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
      {sign}
      {pct.toFixed(1)}%
    </Badge>
  )
}
