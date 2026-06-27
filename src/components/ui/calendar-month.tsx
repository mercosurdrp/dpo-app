"use client"

import * as React from "react"
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"

export interface CalendarEvento {
  id: string
  /** "YYYY-MM-DD" */
  fecha: string
  titulo: string
  /** Punto de color (clase de fondo Tailwind, p. ej. "bg-blue-500"). */
  dot?: string
  /** Chip con relleno suave (clases Tailwind de texto+fondo). */
  chip?: string
}

interface CalendarMonthProps {
  /** Cualquier día dentro del mes a mostrar. */
  mes: Date
  eventos: CalendarEvento[]
  onSelectDay?: (fechaISO: string) => void
  onSelectEvento?: (id: string) => void
  /** Máximo de chips visibles por día antes del "+N". */
  maxPorDia?: number
  className?: string
}

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

function fechaISO(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

/**
 * Grilla de calendario mensual reutilizable (semana de lunes a domingo).
 * No conoce el dominio: recibe eventos genéricos y dispara callbacks.
 */
export function CalendarMonth({
  mes,
  eventos,
  onSelectDay,
  onSelectEvento,
  maxPorDia = 3,
  className,
}: CalendarMonthProps) {
  const dias = React.useMemo(() => {
    const inicio = startOfWeek(startOfMonth(mes), { weekStartsOn: 1 })
    const fin = endOfWeek(endOfMonth(mes), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: inicio, end: fin })
  }, [mes])

  const porFecha = React.useMemo(() => {
    const m = new Map<string, CalendarEvento[]>()
    for (const ev of eventos) {
      const arr = m.get(ev.fecha)
      if (arr) arr.push(ev)
      else m.set(ev.fecha, [ev])
    }
    return m
  }, [eventos])

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div className="min-w-[640px]">
        {/* Encabezado de días */}
        <div className="grid grid-cols-7 border-b border-border">
          {DIAS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Celdas */}
        <div className="grid grid-cols-7">
          {dias.map((dia) => {
            const iso = fechaISO(dia)
            const delMes = isSameMonth(dia, mes)
            const hoy = isToday(dia)
            const evs = porFecha.get(iso) ?? []
            const visibles = evs.slice(0, maxPorDia)
            const resto = evs.length - visibles.length

            return (
              <div
                key={iso}
                className={cn(
                  "group/cell flex min-h-[104px] flex-col gap-1 border-b border-r border-border p-1.5",
                  !delMes && "bg-muted/40",
                )}
              >
                {/* Cabecera de la celda: número + botón agregar */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onSelectDay?.(iso)}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs font-medium transition-colors",
                      hoy
                        ? "bg-primary text-primary-foreground"
                        : delMes
                          ? "text-foreground hover:bg-muted"
                          : "text-muted-foreground hover:bg-muted",
                    )}
                    aria-label={`Agregar evento el ${format(dia, "d 'de' LLLL", { locale: es })}`}
                    title="Agregar evento"
                  >
                    {format(dia, "d")}
                  </button>
                </div>

                {/* Eventos del día */}
                <div className="flex flex-col gap-0.5">
                  {visibles.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onSelectEvento?.(ev.id)}
                      title={ev.titulo}
                      className={cn(
                        "flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] font-medium transition-colors",
                        ev.chip ?? "bg-muted text-foreground hover:bg-muted/70",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          ev.dot ?? "bg-slate-400",
                        )}
                      />
                      <span className="truncate">{ev.titulo}</span>
                    </button>
                  ))}
                  {resto > 0 && (
                    <button
                      type="button"
                      onClick={() => onSelectDay?.(iso)}
                      className="px-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      +{resto} más
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
