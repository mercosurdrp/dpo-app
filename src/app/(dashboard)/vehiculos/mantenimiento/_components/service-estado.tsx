"use client"

// Semáforo del service general, compartido.
//
// Estas constantes vivían dentro del Tablero operativo, que era el único que las
// usaba. Con "Service pendientes" mudado a Programación OT hay dos pantallas
// pintando el mismo estado, así que el semáforo pasa a ser una pieza sola: si
// mañana cambia un umbral, cambia en los dos lados a la vez.

import { cn } from "@/lib/utils"
import type { EstadoServiceGeneral } from "@/lib/vehiculos/service-general"

export const ESTADO_SG: Record<
  EstadoServiceGeneral,
  { label: string; dot: string; badge: string }
> = {
  vencido: {
    label: "Vencido",
    dot: "bg-destructive",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  rojo: {
    label: "≤10 días",
    dot: "bg-destructive/70",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  naranja: {
    label: "≤15 días",
    dot: "bg-orange-500",
    badge: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  },
  amarillo: {
    label: "≤30 días",
    dot: "bg-amber-500",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  ok: {
    label: "Al día",
    dot: "bg-emerald-500",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  sin_datos: {
    label: "Sin datos",
    dot: "bg-muted-foreground/40",
    badge: "border-border bg-muted text-muted-foreground",
  },
  no_aplica: {
    label: "No lleva service",
    dot: "bg-border",
    badge: "border-border bg-muted/50 text-muted-foreground/70",
  },
}

export const ORDEN_ESTADO: Record<EstadoServiceGeneral, number> = {
  vencido: 0,
  rojo: 1,
  naranja: 2,
  amarillo: 3,
  ok: 4,
  sin_datos: 5,
  no_aplica: 6,
}

/** Los cuatro estados que piden acción: son los que van a "Service pendientes". */
export const esAlertaService = (e: EstadoServiceGeneral) =>
  e === "vencido" || e === "rojo" || e === "naranja" || e === "amarillo"

export const fmtNum = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("es-AR").format(v)

export const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

export function diasTexto(dias: number | null): string {
  if (dias == null) return "—"
  if (dias < 0) return `hace ${Math.abs(dias)} d`
  if (dias === 0) return "hoy"
  return `en ${dias} d`
}

export function Dot({ estado }: { estado: EstadoServiceGeneral }) {
  return <span className={cn("inline-block size-2.5 rounded-full", ESTADO_SG[estado].dot)} />
}
