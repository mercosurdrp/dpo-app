"use client"

import { useTransition } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Filter, InboxIcon, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RechazosFilters } from "@/lib/types/rechazos"

/**
 * Mostrado cuando `actual.eventos === 0`. Diferencia entre "rango sin actividad"
 * y "filtros muy restrictivos" según si hay filtros aplicados o no.
 */
export function EmptyState({ filtersApplied, hasta }: { filtersApplied: RechazosFilters; hasta: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const hasFilters = Object.values(filtersApplied).some(v => Array.isArray(v) && v.length > 0)
  const today = todayISOInART()
  const periodoFuturo = hasta > today

  const clearFilters = () => {
    startTransition(() => router.push(pathname))
  }

  if (periodoFuturo) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center">
        <InboxIcon className="h-8 w-8 text-slate-400" />
        <div className="text-sm font-medium text-slate-700">Período en el futuro</div>
        <p className="text-xs text-muted-foreground max-w-md">
          El rango incluye fechas futuras: aún no hay rechazos registrados. Cambiá el filtro de fechas a un período pasado.
        </p>
      </div>
    )
  }

  if (hasFilters) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-8 text-center">
        <Filter className="h-8 w-8 text-amber-500" />
        <div className="text-sm font-medium text-amber-900">Sin resultados para los filtros aplicados</div>
        <p className="text-xs text-amber-700 max-w-md">
          Probá quitar filtros, ampliar el rango de fechas o revisar las combinaciones seleccionadas.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={clearFilters}
          disabled={isPending}
          className="mt-2 h-8 gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Limpiar filtros
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <InboxIcon className="h-8 w-8 text-slate-400" />
      <div className="text-sm font-medium text-slate-700">Sin rechazos en el período</div>
      <p className="text-xs text-muted-foreground max-w-md">
        No hay rechazos registrados entre las fechas seleccionadas. Probá ampliar el rango.
      </p>
    </div>
  )
}

function todayISOInART(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}
