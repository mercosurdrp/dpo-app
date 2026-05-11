"use client"

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import type { RechazosAggCanal, TopVariacionDim } from "@/lib/types/rechazos"
import { formatBultos, formatMonto, formatTasa } from "@/lib/format/rechazos"

type DrillTo = { tipo: TopVariacionDim; id: string | number }

// Paleta con suficiente contraste para 7-10 canales
const CANAL_COLORS = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#22c55e", // green-500
  "#06b6d4", // cyan-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#64748b", // slate-500
  "#0d9488", // teal-600
]

interface PiePoint {
  name: string
  bultos: number
  eventos: number
  monto: number
  pct: number
}

export function DistribucionCanal({
  por_canal,
  onDrillTo,
}: {
  por_canal: RechazosAggCanal[]
  onDrillTo?: (drillTo: DrillTo) => void
}) {
  const points: PiePoint[] = por_canal.map(c => ({
    name: c.ds_canal_mkt,
    bultos: Math.round(c.bultos * 10) / 10,
    eventos: c.eventos,
    monto: c.monto,
    pct: Math.round(c.pct * 10) / 10,
  }))

  return (
    <Card className="border-slate-200">
      <CardContent className="p-3 md:p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Distribución por canal</h2>
          <p className="text-xs text-muted-foreground">Bultos rechazados por canal de venta</p>
        </div>

        {points.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Sin datos en el período
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={points}
                    dataKey="bultos"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={1}
                    isAnimationActive={false}
                    cursor={onDrillTo ? "pointer" : undefined}
                    onClick={onDrillTo ? (data) => {
                      const name = (data as unknown as PiePoint).name
                      if (name) onDrillTo({ tipo: "canal", id: name })
                    } : undefined}
                  >
                    {points.map((_, i) => (
                      <Cell key={i} fill={CANAL_COLORS[i % CANAL_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0].payload as PiePoint
                      return (
                        <div className="rounded-md border border-slate-200 bg-white p-2 text-xs shadow-md">
                          <div className="mb-1 font-semibold text-slate-900">{p.name}</div>
                          <div className="space-y-0.5 text-slate-700">
                            <div>Bultos: <span className="font-medium tabular-nums">{formatBultos(p.bultos)}</span> ({formatTasa(p.pct)})</div>
                            <div>Eventos: <span className="font-medium tabular-nums">{formatBultos(p.eventos)}</span></div>
                            <div>Monto: <span className="font-medium tabular-nums">{formatMonto(p.monto)}</span></div>
                          </div>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1.5 text-xs">
              {points.map((p, i) => {
                const ItemTag: "button" | "div" = onDrillTo ? "button" : "div"
                return (
                  <li key={p.name}>
                    <ItemTag
                      onClick={onDrillTo ? () => onDrillTo({ tipo: "canal", id: p.name }) : undefined}
                      className={`flex w-full items-center gap-2 text-left ${onDrillTo ? "rounded px-1 hover:bg-slate-50" : ""}`}
                    >
                      <span
                        className="h-2.5 w-2.5 flex-none rounded-sm"
                        style={{ backgroundColor: CANAL_COLORS[i % CANAL_COLORS.length] }}
                      />
                      <span className="flex-1 truncate text-slate-700">{p.name}</span>
                      <span className="tabular-nums text-slate-900">{formatTasa(p.pct)}</span>
                      <span className="tabular-nums text-muted-foreground">{formatBultos(p.bultos)}</span>
                    </ItemTag>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
