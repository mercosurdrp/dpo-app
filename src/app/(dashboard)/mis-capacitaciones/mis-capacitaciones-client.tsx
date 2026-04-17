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
  Package,
  Truck,
  Ban,
  Gauge,
  ClipboardCheck,
  Fuel,
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
import type { MiEntregaData } from "@/actions/mi-entrega"

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

interface Props {
  capacitaciones: (Capacitacion & { asistencia: Asistencia | null })[]
  nombre: string
  reunion: { marcado: boolean; hora_checkin: string | null; minutos: number | null }
  dashboard: MiDashboardData | null
  entrega: MiEntregaData | null
}

function formatHoraAR(fecha: string | null): string {
  if (!fecha) return "—"
  return fecha  // Ya viene como "HH:MM" desde el server
}

function formatFecha(fecha: string): string {
  const d = new Date(fecha + "T12:00:00")
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

export function MisCapacitacionesClient({ capacitaciones, nombre, reunion, dashboard, entrega }: Props) {
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

      {/* ===== ENTREGAS ===== */}

      {/* Not linked warning */}
      {entrega && !entrega.vinculado && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="size-6 text-amber-600 shrink-0" />
            <div>
              <p className="font-medium text-amber-800">Sin vincular al sistema de entregas</p>
              <p className="text-sm text-amber-600">Contacta al administrador para vincular tu legajo.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mi Entrega Hoy */}
      {entrega?.vinculado && (
        <Card className="border-indigo-200 bg-indigo-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="size-5 text-indigo-600" />
                Mi Entrega Hoy
              </CardTitle>
              {entrega.hoy ? (
                <Badge className="bg-indigo-100 text-indigo-700 font-mono">
                  {entrega.hoy.dominio ?? "—"}
                </Badge>
              ) : (
                <Badge variant="secondary">Sin datos</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {entrega.hoy ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg bg-white p-2.5 text-center">
                  <Package className="mx-auto size-4 text-indigo-600 mb-1" />
                  <p className="text-xl font-bold text-indigo-700">{Math.round(entrega.hoy.bultos_entregados)}</p>
                  <p className="text-[11px] text-indigo-600">Bultos</p>
                </div>
                <div className="rounded-lg bg-white p-2.5 text-center">
                  <Truck className="mx-auto size-4 text-blue-600 mb-1" />
                  <p className="text-xl font-bold text-blue-700">{entrega.hoy.viajes}</p>
                  <p className="text-[11px] text-blue-600">Viajes</p>
                </div>
                <div className="rounded-lg bg-white p-2.5 text-center">
                  <Ban className="mx-auto size-4 mb-1" style={{ color: entrega.hoy.pct_rechazo <= 1.5 ? "#16a34a" : entrega.hoy.pct_rechazo <= 3 ? "#d97706" : "#dc2626" }} />
                  <p className="text-xl font-bold" style={{ color: entrega.hoy.pct_rechazo <= 1.5 ? "#16a34a" : entrega.hoy.pct_rechazo <= 3 ? "#d97706" : "#dc2626" }}>
                    {entrega.hoy.pct_rechazo}%
                  </p>
                  <p className="text-[11px] text-slate-600">Rechazo</p>
                </div>
                <div className="rounded-lg bg-white p-2.5 text-center">
                  <Gauge className="mx-auto size-4 mb-1" style={{ color: (entrega.hoy.tml_minutos ?? 99) <= 30 ? "#16a34a" : (entrega.hoy.tml_minutos ?? 99) <= 45 ? "#d97706" : "#dc2626" }} />
                  <p className="text-xl font-bold" style={{ color: (entrega.hoy.tml_minutos ?? 99) <= 30 ? "#16a34a" : (entrega.hoy.tml_minutos ?? 99) <= 45 ? "#d97706" : "#dc2626" }}>
                    {entrega.hoy.tml_minutos ?? "—"}
                  </p>
                  <p className="text-[11px] text-slate-600">TML min</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">
                Sin datos de entrega hoy
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Acciones Vehículo */}
      {entrega?.vinculado && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/vehiculos/checklist">
            <Card className="group cursor-pointer border-blue-200 bg-blue-50 transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 py-5">
                <div className="rounded-xl bg-blue-100 p-3 group-hover:bg-blue-200 transition-colors">
                  <ClipboardCheck className="size-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Checklist Liberación</p>
                  <p className="text-sm text-blue-600">Salida a ruta</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/vehiculos/checklist">
            <Card className="group cursor-pointer border-green-200 bg-green-50 transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 py-5">
                <div className="rounded-xl bg-green-100 p-3 group-hover:bg-green-200 transition-colors">
                  <ClipboardCheck className="size-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Checklist Retorno</p>
                  <p className="text-sm text-green-600">Vuelta de ruta</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/vehiculos/combustible">
            <Card className="group cursor-pointer border-amber-200 bg-amber-50 transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 py-5">
                <div className="rounded-xl bg-amber-100 p-3 group-hover:bg-amber-200 transition-colors">
                  <Fuel className="size-6 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Carga Combustible</p>
                  <p className="text-sm text-amber-600">Registrar carga</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {/* Reporte de Seguridad — visible siempre */}
      <Link href="/reportar-seguridad">
        <Card className="group cursor-pointer border-red-200 bg-red-50 transition-shadow hover:shadow-md">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-xl bg-red-100 p-3 group-hover:bg-red-200 transition-colors">
              <AlertTriangle className="size-6 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">Reportar incidente / acto inseguro</p>
              <p className="text-sm text-red-600">Accidente, acto inseguro, ruta de riesgo o reconocimiento</p>
            </div>
          </CardContent>
        </Card>
      </Link>


      {/* Resumen Entregas del Mes */}
      {entrega?.vinculado && entrega.resumen_mes.dias_con_entrega > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="size-5" />
              Entregas de {mesActual}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-indigo-50 p-3 text-center">
                <Package className="mx-auto size-5 text-indigo-600 mb-1" />
                <p className="text-2xl font-bold text-indigo-700">{entrega.resumen_mes.total_bultos}</p>
                <p className="text-xs text-indigo-600">Bultos totales</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <Truck className="mx-auto size-5 text-blue-600 mb-1" />
                <p className="text-2xl font-bold text-blue-700">{entrega.resumen_mes.total_viajes}</p>
                <p className="text-xs text-blue-600">Viajes totales</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <TrendingUp className="mx-auto size-5 text-slate-600 mb-1" />
                <p className="text-2xl font-bold text-slate-700">{entrega.resumen_mes.promedio_bultos_dia}</p>
                <p className="text-xs text-slate-600">Prom. bultos/día</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${entrega.resumen_mes.pct_rechazo_mes <= 1.5 ? "bg-green-50" : entrega.resumen_mes.pct_rechazo_mes <= 3 ? "bg-amber-50" : "bg-red-50"}`}>
                <Ban className="mx-auto size-5 mb-1" style={{ color: entrega.resumen_mes.pct_rechazo_mes <= 1.5 ? "#16a34a" : entrega.resumen_mes.pct_rechazo_mes <= 3 ? "#d97706" : "#dc2626" }} />
                <p className="text-2xl font-bold" style={{ color: entrega.resumen_mes.pct_rechazo_mes <= 1.5 ? "#16a34a" : entrega.resumen_mes.pct_rechazo_mes <= 3 ? "#d97706" : "#dc2626" }}>
                  {entrega.resumen_mes.pct_rechazo_mes}%
                </p>
                <p className="text-xs text-slate-600">% Rechazo mes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historial Entregas 7 días */}
      {entrega?.vinculado && entrega.historial.some((d) => d.bultos > 0 || d.tml_minutos !== null) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="size-5" />
              Entregas - Últimos 7 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Día</TableHead>
                    <TableHead>Patente</TableHead>
                    <TableHead className="text-right">Bultos</TableHead>
                    <TableHead className="text-right">Viajes</TableHead>
                    <TableHead className="text-right">Rechazos</TableHead>
                    <TableHead className="text-right">TML</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entrega.historial.map((dia) => {
                    const hasData = dia.bultos > 0 || dia.tml_minutos !== null
                    return (
                      <TableRow key={dia.fecha} className={!hasData ? "opacity-40" : ""}>
                        <TableCell className="font-medium text-sm">{formatFecha(dia.fecha)}</TableCell>
                        <TableCell className="font-mono text-sm">{dia.dominio ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold">{dia.bultos > 0 ? Math.round(dia.bultos) : "—"}</TableCell>
                        <TableCell className="text-right">{dia.viajes > 0 ? dia.viajes : "—"}</TableCell>
                        <TableCell className="text-right">
                          {dia.rechazos > 0 ? (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{Math.round(dia.rechazos)}</Badge>
                          ) : dia.bultos > 0 ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">0</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {dia.tml_minutos !== null ? (
                            <Badge className={
                              dia.tml_minutos <= 30 ? "bg-green-100 text-green-700 hover:bg-green-100" :
                              dia.tml_minutos <= 45 ? "bg-amber-100 text-amber-700 hover:bg-amber-100" :
                              "bg-red-100 text-red-700 hover:bg-red-100"
                            }>
                              {dia.tml_minutos}m
                            </Badge>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
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
              const puedeReintentar = resultado === "desaprobado"
              const borderClass = puedeReintentar
                ? "border-red-300 bg-red-50 hover:shadow-md transition-shadow"
                : "border-slate-200 hover:shadow-md transition-shadow"

              return (
                <Link key={cap.id} href={`/mis-capacitaciones/${cap.id}`}>
                  <Card className={`group cursor-pointer ${borderClass}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base leading-tight group-hover:text-blue-600">{cap.titulo}</CardTitle>
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
                      {puedeReintentar && (
                        <Button size="sm" className="mt-2 w-full bg-blue-600 hover:bg-blue-700">
                          Rendir nuevamente
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
