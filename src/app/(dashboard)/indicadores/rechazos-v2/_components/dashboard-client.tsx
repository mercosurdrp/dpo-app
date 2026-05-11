"use client"

import type { RechazosComparado } from "@/lib/types/rechazos"
import { KpiCards } from "./kpi-cards"
import { formatFecha } from "@/lib/format/rechazos"

export function DashboardClient({ data }: { data: RechazosComparado }) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Rechazos Pampeana — Dashboard ejecutivo</h1>
        <p className="text-sm text-muted-foreground">
          Período: {formatFecha(data.meta.actual.desde)} → {formatFecha(data.meta.actual.hasta)}{" "}
          ({data.meta.actual.label}) · vs {data.meta.previous.label}
        </p>
      </header>

      <KpiCards data={data} />

      {/* Debug strip — desaparece en step 2 cuando llegan filtros + alertas */}
      <details className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium">Debug meta (step 1)</summary>
        <pre className="mt-2 overflow-x-auto">{JSON.stringify(data.meta, null, 2)}</pre>
      </details>
    </div>
  )
}
