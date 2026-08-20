"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts"
import {
  Gauge,
  Hourglass,
  Route as RouteIcon,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"
import type { DesvioPlanKpis } from "@/lib/foxtrot/desvio-plan-types"

interface Props {
  kpis: DesvioPlanKpis
}

const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${v}%`
const fmtHs = (min: number) => {
  const sign = min < 0 ? "−" : "+"
  const abs = Math.abs(min)
  return `${sign}${Math.floor(abs / 60)}h ${String(Math.round(abs % 60)).padStart(2, "0")}m`
}
const fmtFechaCorta = (iso: string) => {
  const [, m, d] = iso.split("-")
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`
}

function colorDesvio(v: number, meta: number, gatillo: number): string {
  if (v <= meta) return "#10B981"
  if (v <= gatillo) return "#F59E0B"
  return "#EF4444"
}

function DesvioBadge({ v, meta, gatillo }: { v: number; meta: number; gatillo: number }) {
  const cls =
    v <= meta
      ? "bg-green-100 text-green-700 hover:bg-green-100"
      : v <= gatillo
        ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
        : "bg-red-100 text-red-700 hover:bg-red-100"
  return <Badge className={cls}>{fmtPct(v)}</Badge>
}

export function DesvioPlanClient({ kpis }: Props) {
  const [tab, setTab] = useState("diario")
  const { meta_pct: meta, gatillo_pct: gatillo } = kpis

  const diariaData = kpis.serie_diaria.slice(-45).map((d) => ({
    name: fmtFechaCorta(d.fecha),
    desvio: d.desvio_pct,
    rutas: d.rutas,
    plan: d.plan_min,
    real: d.real_min,
  }))
  const semanalData = kpis.serie_semanal.map((s) => ({
    name: s.semana,
    desvio: s.desvio_pct,
    rutas: s.rutas,
  }))
  const choferData = kpis.por_chofer.map((c) => ({
    name: c.chofer,
    desvio: c.desvio_pct,
  }))

  const deltaMes =
    kpis.desvio_mes != null && kpis.desvio_mes_anterior != null
      ? Math.round((kpis.desvio_mes - kpis.desvio_mes_anterior) * 10) / 10
      : null

  const colorMes =
    kpis.desvio_mes == null
      ? "text-slate-900"
      : kpis.desvio_mes <= meta
        ? "text-green-600"
        : kpis.desvio_mes <= gatillo
          ? "text-amber-600"
          : "text-red-600"

  const tooltipDesvio = (value: unknown, _name: unknown, item: { payload?: { rutas?: number; plan?: number; real?: number } }) => {
    const p = item?.payload
    const extra =
      p?.plan != null && p?.real != null
        ? ` · ${p.real} vs ${p.plan} min · ${p.rutas} rutas`
        : p?.rutas != null
          ? ` · ${p.rutas} rutas`
          : ""
    return [`${fmtPct(Number(value))}${extra}`, "Desvío"]
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Desvío s/ tiempo planificado
        </h1>
        <p className="text-sm text-muted-foreground">
          Tiempo real de ruta vs plan de Foxtrot, por ruta — Pilar Entrega 2.1
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Desvío del mes</p>
                <p className={`text-3xl font-bold ${colorMes}`}>
                  {kpis.desvio_mes == null ? "—" : fmtPct(kpis.desvio_mes)}
                </p>
              </div>
              <div
                className={`rounded-full p-3 ${
                  kpis.desvio_mes == null
                    ? "bg-slate-100"
                    : kpis.desvio_mes <= meta
                      ? "bg-green-100"
                      : kpis.desvio_mes <= gatillo
                        ? "bg-amber-100"
                        : "bg-red-100"
                }`}
              >
                <Gauge className={`h-5 w-5 ${colorMes}`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Meta ≤ {meta}% · Gatillo {gatillo}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">vs mes anterior</p>
                <div className="mt-1">
                  {deltaMes == null ? (
                    <span className="text-3xl font-bold text-slate-900">—</span>
                  ) : (
                    <span
                      className={`flex items-center gap-1 text-3xl font-bold ${
                        deltaMes < -1
                          ? "text-green-600"
                          : deltaMes > 1
                            ? "text-red-600"
                            : "text-slate-600"
                      }`}
                    >
                      {deltaMes < -1 ? (
                        <TrendingDown className="h-6 w-6" />
                      ) : deltaMes > 1 ? (
                        <TrendingUp className="h-6 w-6" />
                      ) : (
                        <Minus className="h-6 w-6" />
                      )}
                      {fmtPct(deltaMes)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Mes anterior:{" "}
              {kpis.desvio_mes_anterior == null ? "—" : fmtPct(kpis.desvio_mes_anterior)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Horas extra del mes</p>
                <p
                  className={`text-3xl font-bold ${
                    kpis.min_extra_mes <= 0 ? "text-green-600" : "text-slate-900"
                  }`}
                >
                  {fmtHs(kpis.min_extra_mes)}
                </p>
              </div>
              <div className="rounded-full bg-blue-100 p-3">
                <Hourglass className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Σ (real − plan) de las {kpis.rutas_mes} rutas medidas del mes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cobertura del dato</p>
                <p className="text-3xl font-bold text-slate-900">
                  {kpis.pct_cobertura}%
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <RouteIcon className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Rutas limpias con plan de Foxtrot · {kpis.rutas_excluidas} sin
              finalizar o no limpias (excluidas)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Evolución */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="diario">Diario</TabsTrigger>
          <TabsTrigger value="semanal">Semanal</TabsTrigger>
        </TabsList>

        <TabsContent value="diario">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Desvío diario — últimos 45 días con dato
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={diariaData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={10} interval="preserveStartEnd" />
                    <YAxis fontSize={11} unit="%" />
                    <Tooltip formatter={tooltipDesvio} />
                    <ReferenceLine y={0} stroke="#64748b" />
                    <ReferenceLine
                      y={meta}
                      stroke="#10B981"
                      strokeDasharray="5 5"
                      label={{ value: `Meta ${meta}%`, position: "right", fontSize: 10 }}
                    />
                    <ReferenceLine
                      y={gatillo}
                      stroke="#EF4444"
                      strokeDasharray="5 5"
                      label={{ value: `Gatillo ${gatillo}%`, position: "right", fontSize: 10 }}
                    />
                    <Bar dataKey="desvio" radius={[4, 4, 0, 0]}>
                      {diariaData.map((d, i) => (
                        <Cell key={i} fill={colorDesvio(d.desvio, meta, gatillo)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Positivo = las rutas tardaron más que el plan de Foxtrot. Ponderado
                por ruta: (Σ real − Σ plan) / Σ plan del día.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="semanal">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desvío semanal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={semanalData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} unit="%" />
                    <Tooltip formatter={tooltipDesvio} />
                    <ReferenceLine y={0} stroke="#64748b" />
                    <ReferenceLine
                      y={meta}
                      stroke="#10B981"
                      strokeDasharray="5 5"
                      label={{ value: `Meta ${meta}%`, position: "right", fontSize: 10 }}
                    />
                    <ReferenceLine
                      y={gatillo}
                      stroke="#EF4444"
                      strokeDasharray="5 5"
                      label={{ value: `Gatillo ${gatillo}%`, position: "right", fontSize: 10 }}
                    />
                    <Bar dataKey="desvio" radius={[4, 4, 0, 0]}>
                      {semanalData.map((s, i) => (
                        <Cell key={i} fill={colorDesvio(s.desvio, meta, gatillo)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Por camión / chofer */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Desvío por chofer — últimos 30 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(220, choferData.length * 36) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={choferData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" fontSize={11} unit="%" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    fontSize={10}
                    width={140}
                    interval={0}
                  />
                  <Tooltip formatter={(v) => [fmtPct(Number(v)), "Desvío"]} />
                  <ReferenceLine x={0} stroke="#64748b" />
                  <ReferenceLine x={meta} stroke="#10B981" strokeDasharray="5 5" />
                  <ReferenceLine x={gatillo} stroke="#EF4444" strokeDasharray="5 5" />
                  <Bar dataKey="desvio" radius={[0, 4, 4, 0]}>
                    {choferData.map((c, i) => (
                      <Cell key={i} fill={colorDesvio(c.desvio, meta, gatillo)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Detalle por chofer — últimos 30 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chofer</TableHead>
                    <TableHead>Camión</TableHead>
                    <TableHead className="text-right">Rutas</TableHead>
                    <TableHead className="text-right">Extra</TableHead>
                    <TableHead className="text-right">Desvío</TableHead>
                    <TableHead className="text-right">Peor ruta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kpis.por_chofer.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Sin rutas medidas en los últimos 30 días
                      </TableCell>
                    </TableRow>
                  )}
                  {kpis.por_chofer.map((c) => (
                    <TableRow key={c.chofer}>
                      <TableCell className="text-sm font-medium">{c.chofer}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.patente ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {c.rutas}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {fmtHs(c.real_min - c.plan_min)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DesvioBadge v={c.desvio_pct} meta={meta} gatillo={gatillo} />
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {fmtPct(c.peor_desvio_pct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Peores rutas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Rutas con mayor desvío — últimos 30 días
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead>Camión</TableHead>
                  <TableHead className="text-right">Plan</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Desvío</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kpis.peores_rutas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Sin rutas medidas en los últimos 30 días
                    </TableCell>
                  </TableRow>
                )}
                {kpis.peores_rutas.map((r, i) => (
                  <TableRow key={`${r.fecha}-${r.chofer}-${i}`}>
                    <TableCell className="text-sm">{r.fecha}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.nombre_ruta}
                    </TableCell>
                    <TableCell className="text-sm">{r.chofer}</TableCell>
                    <TableCell className="font-mono text-xs">{r.patente ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.plan_min} min
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.real_min} min
                    </TableCell>
                    <TableCell className="text-right">
                      <DesvioBadge v={r.desvio_pct} meta={meta} gatillo={gatillo} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Plan = &quot;Planned Foxtrot Journey Seconds&quot; (manejo + atención en
            clientes) · Real = inicio → fin de ruta en Foxtrot. Solo rutas
            finalizadas el mismo día. La meta y el gatillo se configuran desde el
            diálogo de indicadores de la Matinal de Distribución.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
