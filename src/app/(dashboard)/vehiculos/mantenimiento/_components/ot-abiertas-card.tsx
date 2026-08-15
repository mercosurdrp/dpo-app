"use client"

// Órdenes de trabajo abiertas.
//
// Vivía en el Tablero operativo, al lado de "Service pendientes". Su lugar es
// Programación OT, debajo del calendario del mes: quien programa la semana
// necesita ver ahí mismo lo que todavía está abierto, sin cambiar de solapa.
//
// Va con la misma cabecera oscura del calendario que tiene encima —son dos
// piezas de la misma pantalla, no dos tarjetas sueltas— y las órdenes dejaron
// de ser filas de tabla: cada una es una tira con el color de su estado a la
// izquierda, que es lo que se busca al barrer la lista ("¿cuál está en taller
// ahora?"). La espera pasa a leerse sola: a partir de una semana abierta el
// número se pone en ámbar, y a partir de dos, en rojo.

import { ClipboardList, Wrench } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface OTPendiente {
  id: string
  dominio: string
  fecha: string
  estado: "programado" | "en_taller"
  motivo: string
}

export const OT_BADGE: Record<OTPendiente["estado"], { label: string; cls: string }> = {
  programado: {
    label: "Programada",
    cls: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  en_taller: {
    label: "En taller",
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
}

/** Franja de color de la tira, del mismo semáforo que el badge. */
const OT_ACENTO: Record<OTPendiente["estado"], string> = {
  programado: "bg-blue-500",
  en_taller: "bg-amber-500",
}

function diasAbierta(fecha: string): number {
  const hoy = new Date()
  const f = new Date(fecha + "T00:00:00")
  return Math.max(0, Math.round((hoy.getTime() - f.getTime()) / 86_400_000))
}

function antiguedad(dias: number): string {
  if (dias === 0) return "hoy"
  if (dias === 1) return "ayer"
  return `hace ${dias} d`
}

export function OtAbiertasCard({
  otPendientes,
  onVerHistorial,
}: {
  otPendientes: OTPendiente[]
  /** Abre el historial de OT; con dominio, ya filtrado por esa unidad. */
  onVerHistorial: (dominio?: string) => void
}) {
  const enTaller = otPendientes.filter((o) => o.estado === "en_taller").length
  const programadas = otPendientes.length - enTaller
  // La que más espera, arriba: es la que hay que destrabar.
  const ordenadas = [...otPendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))

  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-sm">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white dark:from-slate-950 dark:to-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
              <Wrench className="size-4" aria-hidden />
            </span>
            Órdenes de trabajo abiertas
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Contador color="bg-amber-400" n={enTaller} texto="en taller" />
            <Contador color="bg-sky-400" n={programadas} texto="programadas" />
            <button
              type="button"
              onClick={() => onVerHistorial()}
              className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
              title="Ver el historial completo de órdenes de trabajo"
            >
              Ver historial
            </button>
          </div>
        </div>
      </div>

      {ordenadas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <ClipboardList className="size-7 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <p className="text-sm text-muted-foreground">No hay órdenes de trabajo abiertas.</p>
        </div>
      ) : (
        <div className="divide-y divide-border/70">
          {ordenadas.map((ot) => {
            const dias = diasAbierta(ot.fecha)
            return (
              <button
                key={ot.id}
                type="button"
                onClick={() => onVerHistorial(ot.dominio)}
                title={`Ver las órdenes de ${ot.dominio}`}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
              >
                <span
                  className={cn("h-8 w-1 shrink-0 rounded-full", OT_ACENTO[ot.estado])}
                  aria-hidden
                />
                <span className="w-20 shrink-0 font-medium tabular-nums">{ot.dominio}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {ot.motivo}
                </span>
                <Badge
                  variant="outline"
                  className={cn("shrink-0 whitespace-nowrap", OT_BADGE[ot.estado].cls)}
                >
                  {OT_BADGE[ot.estado].label}
                </Badge>
                <span
                  className={cn(
                    "w-20 shrink-0 text-right text-xs tabular-nums",
                    dias >= 14
                      ? "font-semibold text-destructive"
                      : dias >= 7
                        ? "font-medium text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                  )}
                >
                  {antiguedad(dias)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function Contador({ color, n, texto }: { color: string; n: number; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-white/80">
      <span className={cn("size-2 rounded-full", color)} aria-hidden />
      <span className="font-bold tabular-nums leading-none text-white">{n}</span>
      {texto}
    </span>
  )
}
