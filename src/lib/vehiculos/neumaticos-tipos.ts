import type { EjeNeumatico } from "@/lib/vehiculos/neumaticos-layout"

// Tipos y constantes de neumáticos. Viven fuera del archivo de server actions
// ("use server" solo puede exportar funciones async; exportar tipos/const desde
// ahí rompe el build de Turbopack).

// Umbral de profundidad (mm) a partir del cual una cubierta instalada se
// considera en desgaste crítico (cambio próximo).
export const PROFUNDIDAD_CRITICA_MM = 3

export type NeumaticoTipo = "nuevo" | "recapado"

/**
 * Dibujo de la banda de rodamiento.
 *
 * No es un detalle estético: define con cuánta goma arranca la cubierta. Una
 * misma marca vuelve del recapador con distinta profundidad según el dibujo que
 * se le pidió (mayormente 15 mm, pero varía), así que sin el dibujo no se puede
 * explicar el desgaste ni comparar dos gomas entre sí.
 */
export type NeumaticoDibujo = "liso" | "taco" | "semi_taco"

export const NEUMATICO_DIBUJO_LABEL: Record<NeumaticoDibujo, string> = {
  liso: "Liso",
  taco: "Taco",
  semi_taco: "Semi taco",
}

export const NEUMATICO_DIBUJOS: NeumaticoDibujo[] = ["liso", "taco", "semi_taco"]

/**
 * Opción "sin dato" de los selectores de dibujo. Va como centinela porque el
 * Select de shadcn no admite un item con value="" (lo interpreta como limpiar).
 */
export const SIN_DIBUJO = "__sin_dibujo__"

/**
 * Estados de una cubierta.
 * - `stock`: en depósito, lista para montar. Si es de segunda vuelta viene con
 *   `tipo='recapado'`, así el stock se lee separado (nuevas vs recapadas).
 * - `para_recapar`: salió del camión con goma para una vuelta más y espera el
 *   recapado. Está en el depósito pero NO disponible para montar.
 * - `en_recapado`: ya salió en un remito y está en poder del recapador.
 * - `para_desecho`: no sirve más (ni para recapar) y espera a la recicladora.
 * - `instalado` / `baja`: puesta en una unidad / descartada.
 */
export type NeumaticoEstado =
  | "stock"
  | "para_recapar"
  | "en_recapado"
  | "para_desecho"
  | "instalado"
  | "baja"

export const NEUMATICO_ESTADO_LABEL: Record<NeumaticoEstado, string> = {
  stock: "En stock",
  para_recapar: "Para recapar",
  en_recapado: "En el recapador",
  para_desecho: "Para desechar",
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
  /** Dibujo de la banda. De él depende con cuánta goma arranca. NULL = sin relevar. */
  dibujo: NeumaticoDibujo | null
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
  /** Cuántas veces se recapó esta misma cubierta (el recapador devuelve la goma
   *  con el mismo código, así que la fila es siempre la misma). */
  vueltas_recapado: number
  /** Retiro a la recicladora con el que se fue (fila de `mantenimiento_residuos`).
   *  NULL = baja administrativa, sin remito de retiro. */
  residuo_id: string | null
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
  /** Ya enviadas: están en poder del recapador. */
  enRecapado: number
  /** Esperando que la recicladora las retire. */
  paraDesecho: number
  instalados: number
  criticos: number
  bajasMes: number
}

// ==================== Recapados ====================

/** Estado del remito: salió al recapador / ya volvió. */
export type RecapadoEstado = "enviado" | "recibido"

/** Qué pasó con cada cubierta del envío. */
export type RecapadoResultado = "pendiente" | "recapada" | "descartada"

/** Una cubierta dentro del remito: cómo salió y cómo volvió. */
export interface RecapadoItem {
  id: string
  recapado_id: string
  neumatico_id: string
  numero_envio: string | null
  marca: string | null
  medida: string | null
  /** De qué unidad venía cuando se desmontó (informativo). */
  dominio_origen: string | null
  profundidad_envio_mm: number | null
  /** Código con el que la devolvió el recapador (normalmente el mismo). */
  numero_retorno: string | null
  profundidad_retorno_mm: number | null
  /** Dibujo con el que volvió: es lo que explica la profundidad de retorno. */
  dibujo_retorno: NeumaticoDibujo | null
  /** Parte del costo total del envío que le tocó. */
  costo: number | null
  resultado: RecapadoResultado
  observaciones: string | null
  created_at: string
}

/** Remito de envío al recapador (una tanda, puede mezclar varias unidades). */
export interface Recapado {
  id: string
  numero_remito: string | null
  proveedor: string
  fecha_envio: string
  fecha_retorno: string | null
  estado: RecapadoEstado
  factura_numero: string | null
  factura_urls: string[] | null
  costo_total: number | null
  observaciones: string | null
  created_at: string
  updated_at: string
  items: RecapadoItem[]
}

// ==================== Desecho / reciclado ====================

/**
 * Un retiro de cubiertas a la recicladora. Es una fila de
 * `mantenimiento_residuos` (la tabla de disposición de residuos del módulo), no
 * una tabla nueva: así el retiro da de baja las cubiertas y al mismo tiempo
 * queda como evidencia ambiental con su certificado de descarte.
 */
export interface RetiroCubiertas {
  id: string
  fecha: string
  /** Siempre "Cubiertas" en los retiros que genera este módulo. */
  material: string
  descripcion: string | null
  cantidad: number | null
  unidad: string | null
  /** La recicladora / quien se las lleva. */
  proveedor: string
  /** Los códigos de las cubiertas retiradas, como los pide el registro. */
  numeros_fuego: string | null
  certificado_url: string | null
  observaciones: string | null
  created_at: string
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
