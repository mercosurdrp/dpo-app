/**
 * Tipos y catálogos compartidos del módulo Agenda.
 *
 * Archivo "puro" (sin "use server" ni JSX) para que lo puedan importar tanto
 * las server actions como los componentes cliente. Las clases de color son
 * literales fijos (no interpolados) para que Tailwind no las purgue.
 */

export type CategoriaAgenda =
  | "reunion"
  | "tarea"
  | "recordatorio"
  | "capacitacion"
  | "visita"
  | "otro"

export type Recurrencia = "ninguna" | "diaria" | "semanal" | "mensual"

export interface AgendaEvento {
  id: string
  titulo: string
  descripcion: string | null
  fecha: string // "YYYY-MM-DD" — en una instancia recurrente es la fecha de la ocurrencia
  todo_el_dia: boolean
  hora_inicio: string | null // "HH:MM"
  hora_fin: string | null
  categoria: CategoriaAgenda
  responsable: string | null
  ubicacion: string | null
  recurrencia: Recurrencia
  recurrencia_hasta: string | null
  /** Fecha del evento "maestro" (= fecha si no es recurrente). La usa el form al editar la serie. */
  fecha_base?: string
  creado_por: string | null
  created_at: string
  updated_at: string
}

/** Payload de creación / edición (lo que envía el formulario). */
export interface AgendaEventoInput {
  titulo: string
  descripcion?: string | null
  fecha: string
  todo_el_dia: boolean
  hora_inicio?: string | null
  hora_fin?: string | null
  categoria: CategoriaAgenda
  responsable?: string | null
  ubicacion?: string | null
  recurrencia: Recurrencia
  recurrencia_hasta?: string | null
}

interface CategoriaMeta {
  label: string
  /** Punto/relleno en el calendario. */
  dot: string
  /** Chip del evento (texto + fondo suave). */
  chip: string
  /** Badge sólido para la vista lista / selector. */
  badge: string
}

export const CATEGORIAS: Record<CategoriaAgenda, CategoriaMeta> = {
  reunion: {
    label: "Reunión",
    dot: "bg-blue-500",
    chip: "bg-blue-50 text-blue-700 hover:bg-blue-100",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
  },
  tarea: {
    label: "Tarea",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  recordatorio: {
    label: "Recordatorio",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 hover:bg-amber-100",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
  },
  capacitacion: {
    label: "Capacitación",
    dot: "bg-violet-500",
    chip: "bg-violet-50 text-violet-700 hover:bg-violet-100",
    badge: "bg-violet-100 text-violet-700 border-violet-200",
  },
  visita: {
    label: "Visita",
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 hover:bg-rose-100",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
  },
  otro: {
    label: "Otro",
    dot: "bg-slate-400",
    chip: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
  },
}

export const CATEGORIAS_ORDEN: CategoriaAgenda[] = [
  "reunion",
  "tarea",
  "recordatorio",
  "capacitacion",
  "visita",
  "otro",
]

export const RECURRENCIAS: { value: Recurrencia; label: string }[] = [
  { value: "ninguna", label: "No se repite" },
  { value: "diaria", label: "Todos los días" },
  { value: "semanal", label: "Cada semana" },
  { value: "mensual", label: "Cada mes" },
]

export function labelRecurrencia(r: string): string {
  return RECURRENCIAS.find((x) => x.value === r)?.label ?? "No se repite"
}

export function metaCategoria(c: string): CategoriaMeta {
  return CATEGORIAS[(c as CategoriaAgenda)] ?? CATEGORIAS.otro
}

/** "HH:MM:SS" | "HH:MM" → "HH:MM" (o null). */
export function hhmm(t: string | null | undefined): string | null {
  if (!t) return null
  return t.slice(0, 5)
}
