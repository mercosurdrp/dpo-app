"use client"

import { useCallback, useRef, useState } from "react"
import type { RechazosComparado, TopVariacionDim, DrillDim } from "@/lib/types/rechazos"
import type { RechazoPlan } from "@/actions/rechazos-planes"
import { formatFecha } from "@/lib/format/rechazos"
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
import { DrillDownSheet, type DrillTo } from "./drill-down-sheet"
import { EmptyState } from "./empty-state"
import { PreventaBloque } from "./preventa-bloque"
import { PlanesAccionBloque } from "./planes/planes-accion-bloque"
import type { PlanFocoInicial } from "./planes/plan-form-dialog"

export function DashboardClient({
  data,
  planesIniciales,
}: {
  data: RechazosComparado
  planesIniciales: RechazoPlan[]
}) {
  const [drillTo, setDrillTo] = useState<DrillTo | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const abrirPlanConFocoRef = useRef<((foco: PlanFocoInicial) => void) | null>(null)

  const resolveLabel = useCallback((tipo: TopVariacionDim, id: string | number): string | undefined => {
    switch (tipo) {
      case "motivo":
        return data.filter_options.motivos.find(m => m.id_rechazo === id)?.ds_rechazo
      case "chofer":
        return data.filter_options.fleteros.find(f => f.patente === id)?.chofer_display
      case "cliente":
        return data.agg.por_cliente.find(c => c.id_cliente === id)?.nombre_cliente ?? undefined
      case "producto":
        return data.agg.por_producto.find(p => p.id_articulo === id)?.ds_articulo
      case "canal":
        return String(id)
      default:
        return undefined
    }
  }, [data])

  const openDrill = useCallback((d: { tipo: DrillDim; id: string | number; label?: string }) => {
    const label = d.label ?? (d.tipo !== "fecha" ? resolveLabel(d.tipo, d.id) : undefined)
    setDrillTo({ tipo: d.tipo, id: d.id, label })
    setSheetOpen(true)
  }, [resolveLabel])

  const empty = data.actual.eventos === 0

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Header meta={data.meta} />
        <Filtros
          filterOptions={data.filter_options}
          defaultDesde={data.meta.actual.desde}
          defaultHasta={data.meta.actual.hasta}
        />

        {empty ? (
          <EmptyState filtersApplied={data.meta.filters_applied} hasta={data.meta.actual.hasta} />
        ) : (
          <>
            <AlertasBloque alerts={data.alerts} onDrillTo={openDrill} />
            <KpiCards data={data} />
            <TopVariacionesBloque top_variaciones={data.top_variaciones} onDrillTo={openDrill} />
            <EvolucionTemporal
              series={data.series}
              onDrillDia={(fecha) => openDrill({ tipo: "fecha", id: fecha, label: formatFecha(fecha) })}
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ParetoMotivos por_motivo={data.agg.por_motivo} onDrillTo={openDrill} />
              <DistribucionCanal por_canal={data.agg.por_canal} onDrillTo={openDrill} />
            </div>
            <RankingChoferes
              por_chofer={data.agg.por_chofer}
              tasaPromedio={data.actual.tasa}
              onDrillTo={openDrill}
            />
            <PreventaBloque
              preventa={data.preventa}
              labelActual={data.meta.actual.label}
              labelPrevious={data.meta.previous.label}
              onDrillTo={openDrill}
              onCrearPlan={(foco) => abrirPlanConFocoRef.current?.(foco)}
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <RankingClientes por_cliente={data.agg.por_cliente} onDrillTo={openDrill} />
              <RankingProductos por_producto={data.agg.por_producto} onDrillTo={openDrill} />
            </div>
          </>
        )}

        <PlanesAccionBloque
          planesIniciales={planesIniciales}
          motivos={data.filter_options.motivos.map((m) => ({
            id_rechazo: m.id_rechazo,
            ds_rechazo: m.ds_rechazo,
          }))}
          clientes={data.agg.por_cliente.map((c) => ({
            id_cliente: c.id_cliente,
            nombre_cliente: c.nombre_cliente,
          }))}
          vendedores={data.preventa.por_vendedor.map((v) => ({
            id_vendedor: v.id_vendedor,
            ds_vendedor: v.ds_vendedor,
          }))}
          abrirNuevoConFocoRef={abrirPlanConFocoRef}
        />
      </div>

      <DrillDownSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        drillTo={drillTo}
        desde={data.meta.actual.desde}
        hasta={data.meta.actual.hasta}
        filters={data.meta.filters_applied}
      />
    </TooltipProvider>
  )
}
