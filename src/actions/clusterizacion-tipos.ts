// Tipos y constantes de la clusterización de clientes (Planeamiento 4.2).
// Viven fuera de `clusterizacion.ts` porque ese archivo es "use server" y un
// módulo "use server" solo puede exportar funciones async (exportar un objeto
// como CLUSTER_LABELS rompe el build de Turbopack).
import type { PeriodoComparado } from "@/lib/mercosur-dashboard"

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
}

export interface ClusterizacionData {
  periodo: PeriodoComparado
  /** Umbral de ingresos (mediana) que separa "alto" de "bajo". */
  umbral_ingresos: number
  resumen: ClusterResumen[]
  clientes: ClienteClusterizado[]
}
