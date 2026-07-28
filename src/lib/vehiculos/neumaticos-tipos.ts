import type { EjeNeumatico } from "@/lib/vehiculos/neumaticos-layout"

// Tipos y constantes de neumáticos. Viven fuera del archivo de server actions
// ("use server" solo puede exportar funciones async; exportar tipos/const desde
// ahí rompe el build de Turbopack).

// Umbral de profundidad (mm) a partir del cual una cubierta instalada se
// considera en desgaste crítico (cambio próximo).
export const PROFUNDIDAD_CRITICA_MM = 3

export type NeumaticoTipo = "nuevo" | "recapado"

/**
 * Estados de una cubierta.
 * - `stock`: en depósito, lista para montar. Si es de segunda vuelta viene con
 *   `tipo='recapado'`, así el stock se lee separado (nuevas vs recapadas).
 * - `para_recapar`: salió del camión con goma para una vuelta más y espera el
 *   recapado. NO está disponible para montar.
 * - `instalado` / `baja`: puesta en una unidad / descartada.
 */
export type NeumaticoEstado = "stock" | "para_recapar" | "instalado" | "baja"

export const NEUMATICO_ESTADO_LABEL: Record<NeumaticoEstado, string> = {
  stock: "En stock",
  para_recapar: "Para recapar",
  instalado: "Instalada",
  baja: "De baja",
}

/** Cómo se agrupa el depósito: nuevas, recapadas listas y las que esperan recapado. */
export type GrupoStock = "nuevas" | "recapadas" | "para_recapar"

export const GRUPO_STOCK_LABEL: Record<GrupoStock, string> = {
  nuevas: "Stock — nuevas",
  recapadas: "Stock — recapadas",
  para_recapar: "Para recapar",
}

export function grupoStockDe(n: {
  estado: NeumaticoEstado
  tipo: NeumaticoTipo
}): GrupoStock | null {
  if (n.estado === "para_recapar") return "para_recapar"
  if (n.estado !== "stock") return null
  return n.tipo === "recapado" ? "recapadas" : "nuevas"
}

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
  /** Compra: cuándo, a quién y a cuánto (para el costo de flota). */
  fecha_compra: string | null
  proveedor: string | null
  costo_unitario: number | null
  created_at: string
  updated_at: string
  mediciones?: NeumaticoMedicion[]
}

export interface NeumaticosResumen {
  stock: number
  /** Del total en stock, cuántas son recapadas listas para montar. */
  stockRecapadas: number
  /** Esperando recapado: no se pueden montar. */
  paraRecapar: number
  instalados: number
  criticos: number
  bajasMes: number
}

/** Las tres acciones del módulo de neumáticos, cada una con su intervalo de km. */
export type AccionNeumaticos = "rotacion" | "alineacion" | "balanceo"

/** Intervalo de km de una acción para un tipo de unidad (camión = 50.000). */
export interface IntervaloNeumaticos {
  tipo_vehiculo: string
  accion: AccionNeumaticos
  km: number
}

export interface Alineacion {
  id: string
  dominio: string
  /** Qué se hizo: solo alineación, solo balanceo o las dos juntas. */
  tipo: "alineacion" | "balanceo" | "ambos"
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
