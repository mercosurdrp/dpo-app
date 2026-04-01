"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  GraduationCap,
  Calendar,
  Clock,
  User,
  CheckCircle,
  XCircle,
  LogOut,
  Hand,
  Timer,
  Fingerprint,
  CalendarDays,
  TrendingUp,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  RESULTADO_COLORS,
  RESULTADO_LABELS,
} from "@/lib/constants"
import { createClient } from "@/lib/supabase/client"
import { checkInReunion } from "@/actions/reunion-preruta"
import type { Capacitacion, Asistencia } from "@/types/database"
import type { MiDashboardData } from "@/actions/mi-asistencia"

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

interface Props {
  capacitaciones: (Capacitacion & { asistencia: Asistencia | null })[]
  nombre: string
  reunion: { marcado: boolean; hora_checkin: string | null; minutos: number | null }
  dashboard: MiDashboardData | null
}

function formatHoraAR(fecha: string | null): string {
  if (!fecha) return "—"
  return fecha  // Ya viene como "HH:MM" desde el server
}

function formatFecha(fecha: string): string {
  const d = new Date(fecha + "T12:00:00")
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

export function MisCapacitacionesClient({ capacitaciones, nombre, reunion, dashboard }: Props) {
  const router = useRouter()
  const [reunionState, setReunionState] = useState(reunion)
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  async function handleCheckIn() {
    setLoading(true)
    const res = await checkInReunion()
    if ("data" in res) {
      setReunionState({
        marcado: true,
        hora_checkin: res.data.hora_checkin,
        minutos: res.data.minutos_fichaje_reunion,
      })
    } else {
      alert(res.error)
    }
    setLoading(false)
  }

  const pendientes = capacitaciones.filter(
    (c) => c.asistencia && c.asistencia.resultado === "pendiente"
  )
  const completadas = capacitaciones.filter(
    (c) => c.asistencia && c.asistencia.resultado !== "pendiente"
  )

  const mesActual = MESES[new Date().getMonth()]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mi Panel</h1>
          <p className="text-sm text-slate-500">
            Hola, {nombre}
            {dashboard && <span className="ml-2 text-xs text-slate-400">Legajo {dashboard.legajo}</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          <LogOut className="mr-2 size-4" />
          Salir
        </Button>
      </div>

      {/* Top Row: Reunión + Fichaje Hoy */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Reunión Pre-Ruta */}
        <Card className={reunionState.marcado ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Hand className="size-5" />
                Reunión Pre-Ruta
              </CardTitle>
              <Badge className={reunionState.marcado ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>
                {reunionState.marcado ? "Presente" : "Hoy"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {reunionState.marcado ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <CheckCircle className="size-6 text-green-500" />
                  <div>
                    <p className="font-semibold text-green-700 text-sm">Asistencia confirmada</p>
                    <p className="text-xs text-green-600">
                      {reunionState.hora_checkin ? formatHoraAR(reunionState.hora_checkin) : "—"}
                    </p>
                  </div>
                </div>
                {reunionState.minutos !== null && (
                  <div className="flex items-center gap-2 rounded-lg bg-white/60 px-3 py-1.5">
                    <Timer className="size-3.5 text-slate-500" />
                    <span className="text-xs text-slate-600">
                      Fichaje → reunión: <strong className={
                        reunionState.minutos <= 15 ? "text-green-600" :
                        reunionState.minutos <= 30 ? "text-amber-600" : "text-red-600"
                      }>{reunionState.minutos} min</strong>
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <Button onClick={handleCheckIn} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700" size="lg">
                {loading ? "Marcando..." : <><Hand className="mr-2 size-5" /> Marcar Asistencia</>}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Fichaje Hoy */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Fingerprint className="size-5" />
                Mi Fichaje Hoy
              </CardTitle>
              {dashboard?.fichaje_hoy.entrada ? (
                <Badge className="bg-green-100 text-green-700">Fichado</Badge>
              ) : (
                <Badge variant="secondary">Sin fichaje</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {dashboard?.fichaje_hoy.entrada ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-xs text-muted-foreground">Entrada</p>
                    <p className="text-lg font-bold text-slate-900">{formatHoraAR(dashboard.fichaje_hoy.entrada)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-xs text-muted-foreground">Salida</p>
                    <p className="text-lg font-bold text-slate-900">{formatHoraAR(dashboard.fichaje_hoy.salida)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-xs text-muted-foreground">Horas</p>
                    <p className={`text-lg font-bold ${
                      (dashboard.fichaje_hoy.horas_trabajadas ?? 0) >= 8 ? "text-green-600" :
                      (dashboard.fichaje_hoy.horas_trabajadas ?? 0) >= 6 ? "text-amber-600" : "text-slate-900"
                    }`}>
                      {dashboard.fichaje_hoy.horas_trabajadas ?? "—"}h
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">
                Todavía no fichaste hoy
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resumen del Mes */}
      {dashboard && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="size-5" />
              Resumen de {mesActual}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <TrendingUp className="mx-auto size-5 text-green-600 mb-1" />
                <p className="text-2xl font-bold text-green-700">{dashboard.resumen_mes.dias_trabajados}</p>
                <p className="text-xs text-green-600">Días trabajados</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <Clock className="mx-auto size-5 text-blue-600 mb-1" />
                <p className="text-2xl font-bold text-blue-700">{dashboard.resumen_mes.horas_totales}h</p>
                <p className="text-xs text-blue-600">Horas totales</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <Timer className="mx-auto size-5 text-slate-600 mb-1" />
                <p className="text-2xl font-bold text-slate-700">{dashboard.resumen_mes.promedio_horas}h</p>
                <p className="text-xs text-slate-600">Promedio/día</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <AlertTriangle className="mx-auto size-5 text-amber-600 mb-1" />
                <p className="text-2xl font-bold text-amber-700">{dashboard.resumen_mes.tardanzas}</p>
                <p className="text-xs text-amber-600">Tardanzas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historial 7 días */}
      {dashboard && dashboard.historial.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="size-5" />
              Últimos 7 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Día</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Salida</TableHead>
                    <TableHead className="text-right">Horas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.historial.map((dia) => (
                    <TableRow key={dia.fecha} className={!dia.entrada ? "opacity-40" : ""}>
                      <TableCell className="font-medium text-sm">{formatFecha(dia.fecha)}</TableCell>
                      <TableCell className="font-mono text-sm">{formatHoraAR(dia.entrada)}</TableCell>
                      <TableCell className="font-mono text-sm">{formatHoraAR(dia.salida)}</TableCell>
                      <TableCell className="text-right">
                        {dia.horas_trabajadas !== null ? (
                          <Badge className={
                            dia.horas_trabajadas >= 8 ? "bg-green-100 text-green-700 hover:bg-green-100" :
                            dia.horas_trabajadas >= 6 ? "bg-amber-100 text-amber-700 hover:bg-amber-100" :
                            "bg-red-100 text-red-700 hover:bg-red-100"
                          }>
                            {dia.horas_trabajadas}h
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Capacitaciones Pendientes */}
      {pendientes.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-700 flex items-center gap-2">
            <GraduationCap className="size-5" />
            Capacitaciones Pendientes
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {pendientes.map((cap) => (
              <Link key={cap.id} href={`/mis-capacitaciones/${cap.id}`}>
                <Card className="group cursor-pointer border-amber-200 bg-amber-50 transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base leading-tight group-hover:text-blue-600">
                        {cap.titulo}
                      </CardTitle>
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                        Pendiente
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-3.5" />
                      <span>{new Date(cap.fecha + "T12:00:00").toLocaleDateString("es-AR")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="size-3.5" />
                      <span>{cap.instructor}</span>
                    </div>
                    <Button size="sm" className="mt-2 w-full">Realizar examen</Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Completadas */}
      {completadas.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-700 flex items-center gap-2">
            <GraduationCap className="size-5" />
            Capacitaciones Completadas
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {completadas.map((cap) => {
              const resultado = cap.asistencia?.resultado ?? "pendiente"
              const nota = cap.asistencia?.nota
              const isAprobado = resultado === "aprobado"

              return (
                <Card key={cap.id} className="border-slate-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base leading-tight">{cap.titulo}</CardTitle>
                      <Badge variant="secondary" style={{
                        backgroundColor: RESULTADO_COLORS[resultado] + "20",
                        color: RESULTADO_COLORS[resultado],
                      }}>
                        {RESULTADO_LABELS[resultado]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-3.5" />
                      <span>{new Date(cap.fecha + "T12:00:00").toLocaleDateString("es-AR")}</span>
                    </div>
                    {nota !== null && nota !== undefined && (
                      <div className="flex items-center gap-2">
                        {isAprobado ? <CheckCircle className="size-4 text-green-500" /> : <XCircle className="size-4 text-red-500" />}
                        <span className="text-lg font-bold" style={{ color: isAprobado ? "#10B981" : "#EF4444" }}>
                          {nota}%
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
