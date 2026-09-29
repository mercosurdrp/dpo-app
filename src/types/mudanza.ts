// Tipos del módulo Mudanza (tablas mudanza_* de la migración 20260929150000).
import type { ArchivoAvance } from "@/lib/adjuntos-avance"

export type MudanzaEstado = "pendiente" | "en_curso" | "hecha" | "bloqueada"
export type MudanzaGastoEstado = "comprometido" | "pagado"

export const MUDANZA_ESTADOS: { value: MudanzaEstado; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_curso", label: "En curso" },
  { value: "hecha", label: "Hecha" },
  { value: "bloqueada", label: "Bloqueada" },
]

/** Orden fijo de rubros para agrupar el Gantt y el presupuesto. */
export const MUDANZA_RUBROS = [
  "Hitos",
  "Habilitaciones y legales",
  "Obra civil",
  "Seguridad electrónica",
  "Sistemas e internet",
  "Traslados y equipamiento",
  "Personal y comunicación",
  "Depósito viejo",
]

export interface MudanzaConfig {
  id: string
  nombre: string
  fecha_llaves: string | null
  fecha_mudanza: string | null
  updated_at: string
}

export interface MudanzaMiembro {
  profile_id: string
  orden: number
  nombre: string
  email: string | null
}

export interface MudanzaTarea {
  id: string
  codigo: string | null
  rubro: string
  nombre: string
  responsable_id: string | null
  inicio: string | null
  fin: string | null
  inicio_real: string | null
  fin_real: string | null
  estado: MudanzaEstado
  avance: number
  hito: boolean
  notas: string | null
  orden: number
  created_by: string | null
  created_at: string
  updated_at: string
  responsable_nombre: string | null
}

export interface MudanzaAvance {
  id: string
  tarea_id: string
  fecha: string
  avance: number
  estado: MudanzaEstado
  comentario: string | null
  archivos: ArchivoAvance[]
  created_by: string | null
  created_at: string
  autor_nombre: string | null
}

export interface MudanzaPartida {
  id: string
  rubro: string
  nombre: string
  cantidad: number
  unitario: number
  monto: number
  notas: string | null
  orden: number
  created_at: string
  updated_at: string
}

export interface MudanzaGasto {
  id: string
  partida_id: string | null
  tarea_id: string | null
  rubro: string
  fecha: string
  proveedor: string | null
  concepto: string
  monto: number
  estado: MudanzaGastoEstado
  archivos: ArchivoAvance[]
  notas: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  partida_nombre: string | null
}
