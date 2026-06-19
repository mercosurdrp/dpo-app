import type {
  CategoriaInversion,
  EstadoInversion,
} from "@/types/database"

export const CATEGORIA_OPCIONES: {
  value: CategoriaInversion
  label: string
}[] = [
  { value: "flota", label: "Flota" },
  { value: "equipos_almacen", label: "Equipos de almacén" },
  { value: "tecnologia", label: "Tecnología" },
  { value: "infraestructura", label: "Infraestructura" },
  { value: "otro", label: "Otro" },
]

export const CATEGORIA_LABEL: Record<CategoriaInversion, string> =
  Object.fromEntries(
    CATEGORIA_OPCIONES.map((o) => [o.value, o.label]),
  ) as Record<CategoriaInversion, string>

export const ESTADO_INVERSION_OPCIONES: {
  value: EstadoInversion
  label: string
}[] = [
  { value: "programada", label: "Programada" },
  { value: "aprobada", label: "Aprobada" },
  { value: "en_curso", label: "En curso" },
  { value: "realizada", label: "Realizada" },
  { value: "cancelada", label: "Cancelada" },
]

export const ESTADO_INVERSION_LABEL: Record<EstadoInversion, string> =
  Object.fromEntries(
    ESTADO_INVERSION_OPCIONES.map((o) => [o.value, o.label]),
  ) as Record<EstadoInversion, string>

export const ESTADO_INVERSION_BADGE_CLASS: Record<EstadoInversion, string> = {
  programada: "border-slate-200 bg-slate-100 text-slate-700",
  aprobada: "border-blue-200 bg-blue-100 text-blue-700",
  en_curso: "border-amber-200 bg-amber-100 text-amber-800",
  realizada: "border-emerald-200 bg-emerald-100 text-emerald-700",
  cancelada: "border-red-200 bg-red-100 text-red-700",
}
