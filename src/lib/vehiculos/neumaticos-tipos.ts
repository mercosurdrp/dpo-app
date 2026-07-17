import type { EjeNeumatico } from "@/lib/vehiculos/neumaticos-layout"

// Tipos y constantes de neumáticos. Viven fuera del archivo de server actions
// ("use server" solo puede exportar funciones async; exportar tipos/const desde
// ahí rompe el build de Turbopack).

// Umbral de profundidad (mm) a partir del cual una cubierta instalada se
// considera en desgaste crítico (cambio próximo).
export const PROFUNDIDAD_CRITICA_MM = 3

export type NeumaticoTipo = "nuevo" | "recapado"
export type NeumaticoEstado = "stock" | "instalado" | "baja"

export interface NeumaticoMedicion {
  id: string
  neumatico_id: string
  fecha: string
  profundidad_mm: number | null
  km: number | null
  presion_psi: number | null
  nota: string | null
  created_at: string
}

export interface Neumatico {
  id: string
  numero: string | null
  tipo: NeumaticoTipo
  marca: string | null
  medida: string | null
  dominio: string | null
  posicion: string | null
  eje: EjeNeumatico | null
  profundidad_inicial_mm: number | null
  profundidad_actual_mm: number | null
  km_instalacion: number | null
  /** Objetivo de km de vida útil (estimar el próximo cambio). NULL = usar el
   *  default por tipo (nuevo/recapado). */
  vida_util_km: number | null
  estado: NeumaticoEstado
  motivo_baja: string | null
  fecha_ingreso: string
  fecha_instalacion: string | null
  fecha_baja: string | null
  observaciones: string | null
  /** Foto/PDF de la factura de compra (URLs públicas del bucket de facturas). */
  factura_urls: string[] | null
  created_at: string
  updated_at: string
  mediciones?: NeumaticoMedicion[]
}

export interface NeumaticosResumen {
  stock: number
  instalados: number
  criticos: number
  bajasMes: number
}

export interface Alineacion {
  id: string
  dominio: string
  fecha: string
  km: number | null
  proxima_fecha: string | null
  proxima_km: number | null
  costo: number | null
  proveedor: string | null
  observaciones: string | null
  /** OT que la generó automáticamente (null si fue carga manual). */
  ot_id: string | null
  created_at: string
}

export interface Rotacion {
  id: string
  dominio: string
  fecha: string
  km: number | null
  proxima_fecha: string | null
  proxima_km: number | null
  observaciones: string | null
  /** OT que la generó automáticamente (null si fue carga manual). */
  ot_id: string | null
  created_at: string
}
