"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Dices, Loader2, Megaphone, UserRound, UserRoundX } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  getEstadoExpositor,
  setDisponibilidadOperador,
  sortearExpositorHoy,
  type EstadoExpositor,
} from "@/actions/warehouse-expositor"

function formatFechaCorta(iso: string): string {
  const [, m, d] = iso.split("-")
  if (!m || !d) return iso
  return `${d}/${m}`
}

function formatDia(iso: string): string {
  const dt = new Date(iso + "T12:00:00")
  return dt.toLocaleDateString("es-AR", { weekday: "short" })
}

export function ExpositorDelDiaCard() {
  const [estado, setEstado] = useState<EstadoExpositor | null>(null)
  const [loading, setLoading] = useState(true)
  const [ruleta, setRuleta] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const cargar = useCallback(async () => {
    const res = await getEstadoExpositor()
    if ("error" in res) {
      toast.error(res.error)
      setLoading(false)
      return
    }
    setEstado(res.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
    const pendientes = timers.current
    return () => {
      pendientes.forEach(clearTimeout)
    }
  }, [cargar])

  function handleSortear() {
    if (!estado) return
    const disponibles = estado.plantel.filter((o) => o.activo)
    if (disponibles.length === 0) {
      toast.error("No hay operadores disponibles: están todos ausentes.")
      return
    }

    // Ruleta corta mientras el servidor decide. El ganador lo define la
    // action, esto es sólo el suspenso.
    let i = 0
    const girar = () => {
      setRuleta(disponibles[i % disponibles.length]!.nombre)
      i++
      if (i < 12) timers.current.push(setTimeout(girar, 60 + i * 10))
    }
    girar()

    startTransition(async () => {
      const res = await sortearExpositorHoy()
      timers.current.forEach(clearTimeout)
      timers.current = []
      setRuleta(null)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`${res.data.nombre} da la reunión de hoy`)
      await cargar()
    })
  }

  function handleToggle(id: string, activo: boolean, nombre: string) {
    startTransition(async () => {
      const res = await setDisponibilidadOperador(id, !activo, "Ausente")
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        activo ? `${nombre} queda fuera del sorteo` : `${nombre} vuelve al sorteo`,
      )
      await cargar()
    })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Cargando el plantel…
        </CardContent>
      </Card>
    )
  }

  if (!estado) return null

  const { turnoHoy, plantel, historial, puedeSortear } = estado
  const disponibles = plantel.filter((o) => o.activo).length
  const nombreGrande = ruleta ?? turnoHoy?.nombre ?? null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="size-4 text-muted-foreground" />
          Quién da la reunión hoy
        </CardTitle>
        <Badge
          variant="outline"
          className="border-slate-200 text-[11px] font-normal text-slate-600"
        >
          {disponibles} de {plantel.length} disponibles
        </Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Sorteo */}
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-slate-50 py-6">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {ruleta ? "Sorteando…" : turnoHoy ? "Expone hoy" : "Sin sortear"}
          </span>
          <span
            className={cn(
              "text-3xl font-bold uppercase tracking-tight sm:text-4xl",
              ruleta ? "text-slate-400" : "text-slate-900",
              !nombreGrande && "text-slate-300",
            )}
          >
            {nombreGrande ?? "—"}
          </span>

          {puedeSortear ? (
            <Button
              type="button"
              onClick={handleSortear}
              disabled={pending}
              variant={turnoHoy ? "outline" : "default"}
              className="mt-1"
            >
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Dices className="mr-2 size-4" />
              )}
              {turnoHoy ? "Volver a sortear" : "Sortear el de hoy"}
            </Button>
          ) : (
            !turnoHoy && (
              <p className="text-xs text-muted-foreground">
                Todavía no se sorteó. Lo hace un supervisor o el administrador.
              </p>
            )
          )}
        </div>

        {/* Plantel */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Plantel
            </h4>
            {puedeSortear && (
              <span className="text-xs text-muted-foreground">
                Tocá un nombre para marcarlo ausente o traerlo de vuelta
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {plantel.map((op) => {
              const esTurno = turnoHoy?.nombre === op.nombre
              const contenido = (
                <>
                  {op.activo ? (
                    <UserRound className="size-3.5 shrink-0 text-slate-400" />
                  ) : (
                    <UserRoundX className="size-3.5 shrink-0 text-slate-400" />
                  )}
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      !op.activo && "text-slate-400 line-through",
                    )}
                  >
                    {op.nombre}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {op.veces}×
                  </span>
                </>
              )

              const clases = cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left",
                op.activo ? "bg-white" : "bg-slate-50",
                esTurno && "border-blue-300 bg-blue-50",
                puedeSortear && "hover:border-slate-300",
              )

              return puedeSortear ? (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => handleToggle(op.id, op.activo, op.nombre)}
                  disabled={pending}
                  title={
                    op.activo
                      ? `Marcar ausente a ${op.nombre}`
                      : `${op.nota ?? "Ausente"} — traer de vuelta`
                  }
                  className={cn(clases, "disabled:opacity-60")}
                >
                  {contenido}
                </button>
              ) : (
                <div key={op.id} className={clases} title={op.nota ?? undefined}>
                  {contenido}
                </div>
              )
            })}
          </div>
        </div>

        {/* Historial */}
        {historial.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Últimos turnos
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {historial.map((t) => (
                <Badge
                  key={t.fecha}
                  variant="outline"
                  className="border-slate-200 text-[11px] font-normal text-slate-600"
                >
                  <span className="capitalize">{formatDia(t.fecha)}</span>
                  <span className="mx-1 tabular-nums text-slate-400">
                    {formatFechaCorta(t.fecha)}
                  </span>
                  <span className="font-medium text-slate-700">{t.nombre}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
