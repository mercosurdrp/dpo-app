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
    // Los que vuelven hoy no entran: la ruleta no debe mostrarlos girando.
    const disponibles = estado.plantel.filter((o) => o.activo && !o.vuelve_hoy)
    if (disponibles.length === 0) {
      toast.error("No hay operadores disponibles para el sorteo de hoy.")
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
        activo
          ? `${nombre} queda fuera del sorteo`
          : `${nombre} vuelve: hoy mira la reunión y entra al sorteo desde mañana`,
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
  const disponibles = plantel.filter((o) => o.activo && !o.vuelve_hoy).length
  const vuelvenHoy = plantel.filter((o) => o.activo && o.vuelve_hoy)
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

          {vuelvenHoy.length > 0 && (
            <p className="max-w-sm text-center text-xs text-amber-700">
              {vuelvenHoy.map((o) => o.nombre).join(" y ")}{" "}
              {vuelvenHoy.length > 1 ? "vuelven" : "vuelve"} hoy de una ausencia:
              {vuelvenHoy.length > 1 ? " miran" : " mira"} la reunión y{" "}
              {vuelvenHoy.length > 1 ? "entran" : "entra"} al sorteo desde mañana.
            </p>
          )}

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
              // Lo que cuenta para el sorteo no son sólo las que dio: al que
              // vuelve de una ausencia se le acreditan algunas para que entre
              // parejo. Si no se explica, parece que el sorteo lo saltea.
              const detalle = [
                op.credito > 0
                  ? `Cuenta ${op.veces + op.credito}: dio ${op.veces} y tiene ${op.credito} acreditada${op.credito > 1 ? "s" : ""} de cuando volvió de una ausencia.`
                  : `Dio ${op.veces} reunion${op.veces === 1 ? "" : "es"}.`,
                op.activo && !op.vuelve_hoy
                  ? op.en_juego
                    ? "Entra en el próximo sorteo."
                    : "No entra en el próximo sorteo: hay otros con menos."
                  : null,
              ]
                .filter(Boolean)
                .join(" ")
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
                  {op.vuelve_hoy && op.activo && (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      vuelve hoy
                    </span>
                  )}
                  <span
                    className={cn(
                      "ml-auto shrink-0 text-[11px] tabular-nums",
                      op.en_juego
                        ? "font-semibold text-emerald-700"
                        : "text-muted-foreground",
                    )}
                  >
                    {op.veces}×
                    {op.credito > 0 && (
                      <span className="ml-0.5 font-medium text-amber-700">
                        +{op.credito}
                      </span>
                    )}
                  </span>
                </>
              )

              const clases = cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left",
                op.activo ? "bg-white" : "bg-slate-50",
                op.en_juego && "border-emerald-200 bg-emerald-50/50",
                op.vuelve_hoy && op.activo && "border-amber-200 bg-amber-50/60",
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
                    !op.activo
                      ? `${op.nota ?? "Ausente"} — traer de vuelta`
                      : op.vuelve_hoy
                        ? `${detalle} Volvió hoy: mira la reunión y entra al sorteo desde mañana. Clic para marcarlo ausente.`
                        : `${detalle} Clic para marcarlo ausente.`
                  }
                  className={cn(clases, "disabled:opacity-60")}
                >
                  {contenido}
                </button>
              ) : (
                <div
                  key={op.id}
                  className={clases}
                  title={op.activo ? detalle : (op.nota ?? "Ausente")}
                >
                  {contenido}
                </div>
              )
            })}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            El número es cuántas reuniones dio de verdad. Sortea entre los que
            menos tienen: esos van{" "}
            <span className="font-medium text-emerald-700">en verde</span>.
            {plantel.some((o) => o.credito > 0) && (
              <>
                {" "}
                El <span className="font-medium text-amber-700">+1</span> es un
                crédito que se acredita al volver de una ausencia para entrar
                parejo con el resto: no las dio, pero para el sorteo cuentan
                igual.
              </>
            )}
          </p>
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
