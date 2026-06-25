"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Timer, Play, Pause, RotateCcw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Contador (cuenta regresiva) para acotar la duración de la reunión.
 * Local en el navegador: no persiste ni se sincroniza entre participantes.
 * Arranca con "Iniciar", se puede Pausar y Reiniciar. Avisa al llegar a 0.
 */
export function ContadorReunion({
  minutos = 30,
  titulo = "Tiempo de la reunión",
}: {
  minutos?: number
  titulo?: string
}) {
  const totalSeg = Math.max(1, Math.round(minutos * 60))
  const [restante, setRestante] = useState(totalSeg)
  const [corriendo, setCorriendo] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const terminado = restante <= 0

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

  useEffect(() => {
    if (!corriendo) return
    intervalRef.current = setInterval(() => {
      setRestante((s) => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          setCorriendo(false)
          beep()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [corriendo, beep])

  function iniciarPausar() {
    if (terminado) return
    setCorriendo((c) => !c)
  }
  function reiniciar() {
    setCorriendo(false)
    setRestante(totalSeg)
  }

  const mm = String(Math.floor(restante / 60)).padStart(2, "0")
  const ss = String(restante % 60).padStart(2, "0")

  // Color según urgencia.
  const color = terminado
    ? "text-red-600"
    : restante <= 60
      ? "text-red-600"
      : restante <= 5 * 60
        ? "text-amber-600"
        : "text-slate-900"

  return (
    <Card
      className={cn(
        "border-slate-200",
        terminado && "border-red-300 bg-red-50/40",
      )}
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-3">
          <Timer
            className={cn(
              "size-6",
              terminado ? "text-red-600" : "text-slate-500",
              corriendo && "animate-pulse",
            )}
          />
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
          {terminado && (
            <span className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
              ¡Tiempo cumplido!
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={iniciarPausar}
            disabled={terminado}
            className={cn(
              corriendo
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-emerald-600 hover:bg-emerald-700",
            )}
          >
            {corriendo ? (
              <>
                <Pause className="mr-1.5 size-4" />
                Pausar
              </>
            ) : (
              <>
                <Play className="mr-1.5 size-4" />
                Iniciar
              </>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={reiniciar}>
            <RotateCcw className="mr-1.5 size-4" />
            Reiniciar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
