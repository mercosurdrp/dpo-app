"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { RechazosComparado } from "@/lib/types/rechazos"
import { formatBultos, formatMonto, formatTasa } from "@/lib/format/rechazos"

/**
 * Step 1 (crudo): muestra los 6 KPIs sin deltas ni badges. Deltas+flags llegan en step 3.
 */
export function KpiCards({ data }: { data: RechazosComparado }) {
  const a = data.actual
  const cards: { label: string; value: string; sub?: string }[] = [
    { label: "Monto rechazado", value: formatMonto(a.monto_neto), sub: `${formatBultos(a.bultos)} bultos` },
    { label: "Eventos", value: formatBultos(a.eventos), sub: `${formatBultos(a.eventos_con_monto)} con monto` },
    { label: "Tasa de rechazo", value: formatTasa(a.tasa), sub: "bultos rech. / entregados" },
    { label: "% Controlable", value: formatTasa(a.pct_controlable), sub: "Logística + Ventas + Interno" },
    { label: "Ticket promedio", value: formatMonto(a.ticket_promedio), sub: "monto / evento c/monto" },
    { label: "Clientes afectados", value: formatBultos(a.clientes_afectados), sub: "distintos en el período" },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {cards.map(c => (
        <Card key={c.label} className="border-slate-200">
          <CardContent className="space-y-1 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {c.label}
            </div>
            <div className="text-xl font-bold tabular-nums text-slate-900">{c.value}</div>
            {c.sub && <div className="text-xs text-muted-foreground">{c.sub}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
