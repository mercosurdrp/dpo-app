"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Timer, Play, Pause, RotateCcw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Contador (cuenta regresiva) para acotar la duración de la reunión.
 * Persiste en el navegador (localStorage) por reunión: si salís y volvés,
 * sigue corriendo. Guarda un instante de fin absoluto, así descuenta también
 * el tiempo que la reunión estuvo fuera de pantalla. No se sincroniza entre
 * participantes (cada navegador tiene su propio contador).
 * Arranca con "Iniciar", se puede Pausar y Reiniciar. Avisa al llegar a 0.
 */

const STORAGE_PREFIX = "contador-reunion:"

type EstadoPersistido = {
  corriendo: boolean
  /** Instante (epoch ms) en que llega a 0. Solo válido si corriendo=true. */
  finEn: number | null
  /** Segundos restantes cuando está pausado/detenido. */
  restante: number
}

export function ContadorReunion({
  minutos = 30,
  titulo = "Tiempo de la reunión",
  storageKey,
}: {
  minutos?: number
  titulo?: string
  /** Identificador para persistir el estado por reunión (p. ej. el id). */
  storageKey?: string
}) {
  const totalSeg = Math.max(1, Math.round(minutos * 60))
  const [restante, setRestante] = useState(totalSeg)
  const [corriendo, setCorriendo] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finEnRef = useRef<number | null>(null)

  const terminado = restante <= 0

  const persistir = useCallback(
    (estado: EstadoPersistido) => {
      if (!storageKey || typeof window === "undefined") return
      try {
        window.localStorage.setItem(
          STORAGE_PREFIX + storageKey,
          JSON.stringify(estado),
        )
      } catch {
        // ignorar: localStorage puede no estar disponible
      }
    },
    [storageKey],
  )

  // Rehidratar desde localStorage al montar (y al cambiar de reunión).
  // Se hace en efecto (no en el estado inicial) para no romper el SSR/hidratación.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey)
      if (!raw) return
      const p = JSON.parse(raw) as EstadoPersistido
      if (p.corriendo && typeof p.finEn === "number") {
        const rest = Math.max(0, Math.round((p.finEn - Date.now()) / 1000))
        if (rest > 0) {
          finEnRef.current = p.finEn
          setRestante(rest)
          setCorriendo(true)
        } else {
          // Se cumplió el tiempo mientras estaba fuera de pantalla.
          finEnRef.current = null
          setRestante(0)
          setCorriendo(false)
        }
      } else if (typeof p.restante === "number") {
        finEnRef.current = null
        setRestante(p.restante)
        setCorriendo(false)
      }
    } catch {
      // ignorar: estado corrupto, se arranca limpio
    }
  }, [storageKey])

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

  // Tick: recalcula el restante contra el reloj (robusto a throttling de
  // pestañas en segundo plano y a salir/entrar de la reunión).
  useEffect(() => {
    if (!corriendo) return
    intervalRef.current = setInterval(() => {
      const finEn = finEnRef.current
      if (finEn == null) return
      const rest = Math.max(0, Math.round((finEn - Date.now()) / 1000))
      setRestante(rest)
      if (rest <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        finEnRef.current = null
        setCorriendo(false)
        persistir({ corriendo: false, finEn: null, restante: 0 })
        beep()
      }
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [corriendo, beep, persistir])

  function iniciarPausar() {
    if (terminado) return
    if (corriendo) {
      // Pausar: fijamos el restante actual.
      finEnRef.current = null
      setCorriendo(false)
      persistir({ corriendo: false, finEn: null, restante })
    } else {
      // Iniciar/Reanudar: anclamos un instante de fin absoluto.
      const finEn = Date.now() + restante * 1000
      finEnRef.current = finEn
      setCorriendo(true)
      persistir({ corriendo: true, finEn, restante })
    }
  }
  function reiniciar() {
    finEnRef.current = null
    setCorriendo(false)
    setRestante(totalSeg)
    persistir({ corriendo: false, finEn: null, restante: totalSeg })
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
