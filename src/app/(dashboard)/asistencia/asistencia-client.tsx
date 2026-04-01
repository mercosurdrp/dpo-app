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
  Clock,
  AlertTriangle,
  CalendarDays,
  UserCheck,
  UserX,
  ChevronLeft,
  ChevronRight,
  ArrowDownUp,
} from "lucide-react"
import type { ResumenDiarioEmpleado, ResumenMensualEmpleado, MarcaAsistencia } from "@/actions/asistencia"
import { getMarcasDiarias, getResumenMensual } from "@/actions/asistencia"

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

function formatHora(fecha: string | null): string {
  if (!fecha) return "—"
  // Mostrar en hora Argentina (UTC-3)
  return new Date(fecha).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

function HorasBadge({ horas }: { horas: number | null }) {
  if (horas === null) return <Badge variant="secondary" className="text-xs">Sin datos</Badge>
  if (horas >= 8) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{horas}h</Badge>
  if (horas >= 6) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{horas}h</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{horas}h</Badge>
}

function TipoMarcaBadge({ tipo }: { tipo: string }) {
  if (tipo === "E") return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Entrada</Badge>
  return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Salida</Badge>
}

interface Props {
  diaria: ResumenDiarioEmpleado[]
  mensual: ResumenMensualEmpleado[]
  ultimas: (MarcaAsistencia & { nombre_empleado: string })[]
  fechaInicial: string
  mesInicial: number
  anioInicial: number
}

export function AsistenciaClient({ diaria, mensual, ultimas, fechaInicial, mesInicial, anioInicial }: Props) {
  const [tab, setTab] = useState("diaria")
  const [fecha, setFecha] = useState(fechaInicial)
  const [mes, setMes] = useState(mesInicial)
  const [anio, setAnio] = useState(anioInicial)
  const [diariaData, setDiariaData] = useState(diaria)
  const [mensualData, setMensualData] = useState(mensual)
  const [isPending, startTransition] = useTransition()

  const presentesHoy = diariaData.filter((d) => d.primera_entrada !== null).length
  const ausentesHoy = diariaData.filter((d) => d.primera_entrada === null).length
  const totalEmpleados = diariaData.length

  function cambiarFecha(delta: number) {
    const d = new Date(fecha)
    d.setDate(d.getDate() + delta)
    const nuevaFecha = d.toISOString().slice(0, 10)
    setFecha(nuevaFecha)
    startTransition(async () => {
      const res = await getMarcasDiarias(nuevaFecha)
      if ("data" in res) setDiariaData(res.data)
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
      const res = await getResumenMensual(nuevoMes, nuevoAnio)
      if ("data" in res) setMensualData(res.data)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Asistencia</h1>
        <p className="text-sm text-muted-foreground">
          Control de fichadas del reloj biométrico
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Empleados</p>
                <p className="text-3xl font-bold text-slate-900">{totalEmpleados}</p>
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
                <p className="text-sm text-muted-foreground">Presentes Hoy</p>
                <p className="text-3xl font-bold text-green-600">{presentesHoy}</p>
              </div>
              <div className="rounded-full bg-green-100 p-3">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {totalEmpleados > 0 ? Math.round((presentesHoy / totalEmpleados) * 100) : 0}% presentismo
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ausentes Hoy</p>
                <p className="text-3xl font-bold text-red-600">{ausentesHoy}</p>
              </div>
              <div className="rounded-full bg-red-100 p-3">
                <UserX className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tardanzas (mes)</p>
                <p className="text-3xl font-bold text-amber-600">
                  {mensualData.reduce((s, e) => s + e.tardanzas, 0)}
                </p>
              </div>
              <div className="rounded-full bg-amber-100 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
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
          <TabsTrigger value="fichadas">Últimas Fichadas</TabsTrigger>
        </TabsList>

        {/* Vista Diaria */}
        <TabsContent value="diaria">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Asistencia del día
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
                        const res = await getMarcasDiarias(e.target.value)
                        if ("data" in res) setDiariaData(res.data)
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
              {diariaData.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No hay empleados registrados</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Legajo</TableHead>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Entrada</TableHead>
                        <TableHead>Salida</TableHead>
                        <TableHead className="text-right">Horas</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diariaData.map((emp) => (
                        <TableRow key={emp.legajo} className={emp.primera_entrada === null ? "opacity-50" : ""}>
                          <TableCell className="font-mono text-sm">{emp.legajo}</TableCell>
                          <TableCell className="font-medium">{emp.nombre}</TableCell>
                          <TableCell className="font-mono text-sm">{formatHora(emp.primera_entrada)}</TableCell>
                          <TableCell className="font-mono text-sm">{formatHora(emp.ultima_salida)}</TableCell>
                          <TableCell className="text-right">
                            <HorasBadge horas={emp.horas_trabajadas} />
                          </TableCell>
                          <TableCell className="text-center">
                            {emp.primera_entrada !== null ? (
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
                <p className="py-8 text-center text-muted-foreground">No hay datos para este mes</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Legajo</TableHead>
                        <TableHead>Empleado</TableHead>
                        <TableHead className="text-center">Días Trabajados</TableHead>
                        <TableHead className="text-right">Horas Totales</TableHead>
                        <TableHead className="text-right">Prom. Hs/Día</TableHead>
                        <TableHead className="text-center">Tardanzas</TableHead>
                        <TableHead className="text-center">Ausencias</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mensualData.map((emp) => (
                        <TableRow key={emp.legajo}>
                          <TableCell className="font-mono text-sm">{emp.legajo}</TableCell>
                          <TableCell className="font-medium">{emp.nombre}</TableCell>
                          <TableCell className="text-center">{emp.dias_trabajados}</TableCell>
                          <TableCell className="text-right font-mono">{emp.horas_totales}h</TableCell>
                          <TableCell className="text-right">
                            <HorasBadge horas={emp.promedio_horas} />
                          </TableCell>
                          <TableCell className="text-center">
                            {emp.tardanzas > 0 ? (
                              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{emp.tardanzas}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {emp.ausencias > 0 ? (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{emp.ausencias}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
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

        {/* Últimas Fichadas */}
        <TabsContent value="fichadas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Últimas 50 Fichadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ultimas.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  No hay fichadas registradas. Las marcas se sincronizan automáticamente desde el reloj biométrico.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Hora</TableHead>
                        <TableHead>Legajo</TableHead>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Reloj</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ultimas.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm">{new Date(m.fecha_marca).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</TableCell>
                          <TableCell className="font-mono text-sm">{formatHora(m.fecha_marca)}</TableCell>
                          <TableCell className="font-mono text-sm">{m.legajo}</TableCell>
                          <TableCell className="font-medium">{m.nombre_empleado}</TableCell>
                          <TableCell><TipoMarcaBadge tipo={m.tipo_marca} /></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.reloj_marca ?? "—"}</TableCell>
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
