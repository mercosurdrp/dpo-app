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
  UserCheck,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import type { ReunionKpis, ReunionResumenMensual } from "@/actions/reunion-preruta"
import { getReunionResumenMensual } from "@/actions/reunion-preruta"

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const META_ASISTENCIA = 80

interface Props {
  kpisHoy: ReunionKpis
  resumenMes: ReunionResumenMensual[]
  mesActual: number
  anioActual: number
}

function PctBadge({ pct }: { pct: number }) {
  if (pct >= META_ASISTENCIA)
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{pct}%</Badge>
  if (pct >= 60)
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{pct}%</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{pct}%</Badge>
}

function Tendencia({ datos }: { datos: ReunionResumenMensual[] }) {
  if (datos.length < 3)
    return <span className="text-sm text-muted-foreground">Sin datos suficientes</span>

  const ultimos = datos.slice(-5)
  const first = ultimos[0].pct_asistencia
  const last = ultimos[ultimos.length - 1].pct_asistencia
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

export function AsistenciaMatinalClient({
  kpisHoy,
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
      ? Math.round(resumenMes.reduce((s, d) => s + d.pct_asistencia, 0) / resumenMes.length)
      : 0

  const diasConReunion = resumenMes.length

  const chartData = resumenMes.map((d) => {
    const dia = parseInt(d.fecha.slice(-2), 10)
    return {
      name: `${dia}`,
      pct: d.pct_asistencia,
      asistieron: d.asistieron,
      total: d.total_empleados,
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
      const res = await getReunionResumenMensual(nuevoMes, nuevoAnio)
      if ("data" in res) setResumenMes(res.data)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          % Asistencia a Reunión Matinal
        </h1>
        <p className="text-sm text-muted-foreground">
          Indicador DPO — Pilar Entrega 1.1 Pre Ruta
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hoy</p>
                <p
                  className={`text-3xl font-bold ${
                    kpisHoy.pct_asistencia >= META_ASISTENCIA
                      ? "text-green-600"
                      : kpisHoy.pct_asistencia >= 60
                        ? "text-amber-600"
                        : "text-red-600"
                  }`}
                >
                  {kpisHoy.pct_asistencia}%
                </p>
              </div>
              <div
                className={`rounded-full p-3 ${
                  kpisHoy.pct_asistencia >= META_ASISTENCIA
                    ? "bg-green-100"
                    : kpisHoy.pct_asistencia >= 60
                      ? "bg-amber-100"
                      : "bg-red-100"
                }`}
              >
                <UserCheck
                  className={`h-5 w-5 ${
                    kpisHoy.pct_asistencia >= META_ASISTENCIA
                      ? "text-green-600"
                      : kpisHoy.pct_asistencia >= 60
                        ? "text-amber-600"
                        : "text-red-600"
                  }`}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {kpisHoy.asistieron}/{kpisHoy.total_empleados} empleados — Meta: {META_ASISTENCIA}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Promedio {MESES[mes]}</p>
                <p
                  className={`text-3xl font-bold ${
                    promedioMes >= META_ASISTENCIA
                      ? "text-green-600"
                      : promedioMes >= 60
                        ? "text-amber-600"
                        : "text-red-600"
                  }`}
                >
                  {promedioMes}%
                </p>
              </div>
              <div
                className={`rounded-full p-3 ${
                  promedioMes >= META_ASISTENCIA
                    ? "bg-green-100"
                    : promedioMes >= 60
                      ? "bg-amber-100"
                      : "bg-red-100"
                }`}
              >
                <Target
                  className={`h-5 w-5 ${
                    promedioMes >= META_ASISTENCIA
                      ? "text-green-600"
                      : promedioMes >= 60
                        ? "text-amber-600"
                        : "text-red-600"
                  }`}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {diasConReunion} días con reunión registrada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Empleados Activos</p>
                <p className="text-3xl font-bold text-slate-900">
                  {kpisHoy.total_empleados}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Users className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Base de cálculo</p>
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
            <p className="mt-2 text-xs text-muted-foreground">Últimos 5 días</p>
          </CardContent>
        </Card>
      </div>

      {/* Month selector + Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">% Asistencia Diaria</CardTitle>
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
              No hay registros de reunión matinal en este mes.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === "pct") return [`${value}%`, "Asistencia"]
                      return [value, name]
                    }}
                    labelFormatter={(label) => `Día ${label}`}
                  />
                  <ReferenceLine
                    y={META_ASISTENCIA}
                    stroke="#10B981"
                    strokeDasharray="5 5"
                    label={{ value: `Meta ${META_ASISTENCIA}%`, position: "right", fontSize: 10 }}
                  />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          entry.pct >= META_ASISTENCIA
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
            <CardTitle className="text-base">Tendencia de Asistencia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Asistencia"]}
                    labelFormatter={(label) => `Día ${label}`}
                  />
                  <ReferenceLine
                    y={META_ASISTENCIA}
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
          <CardTitle className="text-base">Detalle de Hoy — {kpisHoy.fecha}</CardTitle>
        </CardHeader>
        <CardContent>
          {kpisHoy.detalle.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay empleados registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Legajo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Fichaje</TableHead>
                    <TableHead>Check-in Reunión</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kpisHoy.detalle.map((d) => (
                    <TableRow key={d.legajo}>
                      <TableCell className="text-sm font-mono">{d.legajo}</TableCell>
                      <TableCell className="font-medium">{d.nombre}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.sector}</TableCell>
                      <TableCell className="text-sm font-mono">
                        {d.hora_fichaje
                          ? new Date(d.hora_fichaje).toLocaleTimeString("es-AR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {d.hora_checkin
                          ? new Date(d.hora_checkin).toLocaleTimeString("es-AR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {d.asistio ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            Presente
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                            Ausente
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
