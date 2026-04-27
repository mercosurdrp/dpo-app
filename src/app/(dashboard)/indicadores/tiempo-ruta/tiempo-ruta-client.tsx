"use client"

import { useState } from "react"
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
}

interface Props {
  kpis: KpiData
  checklists: ChecklistVehiculo[]
  vehiculos: CatalogoVehiculo[]
}

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const META_HORAS = 8

function formatMinutosToHoras(min: number): string {
  const hh = Math.floor(min / 60)
  const mm = min % 60
  return `${hh}h ${mm.toString().padStart(2, "0")}m`
}

function TiempoRutaBadge({ minutos }: { minutos: number }) {
  const text = formatMinutosToHoras(minutos)
  if (minutos <= 480) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{text}</Badge>
  if (minutos <= 540) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{text}</Badge>
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

export function TiempoRutaClient({ kpis, checklists, vehiculos }: Props) {
  const [tab, setTab] = useState("semanal")

  const semanalData = kpis.semanal.map((s) => ({
    name: `S${s.semana}`,
    horas: +(s.promedio_minutos / 60).toFixed(1),
    pctMeta: s.pct_dentro_meta,
    retornos: s.total_retornos,
  }))

  const mensualData = kpis.mensual.map((m) => ({
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
        <Link href="/vehiculos/checklist">
          <Button>
            <Activity className="mr-2 h-4 w-4" /> Nuevo Checklist
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Promedio Ruta</p>
                <p className={`text-3xl font-bold ${
                  kpis.promedioMinutos <= 480 ? "text-green-600" : kpis.promedioMinutos <= 540 ? "text-amber-600" : "text-red-600"
                }`}>
                  {kpis.promedioHoras}
                </p>
              </div>
              <div className={`rounded-full p-3 ${
                kpis.promedioMinutos <= 480 ? "bg-green-100" : kpis.promedioMinutos <= 540 ? "bg-amber-100" : "bg-red-100"
              }`}>
                <Clock className={`h-5 w-5 ${
                  kpis.promedioMinutos <= 480 ? "text-green-600" : kpis.promedioMinutos <= 540 ? "text-amber-600" : "text-red-600"
                }`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Meta: ≤ 8 horas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">% Dentro Meta</p>
                <p className={`text-3xl font-bold ${
                  kpis.pctDentroMeta >= 65 ? "text-green-600" : kpis.pctDentroMeta >= 50 ? "text-amber-600" : "text-red-600"
                }`}>
                  {kpis.pctDentroMeta}%
                </p>
              </div>
              <div className={`rounded-full p-3 ${
                kpis.pctDentroMeta >= 65 ? "bg-green-100" : kpis.pctDentroMeta >= 50 ? "bg-amber-100" : "bg-red-100"
              }`}>
                <Target className={`h-5 w-5 ${
                  kpis.pctDentroMeta >= 65 ? "text-green-600" : kpis.pctDentroMeta >= 50 ? "text-amber-600" : "text-red-600"
                }`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {kpis.dentroMeta}/{kpis.totalRetornos} retornos dentro de meta
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Retornos</p>
                <p className="text-3xl font-bold text-slate-900">
                  {kpis.totalRetornos}
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
                  <Tendencia mensual={kpis.mensual} />
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
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="semanal">Semanal</TabsTrigger>
          <TabsTrigger value="mensual">Mensual</TabsTrigger>
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
                      <ReferenceLine y={META_HORAS} stroke="#10B981" strokeDasharray="5 5" label={{ value: "Meta 8h", position: "right", fontSize: 10 }} />
                      <Bar dataKey="horas" radius={[4, 4, 0, 0]}>
                        {semanalData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.horas <= 8 ? "#10B981" : entry.horas <= 9 ? "#F59E0B" : "#EF4444"}
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
                <CardTitle className="text-base">% Dentro de Meta por Semana</CardTitle>
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
                      <ReferenceLine y={65} stroke="#10B981" strokeDasharray="5 5" label={{ value: "65%", position: "right", fontSize: 10 }} />
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
                      <ReferenceLine y={META_HORAS} stroke="#10B981" strokeDasharray="5 5" label={{ value: "Meta 8h", position: "right", fontSize: 10 }} />
                      <Bar dataKey="horas" radius={[4, 4, 0, 0]}>
                        {mensualData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.horas <= 8 ? "#10B981" : entry.horas <= 9 ? "#F59E0B" : "#EF4444"}
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
                <CardTitle className="text-base">% Dentro de Meta por Mes</CardTitle>
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
                      <ReferenceLine y={65} stroke="#10B981" strokeDasharray="5 5" label={{ value: "65%", position: "right", fontSize: 10 }} />
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
      </Tabs>

      {/* Recent retorno checklists */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Últimos Retornos</CardTitle>
          <Link href="/vehiculos">
            <Button variant="outline" size="sm">
              Ver todos
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {checklists.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay checklists de retorno registrados. El tiempo en ruta se calcula automáticamente al completar el checklist de retorno.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Hora Retorno</TableHead>
                    <TableHead>Dominio</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead className="text-right">Tiempo Ruta</TableHead>
                    <TableHead className="text-right w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checklists.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{c.fecha}</TableCell>
                      <TableCell className="text-sm font-mono">{formatHora(c.hora)}</TableCell>
                      <TableCell className="font-medium">{c.dominio}</TableCell>
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
                        {c.tiempo_ruta_minutos != null ? (
                          <TiempoRutaBadge minutos={c.tiempo_ruta_minutos} />
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/vehiculos/checklist/${c.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
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
