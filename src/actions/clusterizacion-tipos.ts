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
  en_crecimiento: "En crecimiento",
  basico: "Básico",
  ventas_bajas: "Ventas Bajas",
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
  /** RMD promedio del cliente en la ventana (1-5). null = sin calificaciones. */
  rmd_prom: number | null
  rmd_n: number
  /** Entregas rechazadas por CAUSA DEL CLIENTE (sin dinero/cerrado/sin envases), últimos 45 días. */
  rechazos_culpa: number
  /** Entregas rechazadas por cualquier motivo, últimos 45 días. */
  rechazos_total: number
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
  resumen: ClusterResumen[]
  clientes: ClienteClusterizado[]
}
