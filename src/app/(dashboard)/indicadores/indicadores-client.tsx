"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  RegistroVehiculo,
  TmlSemanal,
  TmlMensual,
  CatalogoChofer,
  CatalogoVehiculo,
} from "@/types/database"
import {
  Plus,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Truck,
  BarChart3,
  Minus,
} from "lucide-react"

interface KpiData {
  totalEgresos: number
  promedioTml: number
  dentroMeta: number
  pctDentroMeta: number
  metaMinutos: number
  semanal: TmlSemanal[]
  mensual: TmlMensual[]
}

interface Props {
  kpis: KpiData
  registros: RegistroVehiculo[]
  choferes: CatalogoChofer[]
  vehiculos: CatalogoVehiculo[]
}

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

function TmlBadge({ tml }: { tml: number }) {
  if (tml <= 30) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{tml} min</Badge>
  if (tml <= 45) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{tml} min</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{tml} min</Badge>
}

function Tendencia({ mensual }: { mensual: TmlMensual[] }) {
  if (mensual.length < 2) return <span className="text-sm text-muted-foreground">Sin datos suficientes</span>
  const last3 = mensual.slice(-3)
  const first = last3[0].promedio_tml
  const last = last3[last3.length - 1].promedio_tml
  const diff = last - first

  if (diff < -2) return (
    <span className="flex items-center gap-1 text-sm font-medium text-green-600">
      <TrendingDown className="h-4 w-4" /> Mejora ({Math.abs(diff)} min)
    </span>
  )
  if (diff > 2) return (
    <span className="flex items-center gap-1 text-sm font-medium text-red-600">
      <TrendingUp className="h-4 w-4" /> Deterioro (+{diff} min)
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-sm font-medium text-slate-600">
      <Minus className="h-4 w-4" /> Estable
    </span>
  )
}

export function IndicadoresClient({ kpis, registros }: Props) {
  const [tab, setTab] = useState("semanal")

  const semanalData = kpis.semanal.map((s) => ({
    name: `S${s.semana}`,
    tml: s.promedio_tml,
    pctMeta: s.pct_dentro_meta,
    egresos: s.total_egresos,
  }))

  const mensualData = kpis.mensual.map((m) => ({
    name: MESES[m.mes],
    tml: m.promedio_tml,
    pctMeta: m.pct_dentro_meta,
    egresos: m.total_egresos,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Indicadores Pre Ruta
          </h1>
          <p className="text-sm text-muted-foreground">
            KPIs de Tiempo Medio de Liberación (TML) — Pilar Entrega 1.1
          </p>
        </div>
        <Link href="/indicadores/registro">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Nuevo Registro
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">TML Promedio</p>
                <p className={`text-3xl font-bold ${
                  kpis.promedioTml <= 30 ? "text-green-600" : kpis.promedioTml <= 45 ? "text-amber-600" : "text-red-600"
                }`}>
                  {kpis.promedioTml} min
                </p>
              </div>
              <div className={`rounded-full p-3 ${
                kpis.promedioTml <= 30 ? "bg-green-100" : kpis.promedioTml <= 45 ? "bg-amber-100" : "bg-red-100"
              }`}>
                <Clock className={`h-5 w-5 ${
                  kpis.promedioTml <= 30 ? "text-green-600" : kpis.promedioTml <= 45 ? "text-amber-600" : "text-red-600"
                }`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Meta: ≤ 30 min</p>
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
              Meta: ≥ 65% — {kpis.dentroMeta}/{kpis.totalEgresos} egresos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Egresos</p>
                <p className="text-3xl font-bold text-slate-900">
                  {kpis.totalEgresos}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Truck className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Registros cargados</p>
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
                <CardTitle className="text-base">TML Promedio por Semana</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={semanalData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit=" min" />
                      <Tooltip
                        formatter={(value) => [`${value} min`, "TML"]}
                        labelFormatter={(label) => `Semana ${label}`}
                      />
                      <ReferenceLine y={30} stroke="#10B981" strokeDasharray="5 5" label={{ value: "Meta 30min", position: "right", fontSize: 10 }} />
                      <Bar dataKey="tml" radius={[4, 4, 0, 0]}>
                        {semanalData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.tml <= 30 ? "#10B981" : entry.tml <= 45 ? "#F59E0B" : "#EF4444"}
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
                        stroke="#F59E0B"
                        strokeWidth={2}
                        dot={{ fill: "#F59E0B", r: 3 }}
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
                <CardTitle className="text-base">TML Promedio por Mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mensualData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit=" min" />
                      <Tooltip
                        formatter={(value) => [`${value} min`, "TML"]}
                      />
                      <ReferenceLine y={30} stroke="#10B981" strokeDasharray="5 5" label={{ value: "Meta 30min", position: "right", fontSize: 10 }} />
                      <Bar dataKey="tml" radius={[4, 4, 0, 0]}>
                        {mensualData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.tml <= 30 ? "#10B981" : entry.tml <= 45 ? "#F59E0B" : "#EF4444"}
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
                        stroke="#F59E0B"
                        strokeWidth={2}
                        dot={{ fill: "#F59E0B", r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Recent records table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Últimos Registros</CardTitle>
          <Link href="/indicadores/registro">
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-4 w-4" /> Registrar
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {registros.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay registros cargados. Importá desde el Excel o registrá nuevos egresos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Dominio</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead>Ayudante 1</TableHead>
                    <TableHead>Odómetro</TableHead>
                    <TableHead className="text-right">TML</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.fecha}</TableCell>
                      <TableCell className="text-sm font-mono">{r.hora.slice(0, 5)}</TableCell>
                      <TableCell className="font-medium">{r.dominio}</TableCell>
                      <TableCell className="text-sm">{r.chofer}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.ayudante1 || "—"}</TableCell>
                      <TableCell className="text-sm font-mono">{r.odometro || "—"}</TableCell>
                      <TableCell className="text-right">
                        {r.tml_minutos != null ? <TmlBadge tml={r.tml_minutos} /> : "—"}
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
