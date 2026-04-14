"use client"

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
import type { OwdObservacion, OwdMensual, OwdItemStats } from "@/types/database"
import {
  Plus,
  ClipboardCheck,
  Target,
  AlertTriangle,
  CalendarCheck,
} from "lucide-react"

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

interface KpiData {
  totalObservaciones: number
  promedioCumplimiento: number
  obsMesActual: number
  metaMensual: number
  mensual: OwdMensual[]
  porEtapa: Array<{ etapa: string; pct: number; total: number }>
  itemsMasFallados: OwdItemStats[]
}

interface Props {
  kpis: KpiData
  observaciones: OwdObservacion[]
}

function PctBadge({ pct }: { pct: number }) {
  if (pct >= 90) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{pct.toFixed(0)}%</Badge>
  if (pct >= 75) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{pct.toFixed(0)}%</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{pct.toFixed(0)}%</Badge>
}

export function OwdClient({ kpis, observaciones }: Props) {
  const mensualData = kpis.mensual.map((m) => ({
    name: MESES[m.mes],
    cumplimiento: m.promedio_cumplimiento,
    total: m.total_observaciones,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">OWD Pre-Ruta</h1>
          <p className="text-sm text-muted-foreground">
            Observación en el puesto de trabajo — Pilar Entrega 1.1 R1.1.2
          </p>
        </div>
        <Link href="/indicadores/owd-pre-ruta/nueva">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Nueva OWD
          </Button>
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">% Cumplimiento</p>
                <p
                  className={`text-3xl font-bold ${
                    kpis.promedioCumplimiento >= 90
                      ? "text-green-600"
                      : kpis.promedioCumplimiento >= 75
                      ? "text-amber-600"
                      : "text-red-600"
                  }`}
                >
                  {kpis.promedioCumplimiento.toFixed(1)}%
                </p>
              </div>
              <div
                className={`rounded-full p-3 ${
                  kpis.promedioCumplimiento >= 90
                    ? "bg-green-100"
                    : kpis.promedioCumplimiento >= 75
                    ? "bg-amber-100"
                    : "bg-red-100"
                }`}
              >
                <Target
                  className={`h-5 w-5 ${
                    kpis.promedioCumplimiento >= 90
                      ? "text-green-600"
                      : kpis.promedioCumplimiento >= 75
                      ? "text-amber-600"
                      : "text-red-600"
                  }`}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Meta: ≥ 90%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Obs. del mes</p>
                <p className="text-3xl font-bold text-slate-900">
                  {kpis.obsMesActual}
                  <span className="text-lg font-normal text-muted-foreground">
                    /{kpis.metaMensual}
                  </span>
                </p>
              </div>
              <div className="rounded-full bg-blue-100 p-3">
                <CalendarCheck className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Meta: {kpis.metaMensual} OWD / mes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total acumulado</p>
                <p className="text-3xl font-bold text-slate-900">
                  {kpis.totalObservaciones}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <ClipboardCheck className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Observaciones cargadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ítems con desvíos</p>
                <p className="text-3xl font-bold text-red-600">
                  {kpis.itemsMasFallados.length}
                </p>
              </div>
              <div className="rounded-full bg-red-100 p-3">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Top 5 no conformes</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">% Cumplimiento por Mes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {mensualData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sin datos
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mensualData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                    <Tooltip formatter={(v) => [`${v}%`, "Cumplimiento"]} />
                    <ReferenceLine
                      y={90}
                      stroke="#10B981"
                      strokeDasharray="5 5"
                      label={{ value: "Meta 90%", position: "right", fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumplimiento"
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">% Cumplimiento por Etapa del SOP</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {kpis.porEtapa.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sin datos
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kpis.porEtapa} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" fontSize={11} unit="%" domain={[0, 100]} />
                    <YAxis
                      type="category"
                      dataKey="etapa"
                      fontSize={10}
                      width={120}
                    />
                    <Tooltip formatter={(v) => [`${v}%`, "Cumplimiento"]} />
                    <ReferenceLine x={90} stroke="#10B981" strokeDasharray="5 5" />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                      {kpis.porEtapa.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            entry.pct >= 90
                              ? "#10B981"
                              : entry.pct >= 75
                              ? "#F59E0B"
                              : "#EF4444"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top fallados */}
      {kpis.itemsMasFallados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 5 ítems con desvíos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {kpis.itemsMasFallados.map((item) => (
                <div
                  key={item.item_id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-slate-50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {item.etapa}
                    </p>
                    <p className="text-sm font-medium text-slate-900">{item.texto}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {item.total_nook} NO OK
                    </Badge>
                    <PctBadge pct={item.pct_cumplimiento} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla últimas observaciones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Últimas observaciones</CardTitle>
          <Link href="/indicadores/owd-pre-ruta/nueva">
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-4 w-4" /> Nueva
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {observaciones.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Todavía no hay observaciones cargadas. Iniciá la primera OWD del equipo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Supervisor</TableHead>
                    <TableHead>Empleado observado</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Dominio</TableHead>
                    <TableHead className="text-right">OK/NOOK</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {observaciones.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-sm">{o.fecha}</TableCell>
                      <TableCell className="text-sm">{o.supervisor}</TableCell>
                      <TableCell className="text-sm font-medium">
                        {o.empleado_observado}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {o.rol_empleado || "—"}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {o.dominio || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="text-green-600">{o.total_ok}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="text-red-600">{o.total_nook}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <PctBadge pct={Number(o.pct_cumplimiento)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/indicadores/owd-pre-ruta/${o.id}`}>
                          <Button variant="ghost" size="sm">
                            Ver
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
