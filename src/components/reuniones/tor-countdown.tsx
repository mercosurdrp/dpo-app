"use client"

import { useEffect, useMemo, useState } from "react"
import { Pause, Play, RotateCcw, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const DURACION_DEFAULT_MIN = 30

type TorPersist = {
  /** Epoch ms en que vence el contador (corriendo). */
  endAt: number | null
  /** Segundos restantes si está pausado. */
  pausedRemaining: number | null
}

function leerPersist(key: string): TorPersist | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TorPersist
    if (typeof parsed !== "object" || parsed === null) return null
    return parsed
  } catch {
    return null
  }
}

function guardarPersist(key: string, value: TorPersist | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage no disponible: el contador funciona igual en memoria.
  }
}

function formatMMSS(totalSeg: number): string {
  const s = Math.max(0, Math.ceil(totalSeg))
  const mm = String(Math.floor(s / 60)).padStart(2, "0")
  const ss = String(s % 60).padStart(2, "0")
  return `${mm}:${ss}`
}

/**
 * Contador regresivo para cumplir la TOR de la reunión.
 * El color del tiempo y la barra interpolan verde → amarillo → naranja → rojo
 * a medida que el restante se acerca a cero. Persiste en localStorage por
 * reunión, así un refresh de la página no pierde el conteo.
 */
export function TorCountdown({
  reunionId,
  minutos = DURACION_DEFAULT_MIN,
}: {
  reunionId: string
  minutos?: number
}) {
  const totalSeg = minutos * 60
  const storageKey = `tor-countdown-${reunionId}`

  const [endAt, setEndAt] = useState<number | null>(null)
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null)
  const [ahora, setAhora] = useState<number | null>(null) // null hasta montar (hidratación)

  // Restaurar estado guardado al montar.
  useEffect(() => {
    const saved = leerPersist(storageKey)
    if (saved) {
      setEndAt(saved.endAt)
      setPausedRemaining(saved.pausedRemaining)
    }
    setAhora(Date.now())
  }, [storageKey])

  const corriendo = endAt !== null && ahora !== null && endAt > ahora

  // Tick mientras corre (también dispara el pase a "terminado").
  useEffect(() => {
    if (endAt === null) return
    const id = setInterval(() => setAhora(Date.now()), 250)
    return () => clearInterval(id)
  }, [endAt])

  const restante = useMemo(() => {
    if (endAt !== null && ahora !== null)
      return Math.max(0, (endAt - ahora) / 1000)
    if (pausedRemaining !== null) return pausedRemaining
    return totalSeg
  }, [endAt, ahora, pausedRemaining, totalSeg])

  const terminado = endAt !== null && restante <= 0
  const enCurso = corriendo && !terminado
  const fraccion = Math.min(1, Math.max(0, restante / totalSeg))
  // Escala continua tipo semáforo: hue 120 (verde) → 0 (rojo).
  const color = `hsl(${Math.round(120 * fraccion)} 85% 38%)`

  function iniciar() {
    const desde = pausedRemaining ?? totalSeg
    const nuevoEnd = Date.now() + desde * 1000
    setEndAt(nuevoEnd)
    setPausedRemaining(null)
    setAhora(Date.now())
    guardarPersist(storageKey, { endAt: nuevoEnd, pausedRemaining: null })
  }

  function pausar() {
    if (endAt === null) return
    const rem = Math.max(0, (endAt - Date.now()) / 1000)
    setEndAt(null)
    setPausedRemaining(rem)
    guardarPersist(storageKey, { endAt: null, pausedRemaining: rem })
  }

  function reiniciar() {
    setEndAt(null)
    setPausedRemaining(null)
    guardarPersist(storageKey, null)
  }

  const intacto = endAt === null && pausedRemaining === null

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-white px-3 py-1.5 shadow-sm">
      <Timer className="size-4 text-slate-500" />
      <div className="leading-none">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          TOR · {minutos} min
        </p>
        <p
          className={cn(
            "font-mono text-xl font-bold tabular-nums",
            terminado && "animate-pulse",
          )}
          style={{ color }}
        >
          {formatMMSS(restante)}
        </p>
        <div className="mt-0.5 h-1 w-24 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${fraccion * 100}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <div className="flex items-center gap-1">
        {enCurso ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7"
            onClick={pausar}
            title="Pausar"
          >
            <Pause className="size-3.5" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7"
            onClick={iniciar}
            disabled={terminado}
            title={intacto ? "Iniciar" : "Reanudar"}
          >
            <Play className="size-3.5" />
          </Button>
        )}
        {!intacto && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7"
            onClick={reiniciar}
            title="Reiniciar a los 30 minutos"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
