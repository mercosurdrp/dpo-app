"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Timer, Play, Square, Lock, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  getContador,
  iniciarContador,
  finalizarContador,
  type ContadorReunionData,
} from "@/actions/reuniones-contador"

/**
 * Contador (cuenta regresiva) que acota la duración de la reunión y la cierra.
 *
 * El estado vive en el servidor (tabla reuniones_contador), 1 fila por reunión:
 * el inicio y la finalización son COMPARTIDOS entre todos los participantes y
 * se sincronizan por polling. Flujo: un editor "Inicia" → corre el contador →
 * un editor "Finaliza" → la reunión queda terminada con el tiempo final del
 * contador y NADIE puede volver a iniciarlo. Al llegar a 00:00 NO se cierra
 * sola: se queda en 00:00 hasta que alguien finalice.
 *
 * El restante se recalcula contra el reloj (fin_previsto_at absoluto), así es
 * robusto al throttling de pestañas en segundo plano.
 */

const POLL_MS = 8000

function calcRestante(estado: ContadorReunionData): number {
  if (estado.estado === "finalizada") return estado.restante_final_seg ?? 0
  if (estado.estado === "en_curso" && estado.fin_previsto_at) {
    return Math.max(
      0,
      Math.round((new Date(estado.fin_previsto_at).getTime() - Date.now()) / 1000),
    )
  }
  return Math.max(1, Math.round(estado.minutos * 60))
}

export function ContadorReunion({
  reunionId,
  minutos = 30,
  titulo = "Tiempo de la reunión",
  puedeEditar = false,
}: {
  reunionId: string
  minutos?: number
  titulo?: string
  /** Solo los editores (supervisor/admin) ven los botones Iniciar/Finalizar. */
  puedeEditar?: boolean
}) {
  const [estado, setEstado] = useState<ContadorReunionData | null>(null)
  const [restante, setRestante] = useState(Math.max(1, Math.round(minutos * 60)))
  const [cargando, setCargando] = useState(true)
  const [accionando, setAccionando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const beepDadoRef = useRef(false)

  const refrescar = useCallback(async () => {
    const res = await getContador(reunionId, minutos)
    if ("data" in res) {
      setEstado(res.data)
      setRestante(calcRestante(res.data))
    }
    setCargando(false)
  }, [reunionId, minutos])

  // Carga inicial + polling para sincronizar entre participantes.
  useEffect(() => {
    let activo = true
    void refrescar()
    const id = setInterval(() => {
      if (activo) void refrescar()
    }, POLL_MS)
    return () => {
      activo = false
      clearInterval(id)
    }
  }, [refrescar])

  const beep = useCallback(() => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = "sine"
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9)
      osc.start()
      osc.stop(ctx.currentTime + 0.95)
      osc.onended = () => ctx.close()
    } catch {
      // ignorar: el navegador puede bloquear el audio
    }
  }, [])

  // Tick local 1s: recalcula el restante mientras corre (entre polls).
  useEffect(() => {
    if (!estado || estado.estado !== "en_curso") return
    const id = setInterval(() => {
      const rest = calcRestante(estado)
      setRestante(rest)
      if (rest <= 0 && !beepDadoRef.current) {
        beepDadoRef.current = true
        beep()
      }
    }, 1000)
    return () => clearInterval(id)
  }, [estado, beep])

  async function onIniciar() {
    setError(null)
    setAccionando(true)
    const res = await iniciarContador(reunionId, minutos)
    if ("error" in res) setError(res.error)
    else {
      beepDadoRef.current = false
      setEstado(res.data)
      setRestante(calcRestante(res.data))
    }
    setAccionando(false)
  }

  async function onFinalizar() {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "¿Finalizar la reunión? El contador se cierra con el tiempo actual y nadie podrá volver a iniciarlo.",
      )
      if (!ok) return
    }
    setError(null)
    setAccionando(true)
    const res = await finalizarContador(reunionId)
    if ("error" in res) setError(res.error)
    else {
      setEstado(res.data)
      setRestante(calcRestante(res.data))
    }
    setAccionando(false)
  }

  const est = estado?.estado ?? "inactivo"
  const enCurso = est === "en_curso"
  const finalizada = est === "finalizada"
  const tiempoCumplido = enCurso && restante <= 0

  const mm = String(Math.floor(restante / 60)).padStart(2, "0")
  const ss = String(restante % 60).padStart(2, "0")

  const color = finalizada
    ? "text-slate-500"
    : tiempoCumplido || restante <= 60
      ? "text-red-600"
      : restante <= 5 * 60
        ? "text-amber-600"
        : "text-slate-900"

  return (
    <Card
      className={cn(
        "border-slate-200",
        finalizada && "border-slate-300 bg-slate-50",
        tiempoCumplido && "border-red-300 bg-red-50/40",
      )}
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-3">
          {finalizada ? (
            <Lock className="size-6 text-slate-500" />
          ) : (
            <Timer
              className={cn(
                "size-6",
                tiempoCumplido ? "text-red-600" : "text-slate-500",
                enCurso && "animate-pulse",
              )}
            />
          )}
          <div className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {titulo}
            </span>
            <span
              className={cn(
                "font-mono text-3xl font-bold tabular-nums leading-tight",
                color,
              )}
            >
              {mm}:{ss}
            </span>
          </div>

          {finalizada && (
            <span className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
              Reunión finalizada
            </span>
          )}
          {tiempoCumplido && (
            <span className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
              ¡Tiempo cumplido!
            </span>
          )}
          {enCurso && !tiempoCumplido && (
            <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
              En curso
            </span>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {cargando ? (
              <Loader2 className="size-5 animate-spin text-slate-400" />
            ) : finalizada ? (
              <span className="text-xs text-muted-foreground">
                Cerrada · tiempo final {mm}:{ss}
              </span>
            ) : (
              puedeEditar && (
                <>
                  {!enCurso && (
                    <Button
                      size="sm"
                      onClick={onIniciar}
                      disabled={accionando}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {accionando ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <Play className="mr-1.5 size-4" />
                      )}
                      Iniciar
                    </Button>
                  )}
                  {enCurso && (
                    <Button
                      size="sm"
                      onClick={onFinalizar}
                      disabled={accionando}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {accionando ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <Square className="mr-1.5 size-4" />
                      )}
                      Finalizar reunión
                    </Button>
                  )}
                </>
              )
            )}
          </div>
          {!puedeEditar && !finalizada && !cargando && (
            <span className="text-[11px] text-muted-foreground">
              Solo un supervisor puede {enCurso ? "finalizar" : "iniciar"}
            </span>
          )}
          {error && <span className="text-[11px] text-red-600">{error}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
