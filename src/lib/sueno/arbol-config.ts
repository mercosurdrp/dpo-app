/**
 * Árbol del Sueño — topología fija del cascadeo de indicadores.
 *
 * La estructura (qué KPI baja de cuál, en qué nivel y rama) vive acá en el
 * front; en la base (tabla `sueno_kpi_valores`) solo se guardan los valores
 * editables (valor_ytd / meta / gatillo / mejor_si) por `key` y año.
 *
 * Fuente: slide 3 de "Def del SUEÑO.pptx".
 */

import type { EstadoSemaforo } from "./semaforo"

export type SuenoRama = "seguridad" | "productividad" | "cliente"
export type SuenoNivel = "estrategia" | "gestion" | "operacional" | "estacion"
export type MejorSi = "mayor" | "menor"

export interface SuenoNodoConfig {
  /** key estable, debe matchear `sueno_kpi_valores.kpi_key` */
  key: string
  label: string
  nivel: SuenoNivel
  rama: SuenoRama
  /** key del padre en la cascada (null para los 3 KPI estratégicos) */
  parentKey: string | null
  unidad: string
  mejorSi: MejorSi
  /** meta por defecto (la real se lee de la base; esto es fallback) */
  metaDefault: number | null
}

/** Nodo del árbol enriquecido con los valores cargados (se arma en el server action). */
export interface SuenoNodo extends SuenoNodoConfig {
  anio: number
  valorYtd: number | null
  meta: number | null
  gatillo: number | null
  nota: string | null
  estado: EstadoSemaforo
  updatedAt: string | null
}

/** Color por rama (hex). Reusa la paleta de pilares de la app. */
export const RAMA_COLOR: Record<SuenoRama, string> = {
  seguridad: "#F97316", // naranja
  productividad: "#3B82F6", // azul
  cliente: "#F59E0B", // ámbar
}

export const RAMA_LABEL: Record<SuenoRama, string> = {
  seguridad: "Seguridad",
  productividad: "Productividad / Costo",
  cliente: "Cliente / Servicio",
}

export const NIVEL_LABEL: Record<SuenoNivel, string> = {
  estrategia: "Estrategia · Resultados",
  gestion: "Gestión",
  operacional: "Operacional",
  estacion: "Estación de trabajo · Tarea",
}

export const NIVELES_ORDEN: SuenoNivel[] = [
  "estrategia",
  "gestion",
  "operacional",
  "estacion",
]

/** Frase del Sueño (slide 2/3 del PPT). */
export const SUENO_FRASE =
  "Soñamos con ser la empresa que marque la diferencia en nuestro rubro, " +
  "liderando con excelencia operativa, pasión y profesionalismo en cada área. " +
  "Lo medimos a través del compromiso en la seguridad de las personas (TRI), " +
  "la eficiencia en nuestros costos logísticos (VLC/HL) y la satisfacción de " +
  "nuestros clientes (OTIF)."

export const ARBOL_SUENO: SuenoNodoConfig[] = [
  // ---- Estrategia (Resultados) ----
  { key: "tri", label: "TRI", nivel: "estrategia", rama: "seguridad", parentKey: null, unidad: "cant.", mejorSi: "menor", metaDefault: 1 },
  { key: "vlc_hl", label: "VLC/HL", nivel: "estrategia", rama: "productividad", parentKey: null, unidad: "$/HL", mejorSi: "menor", metaDefault: 10500 },
  { key: "otif", label: "OTIF", nivel: "estrategia", rama: "cliente", parentKey: null, unidad: "%", mejorSi: "menor", metaDefault: 1.7 },

  // ---- Gestión ----
  { key: "lti", label: "LTI", nivel: "gestion", rama: "seguridad", parentKey: "tri", unidad: "cant.", mejorSi: "menor", metaDefault: 0 },
  { key: "tlp", label: "TLP", nivel: "gestion", rama: "productividad", parentKey: "vlc_hl", unidad: "Ceq/hh", mejorSi: "mayor", metaDefault: 40 },
  { key: "wnp", label: "WNP", nivel: "gestion", rama: "productividad", parentKey: "vlc_hl", unidad: "HL/HH", mejorSi: "mayor", metaDefault: 6.5 },
  { key: "in_full", label: "IN-FULL", nivel: "gestion", rama: "cliente", parentKey: "otif", unidad: "%", mejorSi: "menor", metaDefault: 1.7 },

  // ---- Operacional ----
  { key: "n_incidentes", label: "N° Incidentes", nivel: "operacional", rama: "seguridad", parentKey: "lti", unidad: "cant.", mejorSi: "menor", metaDefault: 20 },
  { key: "comportamientos", label: "Comportamientos Inseguros", nivel: "operacional", rama: "seguridad", parentKey: "n_incidentes", unidad: "cant.", mejorSi: "mayor", metaDefault: 100 },
  { key: "tiempo_ruta", label: "Tiempo en Ruta", nivel: "operacional", rama: "productividad", parentKey: "tlp", unidad: "hs", mejorSi: "menor", metaDefault: 8 },
  { key: "prod_picking", label: "Prod Picking", nivel: "operacional", rama: "productividad", parentKey: "wnp", unidad: "Bul/HH", mejorSi: "mayor", metaDefault: 300 },
  { key: "rechazo", label: "Rechazo", nivel: "operacional", rama: "cliente", parentKey: "in_full", unidad: "%", mejorSi: "menor", metaDefault: 1.7 },

  // ---- Estación de trabajo / Tarea ----
  { key: "tiempo_pdv", label: "Tiempo en PDV", nivel: "estacion", rama: "productividad", parentKey: "tiempo_ruta", unidad: "hs", mejorSi: "menor", metaDefault: 5.2 },
  { key: "cantidad_pnp", label: "Cantidad PNP", nivel: "estacion", rama: "productividad", parentKey: "tiempo_ruta", unidad: "%", mejorSi: "menor", metaDefault: 5 },
  { key: "hs_extras", label: "HS Extras", nivel: "estacion", rama: "productividad", parentKey: "prod_picking", unidad: "hs", mejorSi: "menor", metaDefault: 5.6 },
  { key: "sin_dinero", label: "Sin Dinero", nivel: "estacion", rama: "cliente", parentKey: "rechazo", unidad: "cant.", mejorSi: "menor", metaDefault: null },
  { key: "cerrado", label: "Cerrado", nivel: "estacion", rama: "cliente", parentKey: "rechazo", unidad: "cant.", mejorSi: "menor", metaDefault: null },
]

/** KPIs estratégicos (raíces del árbol), en orden de rama. */
export const KPIS_ESTRATEGICOS = ARBOL_SUENO.filter((n) => n.nivel === "estrategia")

// ---------------------------------------------------------------------------
// Carga mensual de KPIs manuales (tabla `sueno_kpi_mensual`)
// ---------------------------------------------------------------------------

export type AgregacionMensual = "promedio" | "suma"

/**
 * KPIs de fuente MANUAL que admiten carga mes a mes, con la regla para
 * calcular el YTD desde los meses cargados. Los que no figuran acá tienen
 * detalle automático (RPC `sueno_kpi_detalle`) o externo (deposito-esteban).
 */
export const KPI_AGREGACION_MENSUAL: Record<string, AgregacionMensual> = {
  tri: "suma",
  lti: "suma",
  tlp: "promedio",
  wnp: "promedio",
  tiempo_ruta: "promedio",
  tiempo_pdv: "promedio",
  cantidad_pnp: "promedio",
  hs_extras: "promedio",
}

export function esKpiManualMensual(key: string): boolean {
  return key in KPI_AGREGACION_MENSUAL
}

/** YTD desde los valores mensuales cargados (null si no hay ninguno). */
export function agregarMensual(key: string, valores: number[]): number | null {
  if (valores.length === 0) return null
  const suma = valores.reduce((a, b) => a + b, 0)
  if (KPI_AGREGACION_MENSUAL[key] === "suma") return suma
  return Math.round((suma / valores.length) * 100) / 100
}
