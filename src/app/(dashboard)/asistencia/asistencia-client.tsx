"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
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
} from "lucide-react"
import type { ResumenDiarioEmpleado, ResumenMensualEmpleado, MarcaAsistencia, TipoNovedad } from "@/actions/asistencia"
import { getMarcasDiarias, getResumenMensual, setNovedad, removeNovedad } from "@/actions/asistencia"

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

const NOVEDAD_LABELS: Record<string, string> = {
  vacaciones: "Vacaciones",
  licencia_medica: "Licencia Médica",
  ausente: "Ausente",
  pergamino: "Pergamino",
}

const NOVEDAD_COLORS: Record<string, string> = {
  vacaciones: "bg-blue-100 text-blue-700",
  licencia_medica: "bg-purple-100 text-purple-700",
  ausente: "bg-red-100 text-red-700",
  pergamino: "bg-slate-100 text-slate-700",
}

function formatHora(fecha: string | null): string {
  if (!fecha) return "—"
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

function EstadoBadge({ emp }: { emp: ResumenDiarioEmpleado }) {
  if (emp.novedad) {
    return <Badge className={`${NOVEDAD_COLORS[emp.novedad]} hover:${NOVEDAD_COLORS[emp.novedad]}`}>{NOVEDAD_LABELS[emp.novedad]}</Badge>
  }
  if (emp.primera_entrada !== null) {
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Presente</Badge>
  }
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Ausente</Badge>
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
  const [sectorFilter, setSectorFilter] = useState<string>("todos")
  const [isPending, startTransition] = useTransition()

  const filteredDiaria = sectorFilter === "todos" ? diariaData : diariaData.filter((d) => d.sector === sectorFilter)
  const filteredMensual = sectorFilter === "todos" ? mensualData : mensualData.filter((d) => d.sector === sectorFilter)

  const presentesHoy = filteredDiaria.filter((d) => d.primera_entrada !== null || d.novedad === "pergamino").length
  const conNovedad = filteredDiaria.filter((d) => d.novedad && d.novedad !== "pergamino").length
  const ausentesHoy = filteredDiaria.filter((d) => d.primera_entrada === null && !d.novedad).length
  const totalEmpleados = filteredDiaria.length

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

  async function handleNovedad(legajo: number, value: string) {
    if (value === "none") {
      await removeNovedad(legajo, fecha)
    } else {
      await setNovedad({ legajo, fecha, tipo: value as TipoNovedad })
    }
    // Refresh
    const res = await getMarcasDiarias(fecha)
    if ("data" in res) setDiariaData(res.data)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Asistencia</h1>
          <p className="text-sm text-muted-foreground">
            Control de fichadas del reloj biométrico
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sector:</span>
          <Select defaultValue="todos" value={sectorFilter} onValueChange={(v) => { if (v) setSectorFilter(v) }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar sector" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="Depósito">Depósito</SelectItem>
              <SelectItem value="Distribución">Distribución</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                <p className="text-sm text-muted-foreground">Ausentes</p>
                <p className="text-3xl font-bold text-red-600">{ausentesHoy}</p>
              </div>
              <div className="rounded-full bg-red-100 p-3">
                <UserX className="h-5 w-5 text-red-600" />
              </div>
            </div>
            {conNovedad > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                + {conNovedad} con novedad
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tardanzas (mes)</p>
                <p className="text-3xl font-bold text-amber-600">
                  {filteredMensual.reduce((s, e) => s + e.tardanzas, 0)}
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
              <div className="flex items-center justify-between flex-wrap gap-2">
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
              {filteredDiaria.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No hay empleados registrados</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Legajo</TableHead>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Sector</TableHead>
                        <TableHead>Entrada</TableHead>
                        <TableHead>Salida</TableHead>
                        <TableHead className="text-right">Horas</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                        <TableHead className="text-center">Novedad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDiaria.map((emp) => (
                        <TableRow key={emp.legajo} className={emp.primera_entrada === null && !emp.novedad ? "opacity-50" : ""}>
                          <TableCell className="font-mono text-sm">{emp.legajo}</TableCell>
                          <TableCell className="font-medium">{emp.nombre}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {emp.sector}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{formatHora(emp.primera_entrada)}</TableCell>
                          <TableCell className="font-mono text-sm">{formatHora(emp.ultima_salida)}</TableCell>
                          <TableCell className="text-right">
                            <HorasBadge horas={emp.horas_trabajadas} />
                          </TableCell>
                          <TableCell className="text-center">
                            <EstadoBadge emp={emp} />
                          </TableCell>
                          <TableCell className="text-center">
                            <Select
                              value={emp.novedad ?? "none"}
                              onValueChange={(v) => { if (v) handleNovedad(emp.legajo, v) }}
                            >
                              <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue placeholder="Sin novedad" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin novedad</SelectItem>
                                <SelectItem value="vacaciones">Vacaciones</SelectItem>
                                <SelectItem value="licencia_medica">Licencia Médica</SelectItem>
                                <SelectItem value="ausente">Ausente</SelectItem>
                                <SelectItem value="pergamino">Pergamino</SelectItem>
                              </SelectContent>
                            </Select>
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
              {filteredMensual.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No hay datos para este mes</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Legajo</TableHead>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Sector</TableHead>
                        <TableHead className="text-center">Días Trabajados</TableHead>
                        <TableHead className="text-right">Horas Totales</TableHead>
                        <TableHead className="text-right">Prom. Hs/Día</TableHead>
                        <TableHead className="text-center">Tardanzas</TableHead>
                        <TableHead className="text-center">Ausencias</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMensual.map((emp) => (
                        <TableRow key={emp.legajo}>
                          <TableCell className="font-mono text-sm">{emp.legajo}</TableCell>
                          <TableCell className="font-medium">{emp.nombre}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {emp.sector}
                            </Badge>
                          </TableCell>
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
                          <TableCell className="text-sm">{m.fecha_marca.slice(0, 10)}</TableCell>
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
