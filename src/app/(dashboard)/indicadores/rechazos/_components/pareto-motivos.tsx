"use client"

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import type { RechazosAggMotivo, RechazoCategoria } from "@/lib/types/rechazos"
import { formatBultos, formatMonto, formatTasa } from "@/lib/format/rechazos"

const CATEGORIA_COLOR: Record<RechazoCategoria, string> = {
  "Logística":       "#f97316", // naranja
  "Ventas":          "#3b82f6", // azul
  "Cliente":         "#94a3b8", // gris
  "Interno":         "#a855f7", // violeta
  "Externo":         "#10b981", // verde
  "POR_CLASIFICAR":  "#cbd5e1", // gris claro
}

interface ParetoPoint {
  id: number
  label: string
  shortLabel: string
  categoria: RechazoCategoria
  controlable: boolean
  bultos: number
  eventos: number
  monto: number
  pct: number
  acumulado: number
}

export function ParetoMotivos({ por_motivo }: { por_motivo: RechazosAggMotivo[] }) {
  const top = por_motivo.slice(0, 10)
  const totalBultos = por_motivo.reduce((s, m) => s + m.bultos, 0)

  let acumulado = 0
  const points: ParetoPoint[] = top.map(m => {
    const pct = totalBultos > 0 ? (m.bultos / totalBultos) * 100 : 0
    acumulado += pct
    return {
      id: m.id_rechazo,
      label: m.ds_rechazo,
      shortLabel: shortenLabel(m.ds_rechazo),
      categoria: m.categoria,
      controlable: m.controlable,
      bultos: Math.round(m.bultos * 10) / 10,
      eventos: m.eventos,
      monto: m.monto,
      pct: Math.round(pct * 10) / 10,
      acumulado: Math.round(acumulado * 10) / 10,
    }
  })

  return (
    <Card className="border-slate-200">
      <CardContent className="p-3 md:p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Pareto de motivos</h2>
          <p className="text-xs text-muted-foreground">
            Bultos por motivo + % acumulado del total (top {top.length})
          </p>
        </div>

        {points.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Sin motivos en el período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 50, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="shortLabel"
                tick={{ fontSize: 10 }}
                stroke="#94a3b8"
                interval={0}
                angle={-32}
                textAnchor="end"
                height={60}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
                tickFormatter={(v) => formatBultos(v)}
                width={45}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
                width={38}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as ParetoPoint
                  return (
                    <div className="rounded-md border border-slate-200 bg-white p-2 text-xs shadow-md">
                      <div className="mb-1 font-semibold text-slate-900">{p.label}</div>
                      <div className="mb-1 text-[10px] text-muted-foreground">
                        {p.categoria}{p.controlable ? " · controlable" : ""}
                      </div>
                      <div className="space-y-0.5 text-slate-700">
                        <div>Bultos: <span className="font-medium tabular-nums">{formatBultos(p.bultos)}</span> ({formatTasa(p.pct)})</div>
                        <div>Eventos: <span className="font-medium tabular-nums">{formatBultos(p.eventos)}</span></div>
                        <div>Monto: <span className="font-medium tabular-nums">{formatMonto(p.monto)}</span></div>
                        <div>Acumulado: <span className="font-medium tabular-nums">{formatTasa(p.acumulado)}</span></div>
                      </div>
                    </div>
                  )
                }}
              />
              <Bar yAxisId="left" dataKey="bultos" radius={[3, 3, 0, 0]}>
                {points.map(p => (
                  <Cell key={p.id} fill={CATEGORIA_COLOR[p.categoria] ?? "#94a3b8"} />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="acumulado"
                name="% acumulado"
                stroke="#1e293b"
                strokeWidth={2}
                dot={{ r: 3, fill: "#1e293b" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
          {Object.entries(CATEGORIA_COLOR)
            .filter(([cat]) => points.some(p => p.categoria === cat))
            .map(([cat, color]) => (
              <span key={cat} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-slate-600">{cat}</span>
              </span>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}

function shortenLabel(s: string): string {
  if (s.length <= 16) return s
  return s.slice(0, 14).trimEnd() + "…"
}
