// Tipos y constantes de la clusterización de clientes (Planeamiento 4.2).
// Viven fuera de `clusterizacion.ts` porque ese archivo es "use server" y un
// módulo "use server" solo puede exportar funciones async (exportar un objeto
// como CLUSTER_LABELS rompe el build de Turbopack).
import type { ClusterPeriodo } from "@/lib/mercosur-dashboard"

// Los 4 clústeres del manual DPO (Planeamiento 4.2), definidos por el cruce
// 2×2 de ingresos (alto/bajo) × crecimiento (positivo/negativo).
export type ClusterId = "ganador" | "en_crecimiento" | "basico" | "ventas_bajas"

export const CLUSTER_LABELS: Record<ClusterId, string> = {
  ganador: "Ganador",
  en_crecimiento: "Productor",
  basico: "Básico",
  ventas_bajas: "Ventas Bajas",
}

// Matriz Valor × Costo: cruce de facturación (alta/baja, mediana) con el costo
// logístico $/HL del año (alto/bajo, mediana). Cada cuadrante tiene una jugada.
export type CuadranteId = "proteger" | "optimizar" | "mantener" | "revisar"

export const CUADRANTE_LABELS: Record<CuadranteId, string> = {
  proteger: "Óptimos",
  optimizar: "Operacional",
  mantener: "Transaccional",
  revisar: "Parásitos",
}

// ── Diagrama 3D (2×2×2) ──────────────────────────────────────────────────────
// Cruce de los 3 ejes binarios → 8 tipos de cliente:
//   Z facturación (alta/baja, mediana) × X costo $/HL (mayor/menor, mediana) ×
//   Y crecimiento (mayor/menor vs YTD anterior).
export type CuboId =
  | "estrella" | "rentable" | "motor" | "pesado"
  | "promesa" | "hormiga" | "dilema" | "critico"

export interface CuboMeta {
  label: string
  /** Lectura / jugada recomendada. */
  jugada: string
  color: string
  /** Coordenadas para el gráfico 3D (0/1). x=costo mayor, y=crecimiento mayor, z=facturación alta. */
  x: 0 | 1
  y: 0 | 1
  z: 0 | 1
}

export const CUBO_META: Record<CuboId, CuboMeta> = {
  estrella: { label: "Estrella", jugada: "Lo mejor: factura, barato y crece. Proteger y replicar.", color: "#059669", x: 0, y: 1, z: 1 },
  rentable: { label: "Rentable", jugada: "Gran margen y estable (vaca lechera). Defender y ordeñar.", color: "#0d9488", x: 0, y: 0, z: 1 },
  motor: { label: "Motor", jugada: "Crece y factura pero caro. Abaratar la logística.", color: "#2563eb", x: 1, y: 1, z: 1 },
  pesado: { label: "Pesado", jugada: "Factura, caro y plano. Optimizar costo de servir.", color: "#d97706", x: 1, y: 0, z: 1 },
  promesa: { label: "Promesa", jugada: "Chico, barato y subiendo. Potenciar / desarrollar.", color: "#0891b2", x: 0, y: 1, z: 0 },
  hormiga: { label: "Hormiga", jugada: "Chico, barato y plano. Mantener sin esfuerzo.", color: "#64748b", x: 0, y: 0, z: 0 },
  dilema: { label: "Dilema", jugada: "Crece pero caro y chico. Vigilar: ¿escala o drena?", color: "#c026d3", x: 1, y: 1, z: 0 },
  critico: { label: "Crítico", jugada: "Chico, caro y cayendo (sangría). Revisar / desinvertir.", color: "#dc2626", x: 1, y: 0, z: 0 },
}

export interface ClienteClusterizado {
  id_cliente: number
  nombre: string | null
  localidad: string | null
  promotor: string | null
  /** Supervisor de venta (derivado del promotor). */
  supervisor: string | null
  segmento: string | null
  cluster: ClusterId
  ingresos_actual: number
  ingresos_anterior: number
  /** Crecimiento relativo período/período. null = cliente nuevo (sin venta previa). */
  crecimiento_pct: number | null
  bultos_actual: number
  dias_actual: number
  /** Proxy de costo de servir: bultos por visita (menor = más caro de servir). */
  drop_size: number
  /**
   * Costo logístico $/HL acumulado del año (YTD), traído del indicador Costo/PDV
   * (misma fuente que su solapa "Acumulado"). null = el PDV no tiene costo cargado.
   */
  costo_x_hl_ytd: number | null
  /** Costo $/HL por encima de la mediana del año (caro de servir). null = sin dato de costo. */
  costo_alto: boolean | null
  /** Cuadrante Valor×Costo (facturación alta/baja × $/HL alto/bajo). null = sin dato de costo. */
  cuadrante: CuadranteId | null
  /** Cubo del diagrama 3D (facturación × costo × crecimiento). null = sin dato de costo. */
  cubo: CuboId | null
  /** Equipos de frío (EDF) INSTALADOS en el PDV (comodato). 0 = ninguno. */
  equipos_frio_n: number
  /** Modelos de equipos de frío instalados (resumen). null = ninguno. */
  equipos_frio_tipos: string | null
  /** RMD promedio del cliente en la ventana (1-5). null = sin calificaciones. */
  rmd_prom: number | null
  rmd_n: number
  /** Entregas rechazadas por CAUSA DEL CLIENTE (sin dinero/cerrado/sin envases), últimos 45 días. */
  rechazos_culpa: number
  /** Entregas rechazadas por cualquier motivo, últimos 45 días. */
  rechazos_total: number
  /** Detalle de los rechazos por culpa del cliente (cada entrega: fecha, motivo, bultos), 45 días. */
  rechazos_detalle: { fecha: string; motivo: string; bultos: number }[]
  /**
   * ESTADO (responsabilidad del cliente): "no_pasa" si rechazó ≥ 1 entrega por su
   * culpa (sin dinero / cerrado / sin envases) en los últimos 45 días. Los rechazos
   * por error interno (preventa, distribución, etc.) NO cuentan.
   */
  estado: "pasa" | "no_pasa"
  /** Señal de salud: drop size (45 días) por debajo del piso (caro de servir). */
  drop_bajo: boolean
  /** Señal de salud: RMD promedio por debajo del piso (mal servicio percibido). */
  rmd_bajo: boolean
  /** SALUD de servicio: "atencion" si drop bajo o RMD bajo; "sano" si ninguna. */
  salud: "sano" | "atencion"
}

export interface ClusterResumen {
  cluster: ClusterId
  clientes: number
  ingresos_total: number
  pct_clientes: number
  pct_ingresos: number
  drop_size_prom: number
  rmd_prom: number | null
  rmd_n: number
  /** Clientes del cluster por estado de salud de servicio. */
  no_pasan: number
  en_atencion: number
  sanos: number
}

export interface ClusterizacionData {
  periodo: ClusterPeriodo
  /** Umbral de facturación YTD (mediana) que separa "alto" de "bajo". */
  umbral_ingresos: number
  /** Umbral de costo $/HL (mediana del año) que separa "caro" de "barato". 0 si no hay datos. */
  umbral_costo: number
  resumen: ClusterResumen[]
  clientes: ClienteClusterizado[]
}
