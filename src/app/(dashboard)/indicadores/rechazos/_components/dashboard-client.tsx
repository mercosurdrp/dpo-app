"use client"

import type { RechazosComparado } from "@/lib/types/rechazos"
import { Header } from "./header"
import { Filtros } from "./filtros"
import { KpiCards } from "./kpi-cards"

export function DashboardClient({ data }: { data: RechazosComparado }) {
  return (
    <div className="space-y-4">
      <Header meta={data.meta} />
      <Filtros
        filterOptions={data.filter_options}
        defaultDesde={data.meta.actual.desde}
        defaultHasta={data.meta.actual.hasta}
      />
      <KpiCards data={data} />
    </div>
  )
}
