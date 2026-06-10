"use client"

import { useState } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { RechazosComparado } from "@/lib/types/rechazos"
import { formatBultos, formatFecha, formatHl, formatMonto, formatTasa } from "@/lib/format/rechazos"

type View = "dia" | "semana"

interface Point {
  key: string
  label: string
  hl: number
  bultos: number
  monto: number
  eventos: number
  tasa: number
}

export function EvolucionTemporal({
  series,
  onDrillDia,
}: {
  series: RechazosComparado["series"]
  /** Clic en una columna (día con rechazos) → abre el detalle de ese día. */
  onDrillDia?: (fecha: string) => void
}) {
  const hasSemanaMultiple = series.por_semana.length >= 2
  const [view, setView] = useState<View>(hasSemanaMultiple ? "dia" : "dia")
  const drillEnabled = view === "dia" && !!onDrillDia

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartClick = (state: any) => {
    if (!drillEnabled) return
    const p = state?.activePayload?.[0]?.payload as Point | undefined
    if (!p || p.eventos <= 0) return
    onDrillDia!(p.key)
  }

  const points: Point[] = view === "dia"
    ? series.por_dia.map(p => ({
        key: p.fecha,
        label: formatFechaShortDM(p.fecha),
        hl: round2(p.hl),
        bultos: round1(p.bultos),
        monto: p.monto,
        eventos: p.eventos,
        tasa: round2(p.tasa),
      }))
    : series.por_semana.map(p => ({
        key: p.semana,
        label: p.semana.slice(-3), // "W18"
        hl: round2(p.hl),
        bultos: round1(p.bultos),
        monto: p.monto,
        eventos: p.eventos,
        tasa: round2(p.tasa),
      }))

  return (
    <Card className="border-slate-200">
      <CardContent className="p-3 md:p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Evolución temporal</h2>
            <p className="text-xs text-muted-foreground">
              HL rechazados + tasa% por {view === "dia" ? "día" : "semana"}
              {drillEnabled && (
                <span className="ml-1 text-slate-400">· tocá una columna para ver clientes y bultos</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-200 p-0.5">
            <Button
              size="sm"
              variant={view === "dia" ? "default" : "ghost"}
              onClick={() => setView("dia")}
              className="h-7 px-2 text-xs"
            >
              Día
            </Button>
            <Button
              size="sm"
              variant={view === "semana" ? "default" : "ghost"}
              onClick={() => setView("semana")}
              disabled={!hasSemanaMultiple}
              className="h-7 px-2 text-xs"
            >
              Semana
            </Button>
          </div>
        </div>

        {points.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Sin datos en el período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={points}
              margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              onClick={drillEnabled ? handleChartClick : undefined}
              className={drillEnabled ? "cursor-pointer" : undefined}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
                tickFormatter={(v) => formatBultos(v)}
                width={50}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
                tickFormatter={(v) => `${v}%`}
                width={38}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as Point
                  return (
                    <div className="rounded-md border border-slate-200 bg-white p-2 text-xs shadow-md">
                      <div className="mb-1 font-semibold text-slate-900">
                        {view === "dia" ? formatFecha(p.key) : `Semana ${label}`}
                      </div>
                      <div className="space-y-0.5 text-slate-700">
                        <div>HL: <span className="font-medium tabular-nums">{formatHl(p.hl)}</span></div>
                        <div>Bultos: <span className="font-medium tabular-nums">{formatBultos(p.bultos)}</span></div>
                        <div>Eventos: <span className="font-medium tabular-nums">{formatBultos(p.eventos)}</span></div>
                        <div>Monto: <span className="font-medium tabular-nums">{formatMonto(p.monto)}</span></div>
                        <div>Tasa: <span className="font-medium tabular-nums">{formatTasa(p.tasa)}</span></div>
                      </div>
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="hl" name="HL rechazados" fill="#fca5a5" radius={[3, 3, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="tasa"
                name="Tasa %"
                stroke="#1e293b"
                strokeWidth={2}
                dot={{ r: 3, fill: "#1e293b" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function formatFechaShortDM(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[2]}/${m[1]}` : iso
}
function round1(v: number) { return Math.round(v * 10) / 10 }
function round2(v: number) { return Math.round(v * 100) / 100 }
