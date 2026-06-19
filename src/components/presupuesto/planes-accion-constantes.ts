import type {
  EstadoPasoPlanAccion,
  EstadoPlanAccion,
} from "@/types/database"

export const ESTADO_PLAN_OPCIONES: {
  value: EstadoPlanAccion
  label: string
}[] = [
  { value: "abierto", label: "Abierto" },
  { value: "en_progreso", label: "En progreso" },
  { value: "cerrado", label: "Cerrado" },
  { value: "cancelado", label: "Cancelado" },
]

export const ESTADO_PLAN_LABEL: Record<EstadoPlanAccion, string> =
  Object.fromEntries(
    ESTADO_PLAN_OPCIONES.map((o) => [o.value, o.label]),
  ) as Record<EstadoPlanAccion, string>

export const ESTADO_PLAN_BADGE_CLASS: Record<EstadoPlanAccion, string> = {
  abierto: "border-slate-200 bg-slate-100 text-slate-700",
  en_progreso: "border-blue-200 bg-blue-100 text-blue-700",
  cerrado: "border-emerald-200 bg-emerald-100 text-emerald-700",
  cancelado: "border-red-200 bg-red-100 text-red-700",
}

export const ESTADO_PASO_OPCIONES: {
  value: EstadoPasoPlanAccion
  label: string
}[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_progreso", label: "En progreso" },
  { value: "completado", label: "Completado" },
]

export const ESTADO_PASO_LABEL: Record<EstadoPasoPlanAccion, string> =
  Object.fromEntries(
    ESTADO_PASO_OPCIONES.map((o) => [o.value, o.label]),
  ) as Record<EstadoPasoPlanAccion, string>

export const ESTADO_PASO_BADGE_CLASS: Record<EstadoPasoPlanAccion, string> = {
  pendiente: "border-slate-200 bg-slate-100 text-slate-700",
  en_progreso: "border-amber-200 bg-amber-100 text-amber-800",
  completado: "border-emerald-200 bg-emerald-100 text-emerald-700",
}

export const MESES_CORTOS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
]
