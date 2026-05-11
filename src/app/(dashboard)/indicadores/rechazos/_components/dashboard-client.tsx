"use client"

import type { Alert, RechazosComparado } from "@/lib/types/rechazos"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Header } from "./header"
import { Filtros } from "./filtros"
import { AlertasBloque } from "./alertas-bloque"
import { KpiCards } from "./kpi-cards"
import { EvolucionTemporal } from "./evolucion-temporal"
import { ParetoMotivos } from "./pareto-motivos"
import { DistribucionCanal } from "./distribucion-canal"
import { RankingChoferes } from "./ranking-choferes"
import { RankingClientes } from "./ranking-clientes"
import { RankingProductos } from "./ranking-productos"
import { TopVariacionesBloque } from "./top-variaciones"

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
        <TopVariacionesBloque top_variaciones={data.top_variaciones} onDrillTo={onDrillTo} />
        <EvolucionTemporal series={data.series} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ParetoMotivos por_motivo={data.agg.por_motivo} />
          <DistribucionCanal por_canal={data.agg.por_canal} />
        </div>
        <RankingChoferes
          por_chofer={data.agg.por_chofer}
          tasaPromedio={data.actual.tasa}
          onDrillTo={onDrillTo}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RankingClientes por_cliente={data.agg.por_cliente} onDrillTo={onDrillTo} />
          <RankingProductos por_producto={data.agg.por_producto} onDrillTo={onDrillTo} />
        </div>
      </div>
    </TooltipProvider>
  )
}
