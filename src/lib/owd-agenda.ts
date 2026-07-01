// Tipos y constantes del calendario de OWD (sin lógica de servidor, para que
// lo puedan importar tanto los Server Actions como los componentes cliente).

export type AgendaEstado = "planificada" | "realizada" | "cancelada"

export interface AgendaOwd {
  id: string
  template_id: string
  fecha: string // YYYY-MM-DD
  supervisor: string | null
  empleado_observado: string | null
  nota: string | null
  estado: AgendaEstado
  observacion_id: string | null
  created_at: string
  updated_at: string
}

export interface AgendaOwdInput {
  template_id: string
  fecha: string
  supervisor?: string | null
  empleado_observado?: string | null
  nota?: string | null
  estado?: AgendaEstado
}

export const AGENDA_ESTADOS: AgendaEstado[] = ["planificada", "realizada", "cancelada"]

export const ESTADO_LABEL: Record<AgendaEstado, string> = {
  planificada: "Planificada",
  realizada: "Realizada",
  cancelada: "Cancelada",
}

// Paleta rotativa para diferenciar plantillas en el calendario (dot + chip).
export const AGENDA_COLORES: Array<{ dot: string; chip: string }> = [
  { dot: "bg-blue-500", chip: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
  { dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" },
  { dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700 hover:bg-amber-200" },
  { dot: "bg-violet-500", chip: "bg-violet-100 text-violet-700 hover:bg-violet-200" },
  { dot: "bg-rose-500", chip: "bg-rose-100 text-rose-700 hover:bg-rose-200" },
  { dot: "bg-cyan-500", chip: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200" },
]
