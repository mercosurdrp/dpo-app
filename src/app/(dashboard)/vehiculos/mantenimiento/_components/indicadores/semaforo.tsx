// Una sola escala de semáforo para todo el tablero (texto, rellenos de SVG,
// pastillas), con su modo oscuro en clases: nada de JS de tema para pintar.

import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { MOTIVO_LABEL, type EstadoKpi, type MotivoSinJuzgar } from "./estado-kpi"

export const ESTADO_UI: Record<
  EstadoKpi,
  {
    label: string
    texto: string
    fill: string
    stroke: string
    bg: string
    pill: string
    Icon: typeof CheckCircle2
  }
> = {
  critico: {
    label: "Fuera de meta",
    texto: "text-red-600 dark:text-red-400",
    fill: "fill-red-500 dark:fill-red-400",
    stroke: "stroke-red-500 dark:stroke-red-400",
    bg: "bg-red-500",
    pill: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/25",
    Icon: XCircle,
  },
  alerta: {
    label: "Cerca de la meta",
    texto: "text-amber-600 dark:text-amber-400",
    fill: "fill-amber-500 dark:fill-amber-400",
    stroke: "stroke-amber-500 dark:stroke-amber-400",
    bg: "bg-amber-500",
    pill: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/25",
    Icon: AlertTriangle,
  },
  ok: {
    label: "En meta",
    texto: "text-emerald-600 dark:text-emerald-400",
    fill: "fill-emerald-500 dark:fill-emerald-400",
    stroke: "stroke-emerald-500 dark:stroke-emerald-400",
    bg: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25",
    Icon: CheckCircle2,
  },
  neutro: {
    label: "Sin juzgar",
    texto: "text-foreground",
    fill: "fill-slate-400 dark:fill-slate-500",
    stroke: "stroke-slate-400 dark:stroke-slate-500",
    bg: "bg-slate-300 dark:bg-slate-600",
    pill: "bg-muted text-muted-foreground ring-border",
    Icon: CircleDashed,
  },
}

/** Orden de gravedad para listas ("necesita atención", contadores). */
export const ORDEN_ESTADO: EstadoKpi[] = ["critico", "alerta", "ok", "neutro"]

/** Pastilla de estado: ícono + palabra, nunca sólo color. */
export function EstadoPill({
  estado,
  motivo,
  className,
}: {
  estado: EstadoKpi
  motivo?: MotivoSinJuzgar | null
  className?: string
}) {
  const ui = ESTADO_UI[estado]
  const Icon = ui.Icon
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        ui.pill,
        estado === "critico" && "font-semibold",
        className
      )}
      title={motivo ? `Sin juzgar: ${MOTIVO_LABEL[motivo]}` : undefined}
    >
      <Icon className="size-3.5" aria-hidden />
      {ui.label}
    </span>
  )
}
