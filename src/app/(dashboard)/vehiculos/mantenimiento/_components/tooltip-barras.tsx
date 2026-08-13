"use client"

// Tooltip común de los gráficos de barras del módulo de flota: respeta el tema
// (el de recharts viene con fondo blanco fijo y en modo oscuro queda ilegible),
// muestra el total y no imprime las series en cero.

import type { TooltipContentProps } from "recharts"

const fmtNum = (v: number) => new Intl.NumberFormat("es-AR").format(v)

type Props = Partial<TooltipContentProps<number, string>> & {
  /** Etiqueta del total; si es `null` no se muestra la fila de total. */
  totalLabel?: string | null
  /** Sufijo de las cantidades (por ejemplo " h" o " km"). */
  sufijo?: string
}

export function TooltipBarras({
  active,
  payload,
  label,
  totalLabel = "Total",
  sufijo = "",
}: Props) {
  if (!active || !payload?.length) return null
  const series = payload.filter((p) => Number(p.value ?? 0) !== 0)
  if (series.length === 0) return null
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0)

  return (
    <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-foreground">{label}</div>
      <div className="space-y-0.5">
        {series.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-sm"
              style={{ backgroundColor: p.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium tabular-nums text-foreground">
              {fmtNum(Number(p.value ?? 0))}
              {sufijo}
            </span>
          </div>
        ))}
        {totalLabel && series.length > 1 && (
          <div className="border-t pt-0.5 text-muted-foreground">
            {totalLabel}:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {fmtNum(total)}
              {sufijo}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
