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
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  RESULTADO_COLORS,
  RESULTADO_LABELS,
} from "@/lib/constants"
import { createClient } from "@/lib/supabase/client"
import { checkInReunion } from "@/actions/reunion-preruta"
import type { Capacitacion, Asistencia } from "@/types/database"

interface Props {
  capacitaciones: (Capacitacion & { asistencia: Asistencia | null })[]
  nombre: string
  reunion: { marcado: boolean; hora_checkin: string | null; minutos: number | null }
}

function formatHoraAR(fecha: string): string {
  const d = new Date(fecha)
  d.setHours(d.getHours() + 3)
  return d.getUTCHours().toString().padStart(2, "0") + ":" + d.getUTCMinutes().toString().padStart(2, "0")
}

export function MisCapacitacionesClient({ capacitaciones, nombre, reunion }: Props) {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Mi Panel
          </h1>
          <p className="text-sm text-slate-500">Hola, {nombre}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          <LogOut className="mr-2 size-4" />
          Salir
        </Button>
      </div>

      {/* Reunión Pre-Ruta Card */}
      <Card className={reunionState.marcado
        ? "border-green-200 bg-green-50"
        : "border-blue-200 bg-blue-50"
      }>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Hand className="size-5" />
              Reunión Pre-Ruta
            </CardTitle>
            <Badge className={reunionState.marcado
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
            }>
              {reunionState.marcado ? "Presente" : "Hoy"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {reunionState.marcado ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="size-8 text-green-500" />
                <div>
                  <p className="font-semibold text-green-700">Asistencia confirmada</p>
                  <p className="text-sm text-green-600">
                    Marcaste a las {reunionState.hora_checkin ? formatHoraAR(reunionState.hora_checkin) : "—"}
                  </p>
                </div>
              </div>
              {reunionState.minutos !== null && (
                <div className="flex items-center gap-2 rounded-lg bg-white/60 px-3 py-2">
                  <Timer className="size-4 text-slate-500" />
                  <span className="text-sm text-slate-600">
                    Tiempo fichaje → reunión: <strong className={
                      reunionState.minutos <= 15 ? "text-green-600" :
                      reunionState.minutos <= 30 ? "text-amber-600" : "text-red-600"
                    }>{reunionState.minutos} min</strong>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Marcá tu asistencia a la reunión matinal pre-ruta de hoy.
              </p>
              <Button
                onClick={handleCheckIn}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {loading ? (
                  "Marcando..."
                ) : (
                  <>
                    <Hand className="mr-2 size-5" />
                    Marcar Asistencia
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pendientes */}
      {pendientes.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-700">
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
                      <span>
                        {new Date(cap.fecha + "T12:00:00").toLocaleDateString("es-AR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="size-3.5" />
                      <span>{cap.instructor}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="size-3.5" />
                      <span>{cap.duracion_horas}h</span>
                    </div>
                    <Button size="sm" className="mt-2 w-full">
                      Realizar examen
                    </Button>
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
          <h2 className="mb-3 text-lg font-semibold text-slate-700">
            Completadas
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
                      <CardTitle className="text-base leading-tight">
                        {cap.titulo}
                      </CardTitle>
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: RESULTADO_COLORS[resultado] + "20",
                          color: RESULTADO_COLORS[resultado],
                        }}
                      >
                        {RESULTADO_LABELS[resultado]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-3.5" />
                      <span>
                        {new Date(cap.fecha + "T12:00:00").toLocaleDateString("es-AR")}
                      </span>
                    </div>
                    {nota !== null && nota !== undefined && (
                      <div className="flex items-center gap-2">
                        {isAprobado ? (
                          <CheckCircle className="size-4 text-green-500" />
                        ) : (
                          <XCircle className="size-4 text-red-500" />
                        )}
                        <span
                          className="text-lg font-bold"
                          style={{ color: isAprobado ? "#10B981" : "#EF4444" }}
                        >
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

      {capacitaciones.length === 0 && !reunionState.marcado && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-slate-400">
          <GraduationCap className="mb-3 size-10" />
          <p className="font-medium">No tenés capacitaciones asignadas</p>
        </div>
      )}
    </div>
  )
}
