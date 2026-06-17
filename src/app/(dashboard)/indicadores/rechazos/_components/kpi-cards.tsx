"use client"

import { useState } from "react"
import { BarChart3 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { RechazosComparado, RechazosDelta, RechazosKPI } from "@/lib/types/rechazos"
import { formatBultos, formatDelta, formatHl, formatMonto, formatTasa } from "@/lib/format/rechazos"
import { BultosDiaDialog } from "./bultos-dia-dialog"

type Sentiment = "bad" | "good" | "neutral"

interface CardSpec {
  key: keyof RechazosKPI
  label: string
  value: string
  sub?: string
  delta: { text: string; sentiment: Sentiment } | null
  asteriskTooltip?: string
}

export function KpiCards({ data }: { data: RechazosComparado }) {
  const a = data.actual
  const d = data.delta
  const hero = buildHero(a, d)
  const cards = buildSecondarySpecs(a, d)
  const [bultosDiaOpen, setBultosDiaOpen] = useState(false)
  return (
    <div className="space-y-3">
      {/* Hero — KPI principal (tasa en HL) */}
      <Card className="border-slate-200">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              % de rechazo del período (HL)
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums text-slate-900">{formatTasa(a.tasa)}</span>
              <span className={`text-sm font-medium tabular-nums ${sentimentClass(hero.deltaSentiment)}`}>
                {hero.deltaText}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-slate-700">{formatHl(a.hl)}</span> rechazados
              {" / "}
              <span className="font-medium text-slate-700">{formatHl(a.total_hl_entregados)}</span> entregados
            </div>
            <button
              type="button"
              onClick={() => setBultosDiaOpen(true)}
              title="Ver bultos por día"
              className="group flex items-center gap-1 rounded text-left text-[11px] text-muted-foreground transition-colors hover:text-slate-900"
            >
              <span>
                Bultos: <span className="font-medium text-slate-600 underline decoration-dotted underline-offset-2 group-hover:text-slate-900">{formatBultos(a.bultos)}</span>
                {" / "}{formatBultos(a.total_entregados)} entregados
                {" · "}tasa <span className="font-medium text-slate-600">{formatTasa(a.tasa_bultos)}</span>
              </span>
              <BarChart3 className="size-3 text-slate-400 group-hover:text-slate-700" />
            </button>
          </div>
        </CardContent>
      </Card>

      <BultosDiaDialog
        open={bultosDiaOpen}
        onOpenChange={setBultosDiaOpen}
        desde={data.meta.actual.desde}
        hasta={data.meta.actual.hasta}
      />

      {/* Cards de soporte */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map(c => (
          <Card key={c.key as string} className="border-slate-200">
            <CardContent className="space-y-1.5 p-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {c.label}
              </span>
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

function buildHero(a: RechazosKPI, d: RechazosDelta): { deltaText: string; deltaSentiment: Sentiment } {
  return {
    deltaText: `${formatDelta(d.tasa_pp, "pp")} vs anterior`,
    deltaSentiment: badIfUp(d.tasa_pp),
  }
}

function buildSecondarySpecs(a: RechazosKPI, d: RechazosDelta): CardSpec[] {
  const invalidated = d.comparison_invalidated_by ?? {}
  return [
    {
      key: "monto_neto",
      label: "Monto rechazado",
      value: formatMonto(a.monto_neto),
      sub: "neto sin IVA",
      delta: { text: formatDelta(d.monto_neto_pct, "%"), sentiment: badIfUp(d.monto_neto_pct) },
    },
    {
      key: "total_hl_entregados",
      label: "HL entregados",
      value: formatHl(a.total_hl_entregados),
      sub: `${formatBultos(a.total_entregados)} bultos`,
      // Más entregados es bueno, menos es malo (es signo de que se vendió).
      delta: { text: formatDelta(d.total_hl_entregados_pct, "%"), sentiment: goodIfUp(d.total_hl_entregados_pct) },
    },
    {
      key: "eventos",
      label: "Eventos",
      value: formatBultos(a.eventos),
      sub: `${formatBultos(a.eventos_con_monto)} c/monto`,
      delta: { text: formatDelta(d.eventos_pct, "%"), sentiment: badIfUp(d.eventos_pct) },
    },
    {
      key: "pct_controlable",
      label: "% Controlable",
      value: formatTasa(a.pct_controlable),
      sub: "Log+Vta+Int",
      delta: { text: formatDelta(d.pct_controlable_pp, "pp"), sentiment: "neutral" },
      asteriskTooltip: invalidated.pct_controlable
        ? "Δ no comparable: catálogo de rechazos actualizado en mayo 2026. " +
          "Comparativa válida a partir de junio 2026 (mes calendario completo post-cambio)."
        : undefined,
    },
    {
      key: "clientes_afectados",
      label: "Clientes afectados",
      value: formatBultos(a.clientes_afectados),
      sub: "distintos",
      delta: { text: formatDelta(d.clientes_pct, "%"), sentiment: badIfUp(d.clientes_pct) },
    },
    {
      key: "ticket_promedio",
      label: "Ticket promedio",
      value: formatMonto(a.ticket_promedio),
      sub: "monto / evento",
      delta: { text: formatDelta(d.ticket_pct, "%"), sentiment: badIfUp(d.ticket_pct) },
    },
  ]
}

/** Para métricas donde subir es malo: up=rojo, down=verde, igual=neutral. */
function badIfUp(v: number): Sentiment {
  if (!Number.isFinite(v) || v === 0) return "neutral"
  return v > 0 ? "bad" : "good"
}

/** Para métricas donde subir es bueno: up=verde, down=rojo. */
function goodIfUp(v: number): Sentiment {
  if (!Number.isFinite(v) || v === 0) return "neutral"
  return v > 0 ? "good" : "bad"
}
