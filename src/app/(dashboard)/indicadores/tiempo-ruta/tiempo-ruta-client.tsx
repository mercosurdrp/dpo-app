"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import type {
  ChecklistVehiculo,
  CatalogoVehiculo,
  TiempoRutaSemanal,
  TiempoRutaMensual,
} from "@/types/database"
import type { TiempoRutaClientesData } from "@/actions/tiempo-ruta-cliente"
import { ClientesTiempo } from "./_components/clientes-tiempo"
import { PlanesTiempoRuta } from "./_components/planes-tiempo-ruta"
import { DetalleCiudadCamion } from "./_components/detalle-ciudad-camion"
import type { TiempoRutaPlan } from "@/actions/tiempo-ruta-planes"
import {
  TIEMPO_RUTA_META_MINUTOS,
  TIEMPO_RUTA_TOLERANCIA_MINUTOS,
  AJUSTE_TRASLADO_MINUTOS,
  calcularTiempoRuta,
  filtrarPorZona,
  minutosAjustados,
  type RetornoRuta,
} from "@/lib/tiempo-ruta/meta"
import {
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Truck,
  BarChart3,
  Minus,
  Eye,
  Activity,
  MapPin,
} from "lucide-react"

interface KpiData {
  totalRetornos: number
  promedioMinutos: number
  promedioHoras: string
  dentroMeta: number
  pctDentroMeta: number
  metaMinutos: number
  semanal: TiempoRutaSemanal[]
  mensual: TiempoRutaMensual[]
  retornos: RetornoRuta[]
  rutas: string[]
}

interface Props {
  kpis: KpiData
  checklists: ChecklistVehiculo[]
  vehiculos: CatalogoVehiculo[]
  /** null si la migración del detalle por PDV todavía no está aplicada. */
  clientes: TiempoRutaClientesData | null
  planes: TiempoRutaPlan[]
}

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const META_MIN = TIEMPO_RUTA_META_MINUTOS
const AMARILLO_MIN = TIEMPO_RUTA_META_MINUTOS + TIEMPO_RUTA_TOLERANCIA_MINUTOS
const META_HORAS = META_MIN / 60
const META_LABEL = `Meta ${META_HORAS}h`

function formatMinutosToHoras(min: number): string {
  const hh = Math.floor(min / 60)
  const mm = min % 60
  return `${hh}h ${mm.toString().padStart(2, "0")}m`
}

function fmtHHMM(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`
}

function TiempoRutaBadge({ minutos }: { minutos: number }) {
  const text = formatMinutosToHoras(minutos)
  if (minutos <= META_MIN) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{text}</Badge>
  if (minutos <= AMARILLO_MIN) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{text}</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{text}</Badge>
}

function Tendencia({ mensual }: { mensual: TiempoRutaMensual[] }) {
  if (mensual.length < 2) return <span className="text-sm text-muted-foreground">Sin datos suficientes</span>
  const last3 = mensual.slice(-3)
  const first = last3[0].promedio_minutos
  const last = last3[last3.length - 1].promedio_minutos
  const diffMin = last - first

  if (diffMin < -10) return (
    <span className="flex items-center gap-1 text-sm font-medium text-green-600">
      <TrendingDown className="h-4 w-4" /> Mejora ({formatMinutosToHoras(Math.abs(diffMin))})
    </span>
  )
  if (diffMin > 10) return (
    <span className="flex items-center gap-1 text-sm font-medium text-red-600">
      <TrendingUp className="h-4 w-4" /> Deterioro (+{formatMinutosToHoras(diffMin)})
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-sm font-medium text-slate-600">
      <Minus className="h-4 w-4" /> Estable
    </span>
  )
}

function formatHora(isoStr: string) {
  const d = new Date(isoStr)
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
}

export function TiempoRutaClient({ kpis, vehiculos, clientes, planes }: Props) {
  const [tab, setTab] = useState("semanal")
  // Vista oficial = ajustada por traslado y todas las zonas (la que pide planes).
  const [ajustar, setAjustar] = useState(true)
  const [zona, setZona] = useState("todas")
  const vista = useMemo(
    () => calcularTiempoRuta(filtrarPorZona(kpis.retornos, zona), ajustar),
    [kpis.retornos, zona, ajustar],
  )
  const sinDato = kpis.retornos.filter((r) => !r.ruta).length
  // La lista de abajo sigue al filtro de zona: los 50 retornos más recientes de la zona elegida.
  const ultimos = useMemo(
    () =>
      filtrarPorZona(kpis.retornos, zona)
        .slice()
        .sort((a, b) => (b.fecha + (b.hora ?? "")).localeCompare(a.fecha + (a.hora ?? "")))
        .slice(0, 50),
    [kpis.retornos, zona],
  )
  const lejanas = Object.entries(AJUSTE_TRASLADO_MINUTOS)
    .map(([ruta, min]) => `${ruta} −${min / 60} h`)
    .join(" · ")

  const semanalData = vista.semanal.map((s) => ({
    name: `S${s.semana}`,
    horas: +(s.promedio_minutos / 60).toFixed(1),
    pctMeta: s.pct_dentro_meta,
    retornos: s.total_retornos,
  }))

  const mensualData = vista.mensual.map((m) => ({
    name: MESES[m.mes],
    horas: +(m.promedio_minutos / 60).toFixed(1),
    pctMeta: m.pct_dentro_meta,
    retornos: m.total_retornos,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Indicadores En Ruta
          </h1>
          <p className="text-sm text-muted-foreground">
            Tiempo en Ruta (puerta a puerta) — Pilar Entrega 1.2
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setTab("ciudad")
              document.getElementById("tiempo-ruta-graficos")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
          >
            <MapPin className="mr-2 h-4 w-4" /> Ver detalle por ciudad
          </Button>
          <Link href="/vehiculos/checklist">
            <Button>
              <Activity className="mr-2 h-4 w-4" /> Nuevo Checklist
            </Button>
          </Link>
        </div>
      </div>

      {/* Filtros: zona y descuento del traslado a las zonas lejanas */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-6">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Zona</span>
            <select
              value={zona}
              onChange={(e) => setZona(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="todas">Todas las zonas</option>
              <option value="sin_lejanas">Sin Pergamino ni Colón</option>
              {kpis.rutas.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              {sinDato > 0 && <option value="sin_dato">Sin dato de zona ({sinDato})</option>}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ajustar}
              onChange={(e) => setAjustar(e.target.checked)}
              className="size-4 accent-emerald-600"
            />
            <span>Descontar el traslado ({lejanas})</span>
          </label>
          <p className="w-full text-xs text-muted-foreground">
            La zona de cada retorno es la de más carga del camión ese día. Promedio real, sin descontar el traslado:{" "}
            <strong>{fmtHHMM(vista.promedioRealMinutos)}</strong>
            {ajustar ? " · la meta de 7 h se mide sobre el tiempo ajustado (SOP 1.2)." : "."}
          </p>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Promedio Ruta</p>
                <p className={`text-3xl font-bold ${
                  vista.promedioMinutos <= META_MIN ? "text-green-600" : vista.promedioMinutos <= AMARILLO_MIN ? "text-amber-600" : "text-red-600"
                }`}>
                  {vista.promedioHoras}
                </p>
              </div>
              <div className={`rounded-full p-3 ${
                vista.promedioMinutos <= META_MIN ? "bg-green-100" : vista.promedioMinutos <= AMARILLO_MIN ? "bg-amber-100" : "bg-red-100"
              }`}>
                <Clock className={`h-5 w-5 ${
                  vista.promedioMinutos <= META_MIN ? "text-green-600" : vista.promedioMinutos <= AMARILLO_MIN ? "text-amber-600" : "text-red-600"
                }`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Meta: ≤ {META_HORAS} horas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">% retornos ≤ {META_HORAS} h</p>
                <p className={`text-3xl font-bold ${
                  "text-slate-700"
                }`}>
                  {vista.pctDentroMeta}%
                </p>
              </div>
              <div className={`rounded-full p-3 ${
                "bg-slate-100"
              }`}>
                <Target className={`h-5 w-5 ${
                  "text-slate-700"
                }`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {vista.dentroMeta}/{vista.totalRetornos} retornos · dato informativo: la meta es el promedio ≤ {META_HORAS} h
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Retornos</p>
                <p className="text-3xl font-bold text-slate-900">
                  {vista.totalRetornos}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Truck className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Checklists de retorno</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tendencia 3 meses</p>
                <div className="mt-1">
                  <Tendencia mensual={vista.mensual} />
                </div>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <BarChart3 className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">DPO: mejora sostenida</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs value={tab} onValueChange={setTab} id="tiempo-ruta-graficos" className="scroll-mt-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="semanal">Semanal</TabsTrigger>
          <TabsTrigger value="mensual">Mensual</TabsTrigger>
          <TabsTrigger value="ciudad">Por ciudad y camión</TabsTrigger>
          {clientes && !clientes.sinDatos && (
            <TabsTrigger value="pdv">Por punto de venta</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="semanal">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tiempo Promedio por Semana (horas)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={semanalData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit="h" />
                      <Tooltip
                        formatter={(value) => [`${value}h`, "Tiempo"]}
                        labelFormatter={(label) => `Semana ${label}`}
                      />
                      <ReferenceLine y={META_HORAS} stroke="#10B981" strokeDasharray="5 5" label={{ value: META_LABEL, position: "right", fontSize: 10 }} />
                      <Bar dataKey="horas" radius={[4, 4, 0, 0]}>
                        {semanalData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.horas <= META_HORAS ? "#10B981" : entry.horas <= AMARILLO_MIN / 60 ? "#F59E0B" : "#EF4444"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">% de retornos ≤ {META_HORAS} h por semana (informativo)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={semanalData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "% Meta"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="pctMeta"
                        stroke="#8B5CF6"
                        strokeWidth={2}
                        dot={{ fill: "#8B5CF6", r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="mensual">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tiempo Promedio por Mes (horas)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mensualData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit="h" />
                      <Tooltip
                        formatter={(value) => [`${value}h`, "Tiempo"]}
                      />
                      <ReferenceLine y={META_HORAS} stroke="#10B981" strokeDasharray="5 5" label={{ value: META_LABEL, position: "right", fontSize: 10 }} />
                      <Bar dataKey="horas" radius={[4, 4, 0, 0]}>
                        {mensualData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.horas <= META_HORAS ? "#10B981" : entry.horas <= AMARILLO_MIN / 60 ? "#F59E0B" : "#EF4444"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">% de retornos ≤ {META_HORAS} h por mes (informativo)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mensualData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "% Meta"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="pctMeta"
                        stroke="#8B5CF6"
                        strokeWidth={2}
                        dot={{ fill: "#8B5CF6", r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ciudad">
          <DetalleCiudadCamion retornos={kpis.retornos} ajustar={ajustar} />
        </TabsContent>

        {clientes && !clientes.sinDatos && (
          <TabsContent value="pdv">
            <ClientesTiempo
              clientes={clientes.clientes}
              ciudades={clientes.ciudades}
              paradas={clientes.paradas}
              desde={clientes.desde}
              hasta={clientes.hasta}
            />
          </TabsContent>
        )}
      </Tabs>

      <PlanesTiempoRuta mensual={kpis.mensual} metaMinutos={kpis.metaMinutos} planes={planes} />

      {/* Recent retorno checklists */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Últimos retornos{zona !== "todas" ? ` · ${zona === "sin_lejanas" ? "sin Pergamino ni Colón" : zona === "sin_dato" ? "sin dato de zona" : zona}` : ""}
          </CardTitle>
          <Link href="/vehiculos">
            <Button variant="outline" size="sm">
              Ver todos
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {ultimos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay retornos para esta zona. El tiempo en ruta se calcula automáticamente al completar el checklist de retorno.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Hora Retorno</TableHead>
                    <TableHead>Dominio</TableHead>
                    <TableHead>Zona</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead className="text-right">Tiempo real</TableHead>
                    {ajustar && <TableHead className="text-right">Ajustado</TableHead>}
                    <TableHead className="text-right w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ultimos.map((c) => {
                    const ajustado = minutosAjustados(c, true)
                    return (
                      <TableRow key={c.id ?? `${c.fecha}-${c.dominio}`}>
                        <TableCell className="text-sm">{c.fecha}</TableCell>
                        <TableCell className="text-sm font-mono">{c.hora ? formatHora(c.hora) : "—"}</TableCell>
                        <TableCell className="font-medium">{c.dominio}</TableCell>
                        <TableCell className="text-sm">{c.ruta ?? <span className="text-muted-foreground">sin dato</span>}</TableCell>
                        <TableCell className="text-sm">{c.chofer}</TableCell>
                        <TableCell>
                          <Badge className={
                            c.resultado === "aprobado"
                              ? "bg-green-100 text-green-700 hover:bg-green-100"
                              : "bg-red-100 text-red-700 hover:bg-red-100"
                          }>
                            {c.resultado === "aprobado" ? "Aprobado" : "Rechazado"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {ajustar && ajustado !== c.minutos ? (
                            <span className="text-sm text-muted-foreground">{formatMinutosToHoras(c.minutos)}</span>
                          ) : (
                            <TiempoRutaBadge minutos={c.minutos} />
                          )}
                        </TableCell>
                        {ajustar && (
                          <TableCell className="text-right">
                            {ajustado !== c.minutos ? <TiempoRutaBadge minutos={ajustado} /> : <span className="text-muted-foreground">=</span>}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {c.id && (
                            <Link href={`/vehiculos/checklist/${c.id}`}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
