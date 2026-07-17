import type { ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import { DpoPuntoBadge } from "./dpo-badge"

/** Semáforo del módulo. Antes cada archivo inventaba sus rojos y ámbares con
 *  clases sueltas; acá hay una sola escala y respeta el tema (dark incluido). */
export type EstadoKpi = "ok" | "alerta" | "critico" | "neutro"

const VALOR_COLOR: Record<EstadoKpi, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  alerta: "text-amber-600 dark:text-amber-400",
  critico: "text-destructive",
  neutro: "text-foreground",
}

const ACENTO: Record<EstadoKpi, string> = {
  ok: "before:bg-emerald-500",
  alerta: "before:bg-amber-500",
  critico: "before:bg-destructive",
  neutro: "before:bg-border",
}

export interface KpiCardProps {
  label: string
  /** Valor ya formateado. `null`/`undefined` se muestra como “—”. */
  valor?: ReactNode
  sub?: ReactNode
  estado?: EstadoKpi
  /** Punto del pilar Flota que este KPI evidencia (ej. "2.1"). */
  dpo?: string
  /** Variación vs. período anterior: el signo decide la flecha; `mejora` decide el color. */
  delta?: number | null
  deltaLabel?: string
  mejora?: boolean
  footer?: ReactNode
  className?: string
  children?: ReactNode
  /** Hace la tarjeta clickeable (abre el detalle del KPI). */
  onClick?: () => void
}

/**
 * Tarjeta de KPI única del módulo de flota. Reemplaza las cinco variantes que
 * habían divergido (seguimiento, indicadores, neumáticos, tablero y gastos).
 */
export function KpiCard({
  label,
  valor,
  sub,
  estado = "neutro",
  dpo,
  delta,
  deltaLabel = "vs mes anterior",
  mejora,
  footer,
  className,
  children,
  onClick,
}: KpiCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
        ACENTO[estado],
        onClick &&
          "cursor-pointer transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      {/* CardHeader es un grid: pasa a dos columnas solo si hay un CardAction.
          Con flex-row el badge caía debajo del título y se estiraba. */}
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {dpo ? (
          <CardAction>
            <DpoPuntoBadge numero={dpo} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <p className={cn("text-2xl font-bold tabular-nums", VALOR_COLOR[estado])}>
            {valor ?? "—"}
          </p>
          {delta != null ? (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                delta === 0
                  ? "text-muted-foreground"
                  : mejora
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
              )}
            >
              {delta === 0 ? (
                <Minus className="size-3.5" aria-hidden />
              ) : delta > 0 ? (
                <ArrowUpRight className="size-3.5" aria-hidden />
              ) : (
                <ArrowDownRight className="size-3.5" aria-hidden />
              )}
              {deltaLabel}
            </span>
          ) : null}
        </div>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        {children}
        {footer ? <div className="pt-1">{footer}</div> : null}
      </CardContent>
    </Card>
  )
}
