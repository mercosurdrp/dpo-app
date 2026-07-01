"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Settings, Save, Users, ArrowLeft, Power } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateConfigTrivia } from "@/actions/trivia"
import type { JuegoConfig } from "@/lib/types/trivia"

export function ConfigClient({
  config,
  capacitaciones,
  participacionHoy,
}: {
  config: JuegoConfig
  capacitaciones: { id: string; titulo: string }[]
  participacionHoy: { jugaron: number; empleadosActivos: number }
}) {
  const [tiempo, setTiempo] = useState(config.tiempo_limite_seg)
  const [puntos, setPuntos] = useState(config.puntos_acierto)
  const [bonus, setBonus] = useState(config.bonus_velocidad_max)
  const [porDia, setPorDia] = useState(config.preguntas_por_dia)
  const [diasSinRepetir, setDiasSinRepetir] = useState(config.dias_sin_repetir)
  const [activo, setActivo] = useState(config.activo)
  const [excluidas, setExcluidas] = useState<Set<string>>(
    new Set(config.capacitaciones_excluidas)
  )
  const [pending, startTransition] = useTransition()

  function toggleExcluida(id: string) {
    setExcluidas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function guardar() {
    startTransition(async () => {
      const res = await updateConfigTrivia({
        tiempo_limite_seg: tiempo,
        puntos_acierto: puntos,
        bonus_velocidad_max: bonus,
        preguntas_por_dia: porDia,
        dias_sin_repetir: diasSinRepetir,
        capacitaciones_excluidas: [...excluidas],
        activo,
      })
      if ("error" in res) toast.error(res.error)
      else toast.success("Configuración guardada")
    })
  }

  const pct =
    participacionHoy.empleadosActivos > 0
      ? Math.round((participacionHoy.jugaron / participacionHoy.empleadosActivos) * 100)
      : 0

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Settings className="size-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">Trivia · Configuración</h1>
          <Link href="/trivia/ranking" className="text-xs text-slate-500 hover:text-slate-700">
            <ArrowLeft className="mr-1 inline size-3" />
            Volver al ranking
          </Link>
        </div>
      </div>

      {/* Participación de hoy */}
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <div className="flex size-11 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Users className="size-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-500">Jugaron hoy</p>
            <p className="text-lg font-bold text-slate-900">
              {participacionHoy.jugaron} de {participacionHoy.empleadosActivos} empleados{" "}
              <span className="text-sm font-normal text-slate-400">({pct}%)</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Estado del juego */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Estado</CardTitle>
        </CardHeader>
        <CardContent>
          <button
            onClick={() => setActivo((a) => !a)}
            className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
              activo ? "border-green-300 bg-green-50" : "border-slate-200 bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Power className={activo ? "size-4 text-green-600" : "size-4 text-slate-400"} />
              {activo ? "Juego activo" : "Juego pausado"}
            </span>
            <span
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                activo ? "bg-green-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block size-5 transform rounded-full bg-white transition-transform ${
                  activo ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </span>
          </button>
        </CardContent>
      </Card>

      {/* Parámetros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reglas del juego</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Campo label="Tiempo por pregunta (seg)">
            <Input type="number" min={5} max={120} value={tiempo} onChange={(e) => setTiempo(+e.target.value)} />
          </Campo>
          <Campo label="Preguntas por día">
            <Input type="number" min={1} max={20} value={porDia} onChange={(e) => setPorDia(+e.target.value)} />
          </Campo>
          <Campo label="Puntos por acierto">
            <Input type="number" min={0} value={puntos} onChange={(e) => setPuntos(+e.target.value)} />
          </Campo>
          <Campo label="Bonus máx. por velocidad">
            <Input type="number" min={0} value={bonus} onChange={(e) => setBonus(+e.target.value)} />
          </Campo>
          <Campo label="No repetir preguntas (días)">
            <Input
              type="number"
              min={0}
              value={diasSinRepetir}
              onChange={(e) => setDiasSinRepetir(+e.target.value)}
            />
          </Campo>
        </CardContent>
      </Card>

      {/* Capacitaciones excluidas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Capacitaciones excluidas del sorteo</CardTitle>
          <p className="text-xs text-slate-500">
            Tildá las que NO querés que aporten preguntas al desafío diario.
          </p>
        </CardHeader>
        <CardContent className="max-h-72 space-y-1 overflow-y-auto">
          {capacitaciones.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No hay capacitaciones.</p>
          ) : (
            capacitaciones.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-blue-600"
                  checked={excluidas.has(c.id)}
                  onChange={() => toggleExcluida(c.id)}
                />
                <span className={excluidas.has(c.id) ? "text-slate-400 line-through" : "text-slate-700"}>
                  {c.titulo}
                </span>
              </label>
            ))
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-4">
        <Button
          onClick={guardar}
          disabled={pending}
          size="lg"
          className="w-full bg-blue-600 shadow-lg hover:bg-blue-700"
        >
          <Save className="mr-2 size-4" />
          {pending ? "Guardando..." : "Guardar configuración"}
        </Button>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-500">{label}</Label>
      {children}
    </div>
  )
}
