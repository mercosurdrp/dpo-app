"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  Users,
  UserCheck,
  Timer,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Hand,
} from "lucide-react"
import type { ReunionKpis, ReunionResumenMensual } from "@/actions/reunion-preruta"
import { getReunionKpis, getReunionResumenMensual } from "@/actions/reunion-preruta"

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

function formatHora(fecha: string | null): string {
  if (!fecha) return "—"
  return new Date(fecha).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

function MinutosBadge({ minutos }: { minutos: number | null }) {
  if (minutos === null) return <span className="text-muted-foreground">—</span>
  if (minutos <= 15) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{minutos} min</Badge>
  if (minutos <= 30) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{minutos} min</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{minutos} min</Badge>
}

interface Props {
  kpis: ReunionKpis | null
  mensual: ReunionResumenMensual[]
  fechaInicial: string
  mesInicial: number
  anioInicial: number
}

export function ReunionPrerutaClient({ kpis, mensual, fechaInicial, mesInicial, anioInicial }: Props) {
  const [tab, setTab] = useState("diaria")
  const [fecha, setFecha] = useState(fechaInicial)
  const [mes, setMes] = useState(mesInicial)
  const [anio, setAnio] = useState(anioInicial)
  const [kpisData, setKpisData] = useState(kpis)
  const [mensualData, setMensualData] = useState(mensual)
  const [isPending, startTransition] = useTransition()

  function cambiarFecha(delta: number) {
    const d = new Date(fecha)
    d.setDate(d.getDate() + delta)
    const nuevaFecha = d.toISOString().slice(0, 10)
    setFecha(nuevaFecha)
    startTransition(async () => {
      const res = await getReunionKpis(nuevaFecha)
      if ("data" in res) setKpisData(res.data)
    })
  }

  function cambiarMes(delta: number) {
    let nuevoMes = mes + delta
    let nuevoAnio = anio
    if (nuevoMes > 12) { nuevoMes = 1; nuevoAnio++ }
    if (nuevoMes < 1) { nuevoMes = 12; nuevoAnio-- }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
    startTransition(async () => {
      const res = await getReunionResumenMensual(nuevoMes, nuevoAnio)
      if ("data" in res) setMensualData(res.data)
    })
  }

  const pctAsistencia = kpisData?.pct_asistencia ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Hand className="h-6 w-6" />
          Reunión Pre-Ruta
        </h1>
        <p className="text-sm text-muted-foreground">
          Asistencia a la reunión matinal — Pilar Entrega 1.1
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Empleados</p>
                <p className="text-3xl font-bold text-slate-900">{kpisData?.total_empleados ?? 0}</p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Users className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Asistieron</p>
                <p className={`text-3xl font-bold ${pctAsistencia >= 80 ? "text-green-600" : pctAsistencia >= 60 ? "text-amber-600" : "text-red-600"}`}>
                  {kpisData?.asistieron ?? 0}
                </p>
              </div>
              <div className={`rounded-full p-3 ${pctAsistencia >= 80 ? "bg-green-100" : pctAsistencia >= 60 ? "bg-amber-100" : "bg-red-100"}`}>
                <UserCheck className={`h-5 w-5 ${pctAsistencia >= 80 ? "text-green-600" : pctAsistencia >= 60 ? "text-amber-600" : "text-red-600"}`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {pctAsistencia}% asistencia
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tiempo Prom. Fichaje→Reunión</p>
                <p className={`text-3xl font-bold ${
                  (kpisData?.promedio_minutos ?? 99) <= 15 ? "text-green-600" :
                  (kpisData?.promedio_minutos ?? 99) <= 30 ? "text-amber-600" : "text-red-600"
                }`}>
                  {kpisData?.promedio_minutos ?? "—"}{kpisData?.promedio_minutos !== null ? " min" : ""}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Timer className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Días con Reunión (mes)</p>
                <p className="text-3xl font-bold text-slate-900">{mensualData.length}</p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <TrendingUp className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="diaria">Vista Diaria</TabsTrigger>
          <TabsTrigger value="mensual">Resumen Mensual</TabsTrigger>
        </TabsList>

        {/* Vista Diaria */}
        <TabsContent value="diaria">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Detalle del día
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => cambiarFecha(-1)} disabled={isPending}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Input
                    type="date"
                    value={fecha}
                    onChange={(e) => {
                      setFecha(e.target.value)
                      startTransition(async () => {
                        const res = await getReunionKpis(e.target.value)
                        if ("data" in res) setKpisData(res.data)
                      })
                    }}
                    className="w-40"
                  />
                  <Button variant="outline" size="icon" onClick={() => cambiarFecha(1)} disabled={isPending}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!kpisData || kpisData.detalle.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No hay datos para este día</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Legajo</TableHead>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Sector</TableHead>
                        <TableHead>Fichaje</TableHead>
                        <TableHead>Check-in Reunión</TableHead>
                        <TableHead className="text-center">Demora</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kpisData.detalle.map((emp) => (
                        <TableRow key={emp.legajo} className={!emp.asistio ? "opacity-50" : ""}>
                          <TableCell className="font-mono text-sm">{emp.legajo}</TableCell>
                          <TableCell className="font-medium">{emp.nombre}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{emp.sector}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{formatHora(emp.hora_fichaje)}</TableCell>
                          <TableCell className="font-mono text-sm">{formatHora(emp.hora_checkin)}</TableCell>
                          <TableCell className="text-center">
                            <MinutosBadge minutos={emp.minutos_fichaje_reunion} />
                          </TableCell>
                          <TableCell className="text-center">
                            {emp.asistio ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Presente</Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Ausente</Badge>
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
        </TabsContent>

        {/* Resumen Mensual */}
        <TabsContent value="mensual">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Resumen Mensual
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => cambiarMes(-1)} disabled={isPending}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[140px] text-center font-medium">
                    {MESES[mes - 1]} {anio}
                  </span>
                  <Button variant="outline" size="icon" onClick={() => cambiarMes(1)} disabled={isPending}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {mensualData.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No hay reuniones registradas este mes</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-center">Asistieron</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">% Asistencia</TableHead>
                        <TableHead className="text-center">Prom. Demora</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mensualData.map((dia) => (
                        <TableRow key={dia.fecha}>
                          <TableCell className="font-medium">{dia.fecha}</TableCell>
                          <TableCell className="text-center">{dia.asistieron}</TableCell>
                          <TableCell className="text-center text-muted-foreground">{dia.total_empleados}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={
                              dia.pct_asistencia >= 80 ? "bg-green-100 text-green-700 hover:bg-green-100" :
                              dia.pct_asistencia >= 60 ? "bg-amber-100 text-amber-700 hover:bg-amber-100" :
                              "bg-red-100 text-red-700 hover:bg-red-100"
                            }>
                              {dia.pct_asistencia}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <MinutosBadge minutos={dia.promedio_minutos} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
