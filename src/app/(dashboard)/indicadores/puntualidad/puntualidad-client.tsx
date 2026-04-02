"use client"

import { useState, useTransition } from "react"
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
import { Button } from "@/components/ui/button"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts"
import {
  Users,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react"
import type { PuntualidadDiaria, PuntualidadResumenDia } from "@/actions/puntualidad"
import { getPuntualidadMensual } from "@/actions/puntualidad"

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const META_PUNTUALIDAD = 80

interface Props {
  diariaHoy: PuntualidadDiaria
  resumenMes: PuntualidadResumenDia[]
  mesActual: number
  anioActual: number
}

function Tendencia({ datos }: { datos: PuntualidadResumenDia[] }) {
  if (datos.length < 3)
    return <span className="text-sm text-muted-foreground">Sin datos suficientes</span>

  const ultimos = datos.slice(-5)
  const first = ultimos[0].pct_puntualidad
  const last = ultimos[ultimos.length - 1].pct_puntualidad
  const diff = last - first

  if (diff > 5)
    return (
      <span className="flex items-center gap-1 text-sm font-medium text-green-600">
        <TrendingUp className="h-4 w-4" /> Mejora (+{diff}%)
      </span>
    )
  if (diff < -5)
    return (
      <span className="flex items-center gap-1 text-sm font-medium text-red-600">
        <TrendingDown className="h-4 w-4" /> Baja ({diff}%)
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-sm font-medium text-slate-600">
      <Minus className="h-4 w-4" /> Estable
    </span>
  )
}

function colorPct(pct: number): string {
  if (pct >= META_PUNTUALIDAD) return "text-green-600"
  if (pct >= 60) return "text-amber-600"
  return "text-red-600"
}

function bgPct(pct: number): string {
  if (pct >= META_PUNTUALIDAD) return "bg-green-100"
  if (pct >= 60) return "bg-amber-100"
  return "bg-red-100"
}

export function PuntualidadClient({
  diariaHoy,
  resumenMes: resumenMesInicial,
  mesActual,
  anioActual,
}: Props) {
  const [mes, setMes] = useState(mesActual)
  const [anio, setAnio] = useState(anioActual)
  const [resumenMes, setResumenMes] = useState(resumenMesInicial)
  const [isPending, startTransition] = useTransition()

  const promedioMes =
    resumenMes.length > 0
      ? Math.round(resumenMes.reduce((s, d) => s + d.pct_puntualidad, 0) / resumenMes.length)
      : 0

  const diasConRegistro = resumenMes.length

  const chartData = resumenMes.map((d) => {
    const dia = parseInt(d.fecha.slice(-2), 10)
    return {
      name: `${dia}`,
      pct: d.pct_puntualidad,
      puntuales: d.puntuales,
      total: d.total_ficharon,
    }
  })

  function cambiarMes(delta: number) {
    let nuevoMes = mes + delta
    let nuevoAnio = anio
    if (nuevoMes < 1) {
      nuevoMes = 12
      nuevoAnio--
    } else if (nuevoMes > 12) {
      nuevoMes = 1
      nuevoAnio++
    }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
    startTransition(async () => {
      const res = await getPuntualidadMensual(nuevoMes, nuevoAnio)
      if ("data" in res) setResumenMes(res.data)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          % Puntualidad Pre-Ruta
        </h1>
        <p className="text-sm text-muted-foreground">
          Indicador DPO — Empleados con entrada &le; 07:00 sobre total fichados
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hoy</p>
                <p className={`text-3xl font-bold ${colorPct(diariaHoy.pct_puntualidad)}`}>
                  {diariaHoy.pct_puntualidad}%
                </p>
              </div>
              <div className={`rounded-full p-3 ${bgPct(diariaHoy.pct_puntualidad)}`}>
                <Clock className={`h-5 w-5 ${colorPct(diariaHoy.pct_puntualidad)}`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {diariaHoy.puntuales}/{diariaHoy.total_ficharon} puntuales — Meta: {META_PUNTUALIDAD}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Promedio {MESES[mes]}</p>
                <p className={`text-3xl font-bold ${colorPct(promedioMes)}`}>
                  {promedioMes}%
                </p>
              </div>
              <div className={`rounded-full p-3 ${bgPct(promedioMes)}`}>
                <Target className={`h-5 w-5 ${colorPct(promedioMes)}`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {diasConRegistro} dias con fichaje registrado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ficharon Hoy</p>
                <p className="text-3xl font-bold text-slate-900">
                  {diariaHoy.total_ficharon}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Users className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Base de calculo del dia</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tendencia</p>
                <div className="mt-1">
                  <Tendencia datos={resumenMes} />
                </div>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <TrendingUp className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Ultimos 5 dias</p>
          </CardContent>
        </Card>
      </div>

      {/* Month selector + Bar Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">% Puntualidad Diaria</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={() => cambiarMes(-1)} disabled={isPending}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {MESES[mes]} {anio}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => cambiarMes(1)}
              disabled={isPending || (mes === mesActual && anio === anioActual)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No hay registros de fichaje en este mes.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Puntualidad"]}
                    labelFormatter={(label) => `Dia ${label}`}
                  />
                  <ReferenceLine
                    y={META_PUNTUALIDAD}
                    stroke="#10B981"
                    strokeDasharray="5 5"
                    label={{ value: `Meta ${META_PUNTUALIDAD}%`, position: "right", fontSize: 10 }}
                  />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          entry.pct >= META_PUNTUALIDAD
                            ? "#10B981"
                            : entry.pct >= 60
                              ? "#F59E0B"
                              : "#EF4444"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trend line */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendencia de Puntualidad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Puntualidad"]}
                    labelFormatter={(label) => `Dia ${label}`}
                  />
                  <ReferenceLine
                    y={META_PUNTUALIDAD}
                    stroke="#10B981"
                    strokeDasharray="5 5"
                  />
                  <Line
                    type="monotone"
                    dataKey="pct"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={{ fill: "#3B82F6", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail table - today */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle de Hoy — {diariaHoy.fecha}</CardTitle>
        </CardHeader>
        <CardContent>
          {diariaHoy.detalle.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay empleados que hayan fichado hoy.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Legajo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Hora Entrada</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diariaHoy.detalle.map((d) => (
                    <TableRow key={d.legajo}>
                      <TableCell className="text-sm font-mono">{d.legajo}</TableCell>
                      <TableCell className="font-medium">{d.nombre}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.sector}</TableCell>
                      <TableCell className="text-sm font-mono">
                        {d.primera_entrada
                          ? new Date(d.primera_entrada).toLocaleTimeString("es-AR", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "America/Argentina/Buenos_Aires",
                            })
                          : "\u2014"}
                      </TableCell>
                      <TableCell className="text-right">
                        {d.puntual ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            Puntual
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                            Tardanza
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
