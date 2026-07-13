"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"
import {
  Truck,
  Home,
  ClipboardCheck,
  RotateCcw,
  Fuel,
  AlertTriangle,
  Gauge,
  DollarSign,
  Clock,
  MapPin,
  ShieldAlert,
  Info,
} from "lucide-react"
import type { VehiculoDetalle, VehiculoTimelineEvento } from "@/types/database"

interface Props {
  detalle: VehiculoDetalle
  // Ficha técnica + documentación (server la arma con datos y permisos y se
  // renderiza entre el header y los KPIs)
  children?: React.ReactNode
}

const TIMELINE_CONFIG: Record<
  VehiculoTimelineEvento["tipo"],
  { Icon: typeof Truck; bg: string; color: string; label: string }
> = {
  egreso: { Icon: Truck, bg: "bg-blue-100", color: "text-blue-600", label: "Egreso" },
  retorno: { Icon: Home, bg: "bg-green-100", color: "text-green-600", label: "Retorno" },
  liberacion: { Icon: ClipboardCheck, bg: "bg-indigo-100", color: "text-indigo-600", label: "Checklist liberación" },
  retorno_chk: { Icon: RotateCcw, bg: "bg-emerald-100", color: "text-emerald-600", label: "Checklist retorno" },
  combustible: { Icon: Fuel, bg: "bg-amber-100", color: "text-amber-600", label: "Carga combustible" },
  checklist_nook: { Icon: AlertTriangle, bg: "bg-red-100", color: "text-red-600", label: "Checklist con NO OK" },
}

const SEVERIDAD_BANNER = {
  info: "border-blue-300 bg-blue-50 text-blue-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  danger: "border-red-300 bg-red-50 text-red-900",
} as const

const SEVERIDAD_ICON = {
  info: Info,
  warning: AlertTriangle,
  danger: ShieldAlert,
} as const

function formatHoraCorta(hora: string) {
  // hora viene como "HH:MM:SS" o ISO; tomamos los primeros 5 chars HH:MM si parece HH:MM:SS
  if (hora.length >= 5 && hora.includes(":")) return hora.slice(0, 5)
  try {
    const d = new Date(hora)
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return hora
  }
}

function formatFechaCorta(fechaIso: string) {
  const d = new Date(fechaIso + "T12:00:00")
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

// "2026-07" -> "Julio 2026"
function formatMes(mes: string) {
  const [anio, m] = mes.split("-")
  const nombre = MESES[Number(m) - 1] ?? mes
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`
}

function diasDelMes(mes: string): number {
  const [anio, m] = mes.split("-").map(Number)
  return new Date(anio, m, 0).getDate()
}

export function VehiculoDetalleClient({ detalle, children }: Props) {
  const {
    vehiculo,
    kpis,
    kmUltimos30Dias,
    horasPorDia,
    rendimientoUltimas10Cargas,
    timeline,
    proximaAlerta,
  } = detalle

  // Autoelevadores: el "odómetro" es un horómetro (horas). Se re-etiqueta toda
  // la vista a horas, ya que los km no aplican (no salen a ruta).
  const esAutoelevador = vehiculo.tipo === "autoelevador"
  const unidad = esAutoelevador ? "hs" : "km"

  // Meses con actividad, del más nuevo al más viejo. El mes en curso siempre
  // está en la lista aunque el autoelevador todavía no haya trabajado.
  const mesActual = new Date().toISOString().slice(0, 7)
  const mesesDisponibles = useMemo(() => {
    const set = new Set(horasPorDia.map((d) => d.fecha.slice(0, 7)))
    set.add(mesActual)
    return [...set].sort((a, b) => (a < b ? 1 : -1))
  }, [horasPorDia, mesActual])

  const [mesSel, setMesSel] = useState(mesActual)

  // Horas del mes elegido + una barra por día del mes (los días sin lectura van
  // en cero, para que se lean los huecos).
  const { horasMesSel, horasChart } = useMemo(() => {
    const delMes = horasPorDia.filter((d) => d.fecha.startsWith(mesSel))
    const porFecha = new Map(delMes.map((d) => [d.fecha, d.km]))
    const hasta = mesSel === mesActual ? new Date().getDate() : diasDelMes(mesSel)
    const chart = []
    for (let dia = 1; dia <= hasta; dia++) {
      const fecha = `${mesSel}-${dia.toString().padStart(2, "0")}`
      chart.push({ fecha: formatFechaCorta(fecha), km: porFecha.get(fecha) ?? 0 })
    }
    return {
      horasMesSel: delMes.reduce((a, d) => a + d.km, 0),
      horasChart: chart,
    }
  }, [horasPorDia, mesSel, mesActual])

  const kmChart = esAutoelevador
    ? horasChart
    : kmUltimos30Dias.map((d) => ({
        fecha: formatFechaCorta(d.fecha),
        km: d.km,
      }))

  const rendChart = rendimientoUltimas10Cargas.map((c) => ({
    fecha: formatFechaCorta(c.fecha),
    rendimiento: Number(c.rendimiento.toFixed(2)),
    km: c.km,
    litros: c.litros,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-mono text-3xl font-bold text-slate-900">{vehiculo.dominio}</h1>
        <p className="text-sm text-muted-foreground">
          {vehiculo.descripcion || "Sin descripción"}
        </p>
      </div>

      {/* Ficha técnica + documentación */}
      {children}

      {/* Banner alerta */}
      {proximaAlerta && (
        <div
          className={`flex items-start gap-3 rounded-md border-l-4 p-4 ${
            SEVERIDAD_BANNER[proximaAlerta.severidad]
          }`}
        >
          {(() => {
            const Icon = SEVERIDAD_ICON[proximaAlerta.severidad]
            return <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
          })()}
          <div>
            <p className="font-semibold">{proximaAlerta.titulo}</p>
            <p className="text-sm">{proximaAlerta.descripcion}</p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {esAutoelevador ? `Horas — ${formatMes(mesSel)}` : "Km del mes"}
                </p>
                <p className="text-3xl font-bold text-slate-900">
                  {(esAutoelevador ? horasMesSel : kpis.kmMes).toLocaleString("es-AR")}
                  {esAutoelevador && (
                    <span className="ml-1 text-base font-normal text-muted-foreground">hs</span>
                  )}
                </p>
              </div>
              <div className="rounded-full bg-indigo-100 p-3">
                <Gauge className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              YTD: {kpis.kmYTD.toLocaleString("es-AR")} {unidad} · Histórico:{" "}
              {kpis.kmHistorico.toLocaleString("es-AR")} {unidad}
            </p>
          </CardContent>
        </Card>

        {!esAutoelevador && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rendimiento</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {kpis.rendimientoPromedio.toFixed(2)}
                    <span className="ml-1 text-base font-normal text-muted-foreground">km/l</span>
                  </p>
                </div>
                <div className="rounded-full bg-amber-100 p-3">
                  <Fuel className="h-5 w-5 text-amber-600" />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Promedio histórico</p>
            </CardContent>
          </Card>
        )}

        {(!esAutoelevador || kpis.costoMes > 0) && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Costo combustible mes</p>
                  <p className="text-3xl font-bold text-slate-900">
                    $ {kpis.costoMes.toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="rounded-full bg-green-100 p-3">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Histórico: $ {kpis.costoTotalHistorico.toLocaleString("es-AR")}
              </p>
            </CardContent>
          </Card>
        )}

        {!esAutoelevador && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">TML promedio</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {kpis.tmlPromedio} <span className="text-base font-normal">min</span>
                  </p>
                </div>
                <div className="rounded-full bg-cyan-100 p-3">
                  <Clock className="h-5 w-5 text-cyan-600" />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Tiempo medio liberación</p>
            </CardContent>
          </Card>
        )}

        {!esAutoelevador && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Egresos del mes</p>
                  <p className="text-3xl font-bold text-slate-900">{kpis.totalEgresosMes}</p>
                </div>
                <div className="rounded-full bg-blue-100 p-3">
                  <Truck className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Salidas a ruta</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {esAutoelevador ? "Último horómetro" : "Último odómetro"}
                </p>
                <p className="text-3xl font-bold text-slate-900">
                  {kpis.ultimoOdometro != null
                    ? kpis.ultimoOdometro.toLocaleString("es-AR")
                    : "—"}
                  {esAutoelevador && kpis.ultimoOdometro != null && (
                    <span className="ml-1 text-base font-normal text-muted-foreground">hs</span>
                  )}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <MapPin className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Última actividad: {kpis.ultimaActividad || "Sin registros"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className={`grid gap-4 ${esAutoelevador ? "" : "lg:grid-cols-2"}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">
              {esAutoelevador
                ? `Horas por día — ${formatMes(mesSel)}`
                : "Km por día — últimos 30"}
            </CardTitle>
            {esAutoelevador && (
              <Select value={mesSel} onValueChange={(v: string | null) => v && setMesSel(v)}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mesesDisponibles.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatMes(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {kmChart.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sin datos
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kmChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="fecha" fontSize={11} />
                    <YAxis fontSize={11} unit={` ${unidad}`} />
                    <RechartsTooltip
                      formatter={(v) => [
                        `${Number(v).toLocaleString("es-AR")} ${unidad}`,
                        esAutoelevador ? "Horas" : "Km",
                      ]}
                    />
                    <Bar dataKey="km" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {!esAutoelevador && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rendimiento últimas 10 cargas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {rendChart.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sin cargas registradas
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rendChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="fecha" fontSize={11} />
                    <YAxis fontSize={11} unit=" km/l" />
                    <RechartsTooltip
                      formatter={(v) => [`${Number(v).toFixed(2)} km/l`, "Rendimiento"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="rendimiento"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={{ fill: "#10B981", r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
        )}
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline de actividad</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin actividad reciente.</p>
          ) : (
            <div className="space-y-2">
              {timeline.map((ev, idx) => {
                const cfg = TIMELINE_CONFIG[ev.tipo]
                const Icon = cfg.Icon
                const content = (
                  <div className="flex items-start gap-3 rounded-md border bg-slate-50 p-3 transition-colors hover:bg-slate-100">
                    <div className={`rounded-full p-2 ${cfg.bg}`}>
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">{ev.descripcion}</p>
                        <span className="flex-shrink-0 font-mono text-xs text-muted-foreground">
                          {ev.fecha} · {formatHoraCorta(ev.hora)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">
                          {cfg.label}
                        </Badge>
                        {ev.chofer && <span>{ev.chofer}</span>}
                        {ev.odometro != null && (
                          <span className="font-mono">{ev.odometro.toLocaleString("es-AR")} {unidad}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
                return ev.link ? (
                  <Link key={idx} href={ev.link}>
                    {content}
                  </Link>
                ) : (
                  <div key={idx}>{content}</div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
