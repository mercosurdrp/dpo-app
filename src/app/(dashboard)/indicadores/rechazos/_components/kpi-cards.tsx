"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { RechazosComparado, RechazosDelta, RechazosKPI } from "@/lib/types/rechazos"
import { formatBultos, formatDelta, formatMonto, formatTasa } from "@/lib/format/rechazos"

type Sentiment = "bad" | "good" | "neutral"

interface CardSpec {
  key: keyof RechazosKPI
  label: string
  value: string
  sub?: string
  delta: { text: string; sentiment: Sentiment } | null
  badge?: { label: string; tooltip: string }
  asteriskTooltip?: string
}

export function KpiCards({ data }: { data: RechazosComparado }) {
  const cards = buildSpecs(data.actual, data.delta)
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {cards.map(c => (
        <Card key={c.key as string} className="border-slate-200">
          <CardContent className="space-y-1.5 p-3">
            <div className="flex items-start justify-between gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {c.label}
              </span>
              {c.badge && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge
                        variant="outline"
                        className="cursor-help border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] font-normal text-amber-700 leading-tight"
                      />
                    }
                  >
                    {c.badge.label}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px]">
                    {c.badge.tooltip}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="text-xl font-bold tabular-nums text-slate-900">{c.value}</div>
            <div className="flex items-baseline justify-between gap-1">
              {c.delta ? (
                <span className={`text-xs font-medium tabular-nums ${sentimentClass(c.delta.sentiment)}`}>
                  {c.delta.text}
                  {c.asteriskTooltip && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="ml-0.5 cursor-help text-slate-400">*</span>
                        }
                      />
                      <TooltipContent className="max-w-[300px]">
                        {c.asteriskTooltip}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
              {c.sub && <span className="text-[11px] text-muted-foreground">{c.sub}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function sentimentClass(s: Sentiment): string {
  switch (s) {
    case "bad":     return "text-red-600"
    case "good":    return "text-emerald-600"
    case "neutral": return "text-slate-500"
  }
}

function buildSpecs(a: RechazosKPI, d: RechazosDelta): CardSpec[] {
  const invalidated = d.comparison_invalidated_by ?? {}
  return [
    {
      key: "monto_neto",
      label: "Monto rechazado",
      value: formatMonto(a.monto_neto),
      sub: `${formatBultos(a.bultos)} bultos`,
      delta: { text: formatDelta(d.monto_neto_pct, "%"), sentiment: badIfUp(d.monto_neto_pct) },
    },
    {
      key: "eventos",
      label: "Eventos",
      value: formatBultos(a.eventos),
      sub: `${formatBultos(a.eventos_con_monto)} c/monto`,
      delta: { text: formatDelta(d.eventos_pct, "%"), sentiment: badIfUp(d.eventos_pct) },
    },
    {
      key: "tasa",
      label: "Tasa de rechazo",
      value: formatTasa(a.tasa),
      sub: "rech / entregados",
      delta: { text: formatDelta(d.tasa_pp, "pp"), sentiment: badIfUp(d.tasa_pp) },
      badge: {
        label: "Metodología en validación",
        tooltip:
          "Unidades de Chess (packs vs unidades sueltas) pendientes de validación. " +
          "La tasa puede tener un margen de error que se ajustará cuando cierre el análisis.",
      },
    },
    {
      key: "pct_controlable",
      label: "% Controlable",
      value: formatTasa(a.pct_controlable),
      sub: "Logística+Ventas+Interno",
      delta: { text: formatDelta(d.pct_controlable_pp, "pp"), sentiment: "neutral" },
      asteriskTooltip: invalidated.pct_controlable
        ? "Δ no comparable: catálogo de rechazos actualizado en mayo 2026. " +
          "Comparativa válida a partir de junio 2026 (mes calendario completo post-cambio)."
        : undefined,
    },
    {
      key: "ticket_promedio",
      label: "Ticket promedio",
      value: formatMonto(a.ticket_promedio),
      sub: "monto / evento",
      delta: { text: formatDelta(d.ticket_pct, "%"), sentiment: badIfUp(d.ticket_pct) },
    },
    {
      key: "clientes_afectados",
      label: "Clientes afectados",
      value: formatBultos(a.clientes_afectados),
      sub: "distintos",
      delta: { text: formatDelta(d.clientes_pct, "%"), sentiment: badIfUp(d.clientes_pct) },
    },
  ]
}

/** Para métricas donde subir es malo: up=rojo, down=verde, igual=neutral. */
function badIfUp(v: number): Sentiment {
  if (!Number.isFinite(v) || v === 0) return "neutral"
  return v > 0 ? "bad" : "good"
}
