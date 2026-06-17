import type {
  EstadoIniciativaAhorro,
  TipoIniciativaAhorro,
} from "@/types/database"

export const TIPO_OPCIONES: { value: TipoIniciativaAhorro; label: string }[] = [
  { value: "hhee", label: "Horas extras (HHEE)" },
  { value: "ausentismo", label: "Ausentismo" },
  { value: "mermas_wh_del", label: "Mermas WH / Delivery" },
  { value: "ocupacion_capacidad", label: "Ocupación de capacidad" },
  { value: "productividad_wh_del", label: "Productividad WH / Delivery" },
  { value: "renovacion_flota", label: "Renovación de flota" },
  { value: "cambio_glp", label: "Cambio a GLP" },
  { value: "consumo_combustible", label: "Consumo de combustible" },
  { value: "otro", label: "Otro" },
]

export const TIPO_LABEL: Record<TipoIniciativaAhorro, string> = Object.fromEntries(
  TIPO_OPCIONES.map((o) => [o.value, o.label]),
) as Record<TipoIniciativaAhorro, string>

export const ESTADO_OPCIONES: {
  value: EstadoIniciativaAhorro
  label: string
}[] = [
  { value: "planificada", label: "Planificada" },
  { value: "en_implementacion", label: "En implementación" },
  { value: "implementada", label: "Implementada" },
  { value: "cancelada", label: "Cancelada" },
]

export const ESTADO_LABEL: Record<EstadoIniciativaAhorro, string> =
  Object.fromEntries(
    ESTADO_OPCIONES.map((o) => [o.value, o.label]),
  ) as Record<EstadoIniciativaAhorro, string>

export const ESTADO_BADGE_CLASS: Record<EstadoIniciativaAhorro, string> = {
  planificada: "border-slate-200 bg-slate-100 text-slate-700",
  en_implementacion: "border-blue-200 bg-blue-100 text-blue-700",
  implementada: "border-emerald-200 bg-emerald-100 text-emerald-700",
  cancelada: "border-red-200 bg-red-100 text-red-700",
}

export const TRIMESTRES = [1, 2, 3, 4] as const
