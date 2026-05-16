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
import { Label } from "@/components/ui/label"
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
} from "lucide-react"
import type {
  AsistenciaRango,
  AsistenciaResumenDia,
  AsistenciaFiltros,
  SucursalAsistenciaFiltro,
  PeriodoAsistencia,
} from "@/actions/reunion-preruta"
import { getAsistenciaRango } from "@/actions/reunion-preruta"
import { IS_MISIONES } from "@/lib/empresa"

const META_ASISTENCIA = 80

const SUCURSALES: { value: SucursalAsistenciaFiltro; label: string }[] = [
  { value: "TODAS", label: "Todas" },
  { value: "ELDORADO", label: "Eldorado" },
  { value: "IGUAZU", label: "Iguazú" },
]

const PERIODOS: { value: PeriodoAsistencia; label: string }[] = [
  { value: "dia", label: "Hoy" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
  { value: "ytd", label: "YTD" },
  { value: "personalizado", label: "Personalizado" },
]

// Rango [desde, hasta] de un período relativo a "hoy" (YYYY-MM-DD).
function rangoDe(
  periodo: PeriodoAsistencia,
  hoy: string,
): { desde: string; hasta: string } {
  if (periodo === "semana") {
    // Lunes de la semana en curso → hoy.
    const d = new Date(`${hoy}T12:00:00Z`)
    const dow = d.getUTCDay() // 0 = domingo
    d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1))
    return { desde: d.toISOString().slice(0, 10), hasta: hoy }
  }
  if (periodo === "mes") return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy }
  if (periodo === "ytd") return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy }
  // "dia" (y fallback): solo hoy.
  return { desde: hoy, hasta: hoy }
}

// "2026-05-15" -> "15/05"
function fmtCorta(f: string): string {
  return `${f.slice(8, 10)}/${f.slice(5, 7)}`
}

function colorPct(pct: number): string {
  if (pct >= META_ASISTENCIA) return "text-green-600"
  if (pct >= 60) return "text-amber-600"
  return "text-red-600"
}

function bgPct(pct: number): string {
  if (pct >= META_ASISTENCIA) return "bg-green-100"
  if (pct >= 60) return "bg-amber-100"
  return "bg-red-100"
}

function Tendencia({ datos }: { datos: AsistenciaResumenDia[] }) {
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

interface Props {
  initial: AsistenciaRango
  hoy: string
}

export function AsistenciaMatinalClient({ initial, hoy }: Props) {
  const [data, setData] = useState(initial)
  const [periodo, setPeriodo] = useState<PeriodoAsistencia>(initial.periodo)
  // Fechas editables para el período "personalizado".
  const [desdeCustom, setDesdeCustom] = useState(initial.desde)
  const [hastaCustom, setHastaCustom] = useState(initial.hasta)
  // Filtros — el de Distribución viene activado por default.
  const [soloDistribucion, setSoloDistribucion] = useState(true)
  const [sucursal, setSucursal] = useState<SucursalAsistenciaFiltro>("TODAS")
  const [isPending, startTransition] = useTransition()

  // Recarga el rango con los parámetros indicados (los no provistos
  // conservan el valor actual).
  function recargar(opts: {
    per?: PeriodoAsistencia
    desde?: string
    hasta?: string
    solo?: boolean
    suc?: SucursalAsistenciaFiltro
  }) {
    const per = opts.per ?? periodo
    let desde: string
    let hasta: string
    if (per === "personalizado") {
      desde = opts.desde ?? desdeCustom
      hasta = opts.hasta ?? hastaCustom
    } else {
      const r = rangoDe(per, hoy)
      desde = r.desde
      hasta = r.hasta
    }
    const filtros: AsistenciaFiltros = {
      soloDistribucion: opts.solo ?? soloDistribucion,
      sucursal: opts.suc ?? sucursal,
    }
    startTransition(async () => {
      const res = await getAsistenciaRango(desde, hasta, per, filtros)
      if ("data" in res) setData(res.data)
    })
  }

  function elegirPeriodo(p: PeriodoAsistencia) {
    setPeriodo(p)
    // "personalizado" espera a que el usuario aplique las fechas.
    if (p !== "personalizado") recargar({ per: p })
  }

  const serie = data.serie_diaria
  const esDiaUnico = data.desde === data.hasta
  const promedioDiario =
    serie.length > 0
      ? Math.round(
          serie.reduce((s, d) => s + d.pct_asistencia, 0) / serie.length,
        )
      : 0

  const chartData = serie.map((d) => ({
    name: fmtCorta(d.fecha),
    pct: d.pct_asistencia,
    asistieron: d.asistieron,
    total: d.total_empleados,
  }))

  const rangoLabel = esDiaUnico
    ? fmtCorta(data.desde)
    : `${fmtCorta(data.desde)} – ${fmtCorta(data.hasta)}`

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

      {/* Selector de período */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-md border bg-white p-1 text-sm">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={isPending}
              onClick={() => elegirPeriodo(p.value)}
              className={`rounded px-3 py-1 transition-colors ${
                periodo === p.value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {periodo === "personalizado" && (
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="desde" className="text-xs text-muted-foreground">
                Desde
              </Label>
              <input
                id="desde"
                type="date"
                value={desdeCustom}
                max={hoy}
                onChange={(e) => setDesdeCustom(e.target.value)}
                className="rounded-md border px-2 py-1 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="hasta" className="text-xs text-muted-foreground">
                Hasta
              </Label>
              <input
                id="hasta"
                type="date"
                value={hastaCustom}
                max={hoy}
                onChange={(e) => setHastaCustom(e.target.value)}
                className="rounded-md border px-2 py-1 text-sm"
              />
            </div>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                recargar({
                  per: "personalizado",
                  desde: desdeCustom,
                  hasta: hastaCustom,
                })
              }
            >
              Aplicar
            </Button>
          </div>
        )}

        {isPending && (
          <span className="text-xs text-muted-foreground">Actualizando…</span>
        )}
      </div>

      {/* Filtros de sector / sucursal */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Toggle de sector — Distribución activado por default */}
        <div className="flex items-center rounded-md border bg-white p-1 text-sm">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!soloDistribucion) {
                setSoloDistribucion(true)
                recargar({ solo: true })
              }
            }}
            className={`rounded px-3 py-1 transition-colors ${
              soloDistribucion
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Solo Distribución
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (soloDistribucion) {
                setSoloDistribucion(false)
                recargar({ solo: false })
              }
            }}
            className={`rounded px-3 py-1 transition-colors ${
              !soloDistribucion
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Todos los sectores
          </button>
        </div>

        {/* Toggle de sucursal — segmenta Eldorado / Iguazú (solo Misiones) */}
        {IS_MISIONES && (
          <div className="flex items-center rounded-md border bg-white p-1 text-sm">
            {SUCURSALES.map((su) => (
              <button
                key={su.value}
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (sucursal !== su.value) {
                    setSucursal(su.value)
                    recargar({ suc: su.value })
                  }
                }}
                className={`rounded px-3 py-1 transition-colors ${
                  sucursal === su.value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {su.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">% Asistencia</p>
                <p
                  className={`text-3xl font-bold ${colorPct(
                    data.resumen.pct_asistencia,
                  )}`}
                >
                  {data.resumen.pct_asistencia}%
                </p>
              </div>
              <div
                className={`rounded-full p-3 ${bgPct(
                  data.resumen.pct_asistencia,
                )}`}
              >
                <UserCheck
                  className={`h-5 w-5 ${colorPct(data.resumen.pct_asistencia)}`}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.resumen.asistencias} asistencias — Meta: {META_ASISTENCIA}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Promedio diario</p>
                <p className={`text-3xl font-bold ${colorPct(promedioDiario)}`}>
                  {promedioDiario}%
                </p>
              </div>
              <div className={`rounded-full p-3 ${bgPct(promedioDiario)}`}>
                <Target className={`h-5 w-5 ${colorPct(promedioDiario)}`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.resumen.dias_con_reunion} días con reunión registrada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Empleados</p>
                <p className="text-3xl font-bold text-slate-900">
                  {data.resumen.total_empleados}
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
                  <Tendencia datos={serie} />
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

      {/* Bar Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">% Asistencia Diaria</CardTitle>
          <span className="text-sm font-medium text-muted-foreground">
            {rangoLabel}
          </span>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No hay registros de reunión matinal en este período.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Asistencia"]}
                    labelFormatter={(label) => `Día ${label}`}
                  />
                  <ReferenceLine
                    y={META_ASISTENCIA}
                    stroke="#10B981"
                    strokeDasharray="5 5"
                    label={{
                      value: `Meta ${META_ASISTENCIA}%`,
                      position: "right",
                      fontSize: 10,
                    }}
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
                    formatter={(value) => [`${value}%`, "Asistencia"]}
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

      {/* Detalle */}
      {esDiaUnico ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Detalle del día — {data.desde}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.detalle_dia.length === 0 ? (
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
                      {IS_MISIONES && <TableHead>Sucursal</TableHead>}
                      <TableHead>Fichaje</TableHead>
                      <TableHead>Check-in Reunión</TableHead>
                      <TableHead className="text-right">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.detalle_dia.map((d) => (
                      <TableRow key={d.legajo}>
                        <TableCell className="text-sm font-mono">
                          {d.legajo}
                        </TableCell>
                        <TableCell className="font-medium">{d.nombre}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {d.sector}
                        </TableCell>
                        {IS_MISIONES && (
                          <TableCell className="text-sm">
                            {d.sucursal ? (
                              <Badge variant="outline">
                                {d.sucursal === "ELDORADO"
                                  ? "Eldorado"
                                  : "Iguazú"}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">
                                {"—"}
                              </span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-sm font-mono">
                          {d.hora_fichaje
                            ? new Date(d.hora_fichaje).toLocaleTimeString(
                                "es-AR",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "America/Argentina/Buenos_Aires",
                                },
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {d.hora_checkin
                            ? new Date(d.hora_checkin).toLocaleTimeString(
                                "es-AR",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "America/Argentina/Buenos_Aires",
                                },
                              )
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Detalle por empleado — {rangoLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.detalle_empleados.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No hay empleados registrados en este período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Legajo</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Sector</TableHead>
                      {IS_MISIONES && <TableHead>Sucursal</TableHead>}
                      <TableHead className="text-right">
                        Días con reunión
                      </TableHead>
                      <TableHead className="text-right">Días asistió</TableHead>
                      <TableHead className="text-right">% Asistencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.detalle_empleados.map((e) => (
                      <TableRow key={e.legajo}>
                        <TableCell className="text-sm font-mono">
                          {e.legajo}
                        </TableCell>
                        <TableCell className="font-medium">{e.nombre}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.sector}
                        </TableCell>
                        {IS_MISIONES && (
                          <TableCell className="text-sm">
                            {e.sucursal ? (
                              <Badge variant="outline">
                                {e.sucursal === "ELDORADO"
                                  ? "Eldorado"
                                  : "Iguazú"}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">
                                {"—"}
                              </span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-right text-sm font-mono">
                          {e.dias_con_reunion}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">
                          {e.dias_asistio}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`font-semibold ${colorPct(
                              e.pct_asistencia,
                            )}`}
                          >
                            {e.pct_asistencia}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
