"use client"

import type { Alert, RechazosComparado } from "@/lib/types/rechazos"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Header } from "./header"
import { Filtros } from "./filtros"
import { AlertasBloque } from "./alertas-bloque"
import { KpiCards } from "./kpi-cards"

export function DashboardClient({ data }: { data: RechazosComparado }) {
  // Drill-down concreto llega en step 7. Mientras: log para validar wiring.
  const onDrillTo = (drillTo: NonNullable<Alert["drillTo"]>) => {
    // eslint-disable-next-line no-console
    console.info("[rechazos] drill-down pendiente (step 7):", drillTo)
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Header meta={data.meta} />
        <Filtros
          filterOptions={data.filter_options}
          defaultDesde={data.meta.actual.desde}
          defaultHasta={data.meta.actual.hasta}
        />
        <AlertasBloque alerts={data.alerts} onDrillTo={onDrillTo} />
        <KpiCards data={data} />
      </div>
    </TooltipProvider>
  )
}
