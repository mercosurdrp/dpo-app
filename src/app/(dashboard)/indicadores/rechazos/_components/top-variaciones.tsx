"use client"

import { TrendingDown, TrendingUp, Minus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { TopVariacion, TopVariaciones } from "@/lib/types/rechazos"
import { formatDelta, formatMonto, formatTasa } from "@/lib/format/rechazos"

type DrillTo = { tipo: TopVariacion["dim"]; id: string | number }

/**
 * Define qué dirección considera "buena" la UI para cada slot.
 * - subio → up es malo (peor situación)
 * - bajo → down es bueno (mejora)
 * - empeoro → up es malo
 * - mejoro → down es bueno
 */
type Slot = {
  key: keyof TopVariaciones
  title: string
  direction: "up_is_bad" | "down_is_good"
  emptyLabel: string
}

const SLOTS: Slot[] = [
  { key: "motivo_subio",   title: "Motivo que más subió",     direction: "up_is_bad",    emptyLabel: "Sin motivos al alza" },
  { key: "motivo_bajo",    title: "Motivo que más bajó",      direction: "down_is_good", emptyLabel: "Sin motivos a la baja" },
  { key: "chofer_empeoro", title: "Chofer que más empeoró",   direction: "up_is_bad",    emptyLabel: "Sin choferes que empeoraron" },
  { key: "chofer_mejoro",  title: "Chofer que más mejoró",    direction: "down_is_good", emptyLabel: "Sin choferes que mejoraron" },
  { key: "canal_subio",    title: "Canal que más subió",      direction: "up_is_bad",    emptyLabel: "Sin canales al alza" },
  { key: "canal_bajo",     title: "Canal que más bajó",       direction: "down_is_good", emptyLabel: "Sin canales a la baja" },
]

export function TopVariacionesBloque({
  top_variaciones,
  onDrillTo,
}: {
  top_variaciones: TopVariaciones
  onDrillTo?: (drillTo: DrillTo) => void
}) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-3 md:p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Mayores variaciones vs período anterior</h2>
          <p className="text-xs text-muted-foreground">
            Highlights accionables — click en cada uno para ver el detalle
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SLOTS.map(slot => {
            const v = top_variaciones[slot.key]
            return (
              <VariacionCell
                key={slot.key}
                slot={slot}
                variacion={v}
                onDrillTo={onDrillTo}
              />
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function VariacionCell({
  slot, variacion, onDrillTo,
}: {
  slot: Slot
  variacion: TopVariacion | null
  onDrillTo?: (drillTo: DrillTo) => void
}) {
  if (!variacion) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {slot.title}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{slot.emptyLabel}</div>
      </div>
    )
  }

  const sentiment = sentimentFor(variacion, slot.direction)
  const Icon = sentiment === "bad" ? TrendingUp : sentiment === "good" ? TrendingDown : Minus
  const iconColor = sentiment === "bad" ? "text-red-600" : sentiment === "good" ? "text-emerald-600" : "text-slate-500"
  const deltaColor = sentiment === "bad" ? "text-red-600" : sentiment === "good" ? "text-emerald-600" : "text-slate-500"

  const clickable = !!onDrillTo
  const Tag: "button" | "div" = clickable ? "button" : "div"

  const deltaText = variacion.baseline_was_zero
    ? "Nuevo (antes 0)"
    : formatDelta(variacion.delta_pct, "%")

  return (
    <Tag
      onClick={clickable ? () => onDrillTo({ tipo: variacion.dim, id: variacion.id }) : undefined}
      className={`rounded-lg border border-slate-200 bg-white p-3 text-left ${clickable ? "transition-shadow hover:shadow-sm cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {slot.title}
        </div>
        <Icon className={`h-4 w-4 flex-none ${iconColor}`} />
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-900" title={variacion.label}>
        {variacion.label}
      </div>
      <div className={`mt-1 text-xs font-medium tabular-nums ${deltaColor}`}>
        {deltaText}
        <span className="text-muted-foreground"> en {variacion.metric}</span>
        {variacion.baseline_low && !variacion.baseline_was_zero && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="ml-0.5 cursor-help text-slate-400">*</span>
              }
            />
            <TooltipContent className="max-w-[280px]">
              Baseline anterior bajo ({formatBaselineHint(variacion)}).
              El % puede estar inflado por denominador chico.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="mt-1 text-[11px] text-slate-600 tabular-nums">
        {formatValue(variacion.actual_value, variacion.metric)} vs{" "}
        {variacion.baseline_was_zero ? "0" : formatValue(variacion.previous_value, variacion.metric)}
      </div>
    </Tag>
  )
}

function sentimentFor(v: TopVariacion, dir: "up_is_bad" | "down_is_good"): "bad" | "good" | "neutral" {
  if (v.delta_abs === 0 || !Number.isFinite(v.delta_pct)) return "neutral"
  const up = v.delta_abs > 0
  if (dir === "up_is_bad")    return up ? "bad" : "good"
  if (dir === "down_is_good") return up ? "bad" : "good"
  return "neutral"
}

function formatValue(v: number, metric: TopVariacion["metric"]): string {
  if (metric === "tasa") return formatTasa(v)
  if (metric === "monto") return formatMonto(v)
  // bultos
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(v))
}

function formatBaselineHint(v: TopVariacion): string {
  if (v.metric === "monto") return `${formatMonto(v.previous_value)}, ${v.previous_eventos} eventos`
  if (v.metric === "tasa")  return `${v.previous_eventos} eventos en el período anterior`
  return `${v.previous_eventos} eventos`
}
