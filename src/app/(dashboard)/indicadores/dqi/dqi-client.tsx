"use client"

import { useState, useTransition } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Truck, RefreshCw, TrendingUp, TrendingDown, Package2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { getDqi, type DqiData } from "@/actions/dqi"

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const MESES_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

const fmtPPM = (n: number | null | undefined) =>
  n == null ? "—" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)} PPM`
const fmtHL = (n: number | null | undefined) =>
  n == null ? "—" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)} HL`
const fmtPesos = (n: number | null | undefined) => {
  if (n == null) return "—"
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

interface Props {
  initial: DqiData
  initialYear: number
  initialMonth: number
}

export function DqiClient({ initial, initialYear, initialMonth }: Props) {
  const [data, setData] = useState<DqiData>(initial)
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const reload = (y: number, m: number) => {
    setYear(y)
    setMonth(m)
    startTransition(async () => {
      const res = await getDqi(y, m)
      if ("error" in res) {
        setError(res.error)
      } else {
        setError(null)
        setData(res.data)
      }
    })
  }

  const dqi = data.dqi
  const det = data.detalle
  const vsLy = dqi.vs_ly_pct

  // Serie para el gráfico: Real vs LY
  const chartData = MESES.map((m, i) => ({
    mes: m,
    [`Real ${year}`]: dqi.serie_real?.[i] != null ? +(+dqi.serie_real[i]!).toFixed(1) : null,
    [`LY ${year - 1}`]: dqi.serie_ly?.[i] != null ? +(+dqi.serie_ly[i]!).toFixed(1) : null,
  }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-600">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">DQI · Calidad de entrega</h1>
            <p className="text-sm text-muted-foreground">
              Roturas en distribución (ruta) ÷ HL entregados · Pilar Entrega DPO 1.4
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => reload(year, +e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {MESES_FULL.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => reload(+e.target.value, month)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => reload(year, month)}
            disabled={pending}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Recargar"
          >
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      {/* Métricas del mes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">DQI · {MESES_FULL[month - 1]}</p>
            <p className="text-3xl font-bold text-emerald-700">{fmtPPM(dqi.mes)}</p>
            {vsLy != null && (
              <p className={`mt-1 inline-flex items-center gap-0.5 text-xs font-medium ${vsLy < 0 ? "text-emerald-600" : "text-red-500"}`}>
                {vsLy < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                {vsLy >= 0 ? "+" : ""}{vsLy.toFixed(1)}% vs año anterior
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Acumulado {year}</p>
            <p className="text-3xl font-bold text-slate-800">{fmtPPM(dqi.anual_acum)}</p>
            <p className="mt-1 text-xs text-slate-400">LY: {fmtPPM(dqi.ly_anual)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">HL rotos en ruta</p>
            <p className="text-3xl font-bold text-slate-800">{fmtHL(det.hl_mes)}</p>
            <p className="mt-1 text-xs text-slate-400">{fmtPesos(det.valor_mes)} en el mes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">% de las roturas</p>
            <p className="text-3xl font-bold text-slate-800">
              {det.pct_de_roturas != null ? `${det.pct_de_roturas}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">del total de roturas y derrames</p>
          </CardContent>
        </Card>
      </div>

      {/* Evolución mensual */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Evolución mensual · DQI (PPM)</h2>
            <span className="text-[11px] text-slate-400">Real {year} vs {year - 1}</span>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v) => fmtPPM(Number(v))} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                <Line type="monotone" dataKey={`Real ${year}`} stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey={`LY ${year - 1}`} stroke="#94a3b8" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top SKUs rotos en ruta */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center gap-2">
            <Package2 className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-700">
              Top SKUs rotos en ruta · {MESES_FULL[month - 1]} {year}
            </h2>
          </div>
          {det.top_skus?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-2 py-2 text-left font-medium">SKU</th>
                  <th className="px-2 py-2 text-right font-medium">Unidades</th>
                  <th className="px-2 py-2 text-right font-medium">HL</th>
                  <th className="px-2 py-2 text-right font-medium">$</th>
                </tr>
              </thead>
              <tbody>
                {det.top_skus.map((s) => (
                  <tr key={s.codigo} className="border-b border-slate-50">
                    <td className="px-2 py-2 text-slate-700">{s.descripcion}</td>
                    <td className="px-2 py-2 text-right font-mono text-slate-600">
                      {new Intl.NumberFormat("es-AR").format(s.unidades)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-emerald-700">{fmtHL(s.hl)}</td>
                    <td className="px-2 py-2 text-right font-mono text-slate-700">{fmtPesos(s.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">
              Sin roturas de distribución registradas en {MESES_FULL[month - 1]} {year}.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-slate-400">
        Fuente: tablero de pérdidas (deposito-esteban) · categoría <code>ROTURA DISTRIBUCIÓN</code> ÷ HL entregados
      </p>
    </div>
  )
}
