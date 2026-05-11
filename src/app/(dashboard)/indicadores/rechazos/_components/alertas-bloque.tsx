"use client"

import { AlertTriangle, AlertCircle, CheckCircle2, Info } from "lucide-react"
import type { Alert, AlertEvaluation } from "@/lib/types/rechazos"

const STYLE_BY_SEVERITY = {
  rojo:     { wrap: "border-red-200 bg-red-50",     icon: "text-red-600",     title: "text-red-900",     detail: "text-red-700"    },
  amarillo: { wrap: "border-amber-200 bg-amber-50", icon: "text-amber-600",   title: "text-amber-900",   detail: "text-amber-700"  },
  verde:    { wrap: "border-emerald-200 bg-emerald-50", icon: "text-emerald-600", title: "text-emerald-900", detail: "text-emerald-700" },
} as const

function IconForSeverity({ s, className }: { s: keyof typeof STYLE_BY_SEVERITY; className?: string }) {
  if (s === "rojo")     return <AlertTriangle className={className} />
  if (s === "amarillo") return <AlertCircle    className={className} />
  return <CheckCircle2 className={className} />
}

export function AlertasBloque({
  alerts,
  onDrillTo,
}: {
  alerts: { items: Alert[]; tendencia_evaluation: AlertEvaluation }
  onDrillTo?: (drillTo: NonNullable<Alert["drillTo"]>) => void
}) {
  const items = alerts.items
  const tendenciaPending = alerts.tendencia_evaluation === "insufficient_history"

  if (items.length === 0 && !tendenciaPending) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Sin alertas activas en el período.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((a, idx) => {
        const sty = STYLE_BY_SEVERITY[a.severity]
        const clickable = !!a.drillTo && !!onDrillTo
        const Tag: "button" | "div" = clickable ? "button" : "div"
        return (
          <Tag
            key={idx}
            onClick={clickable ? () => onDrillTo!(a.drillTo!) : undefined}
            className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${sty.wrap} ${clickable ? "transition-shadow hover:shadow-sm" : ""}`}
          >
            <IconForSeverity s={a.severity} className={`mt-0.5 h-5 w-5 flex-none ${sty.icon}`} />
            <div className="flex-1 space-y-0.5">
              <div className={`text-sm font-semibold ${sty.title}`}>{a.title}</div>
              {a.context_summary && (
                <div className={`text-xs ${sty.detail}`}>{a.context_summary}</div>
              )}
              {a.detail && (
                <div className={`text-[11px] opacity-80 ${sty.detail}`}>{a.detail}</div>
              )}
            </div>
            {clickable && (
              <span className={`text-xs font-medium ${sty.detail} hidden md:block`}>
                Ver detalle →
              </span>
            )}
          </Tag>
        )
      })}
      {tendenciaPending && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-slate-400" />
          Histórico insuficiente para evaluar tendencia a 3 períodos consecutivos.
        </div>
      )}
    </div>
  )
}
