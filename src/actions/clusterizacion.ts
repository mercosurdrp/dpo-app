"use server"

import { consultarClusterClientes } from "@/lib/mercosur-dashboard"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import type {
  ClusterId,
  ClienteClusterizado,
  ClusterResumen,
  ClusterizacionData,
} from "./clusterizacion-tipos"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA =
  "La clusterización de clientes solo está disponible en Pampeana."

// ESTADO (pasa/no pasa): solo cuentan los rechazos por CAUSA DEL CLIENTE.
// El resto de motivos (error de preventa, distribución, sin stock, etc.) son
// fallas internas y NO hacen "no pasa".
const MOTIVOS_CULPA_CLIENTE = new Set(["SIN DINERO", "CERRADO", "SIN ENVASES"])
// SALUD (sano/atención): caro o flojo de servir.
const DROP_BAJO = 3 // bultos por visita por debajo de esto = caro de servir
const RMD_BAJO = 4.5 // RMD promedio por debajo de esto = mal servicio

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const orden = [...valores].sort((a, b) => a - b)
  const mid = Math.floor(orden.length / 2)
  return orden.length % 2 === 0
    ? (orden[mid - 1] + orden[mid]) / 2
    : orden[mid]
}

function clasificar(ingresoAlto: boolean, crecePositivo: boolean): ClusterId {
  if (ingresoAlto) return crecePositivo ? "ganador" : "basico"
  return crecePositivo ? "en_crecimiento" : "ventas_bajas"
}

/**
 * Calificaciones RMD por cliente (promedio y cantidad) desde la ventana indicada.
 */
async function getRmdPorCliente(
  desde: string,
): Promise<Map<number, { suma: number; n: number }>> {
  const supabase = await createClient()
  const acc = new Map<number, { suma: number; n: number }>()
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("nps_rmd_cliente")
      .select("cod_cliente, puntuacion")
      .gte("fecha_puntuacion", desde)
      .range(from, from + PAGE - 1)
    if (error) break // RMD es opcional: si falla, seguimos sin él
    if (!data || data.length === 0) break
    for (const r of data as { cod_cliente: number; puntuacion: number }[]) {
      const prev = acc.get(r.cod_cliente) ?? { suma: 0, n: 0 }
      prev.suma += r.puntuacion
      prev.n += 1
      acc.set(r.cod_cliente, prev)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return acc
}

/**
 * Entregas rechazadas por cliente en la ventana [desde, hasta], separando las
 * que son por CAUSA DEL CLIENTE (sin dinero/cerrado/sin envases) del total.
 */
async function getRechazoPorCliente(
  desde: string,
  hasta: string,
): Promise<Map<number, { culpa: number; total: number }>> {
  const supabase = await createClient()
  const acc = new Map<number, { culpa: number; total: number }>()
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("rechazos")
      .select("id_cliente, ds_rechazo")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .range(from, from + PAGE - 1)
    if (error) break // rechazo es opcional: si falla, seguimos sin él
    if (!data || data.length === 0) break
    for (const r of data as { id_cliente: number; ds_rechazo: string | null }[]) {
      const prev = acc.get(r.id_cliente) ?? { culpa: 0, total: 0 }
      prev.total += 1 // cada fila = una entrega rechazada
      if (MOTIVOS_CULPA_CLIENTE.has((r.ds_rechazo ?? "").trim().toUpperCase())) {
        prev.culpa += 1
      }
      acc.set(r.id_cliente, prev)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return acc
}

/**
 * Mapeo promotor → supervisor de venta, derivado de `rechazos` (que trae el par
 * ds_vendedor/ds_supervisor). El mapeo es 1:1, así que con la primera aparición
 * alcanza. Se usa para poder filtrar el explorador por supervisor.
 */
async function getSupervisorPorPromotor(desde: string): Promise<Map<string, string>> {
  const supabase = await createClient()
  const m = new Map<string, string>()
  const { data } = await supabase
    .from("rechazos")
    .select("ds_vendedor, ds_supervisor")
    .gte("fecha", desde)
    .not("ds_vendedor", "is", null)
    .not("ds_supervisor", "is", null)
    .limit(10000)
  for (const r of (data ?? []) as { ds_vendedor: string; ds_supervisor: string }[]) {
    const k = r.ds_vendedor.trim().toUpperCase()
    if (!m.has(k)) m.set(k, r.ds_supervisor)
  }
  return m
}

/** Resta `meses` a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
function restarMeses(fechaYmd: string, meses: number): string {
  const [y, m, d] = fechaYmd.split("-").map((s) => parseInt(s, 10))
  const dt = new Date(Date.UTC(y, m - 1 - meses, d))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`
}

export async function getClusterizacion(): Promise<Result<ClusterizacionData>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }

  let ventas
  try {
    ventas = await consultarClusterClientes()
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `No se pudieron leer las ventas: ${e.message}`
          : "No se pudieron leer las ventas.",
    }
  }

  const { periodo, clientes: rows } = ventas
  // Ocultamos a los que no compraron en los últimos 45 días (drop size 0): no
  // son representativos para el análisis de servicio reciente.
  const conDrop = rows.filter((r) => r.dias_45d > 0 && r.bultos_45d > 0)
  if (conDrop.length === 0) {
    return { data: { periodo, umbral_ingresos: 0, resumen: [], clientes: [] } }
  }

  // RMD de los últimos 6 meses (muestra suficiente por cliente).
  const rmdDesde = periodo.ytd_hasta ? restarMeses(periodo.ytd_hasta, 6) : ""
  const rmdMap = rmdDesde ? await getRmdPorCliente(rmdDesde) : new Map()

  // Rechazos de los últimos 45 días [drop_desde, ytd_hasta] (foto reciente):
  // un rechazo de enero no debe condenar al cliente en junio.
  const rechazoMap =
    periodo.drop_desde && periodo.ytd_hasta
      ? await getRechazoPorCliente(periodo.drop_desde, periodo.ytd_hasta)
      : new Map<number, { culpa: number; total: number }>()

  // Supervisor por promotor (para el filtro del explorador).
  const supMap = periodo.ytd_hasta
    ? await getSupervisorPorPromotor(restarMeses(periodo.ytd_hasta, 6))
    : new Map<string, string>()

  // Umbral de facturación = mediana de la facturación YTD.
  const umbral = mediana(conDrop.map((r) => r.facturacion_ytd))

  const clientes: ClienteClusterizado[] = conDrop.map((r) => {
    const crecimiento_pct =
      r.facturacion_ytd_prev > 0
        ? (r.facturacion_ytd - r.facturacion_ytd_prev) / r.facturacion_ytd_prev
        : null // sin venta el año anterior → cliente nuevo
    const crecePositivo = crecimiento_pct === null || crecimiento_pct >= 0
    const ingresoAlto = r.facturacion_ytd >= umbral
    const drop_size = r.dias_45d > 0 ? r.bultos_45d / r.dias_45d : 0
    const rmd = rmdMap.get(r.id_cliente)
    const rmd_prom = rmd ? rmd.suma / rmd.n : null
    const rech = rechazoMap.get(r.id_cliente)
    const rechazos_culpa = rech?.culpa ?? 0
    const rechazos_total = rech?.total ?? 0
    // ESTADO: rechazó al menos una vez por su culpa.
    const estado: "pasa" | "no_pasa" = rechazos_culpa >= 1 ? "no_pasa" : "pasa"
    // SALUD: drop bajo o RMD bajo.
    const drop_bajo = drop_size < DROP_BAJO
    const rmd_bajo = rmd_prom != null && rmd_prom < RMD_BAJO
    const salud: "sano" | "atencion" = drop_bajo || rmd_bajo ? "atencion" : "sano"
    return {
      id_cliente: r.id_cliente,
      nombre: r.nombre,
      localidad: r.localidad,
      promotor: r.promotor,
      supervisor: r.promotor ? supMap.get(r.promotor.trim().toUpperCase()) ?? null : null,
      segmento: r.segmento,
      cluster: clasificar(ingresoAlto, crecePositivo),
      ingresos_actual: r.facturacion_ytd,
      ingresos_anterior: r.facturacion_ytd_prev,
      crecimiento_pct,
      bultos_actual: r.bultos_45d,
      dias_actual: r.dias_45d,
      drop_size,
      rmd_prom,
      rmd_n: rmd ? rmd.n : 0,
      rechazos_culpa,
      rechazos_total,
      estado,
      drop_bajo,
      rmd_bajo,
      salud,
    }
  })

  // Resumen por cluster.
  const facturacionTotalGlobal = clientes.reduce((s, c) => s + c.ingresos_actual, 0)
  const orden: ClusterId[] = ["ganador", "en_crecimiento", "basico", "ventas_bajas"]
  const resumen: ClusterResumen[] = orden.map((cl) => {
    const grupo = clientes.filter((c) => c.cluster === cl)
    const ingresos_total = grupo.reduce((s, c) => s + c.ingresos_actual, 0)
    const dropSizes = grupo.filter((c) => c.dias_actual > 0).map((c) => c.drop_size)
    const conRmd = grupo.filter((c) => c.rmd_prom !== null)
    const rmd_n = conRmd.reduce((s, c) => s + c.rmd_n, 0)
    const rmd_prom =
      conRmd.length > 0
        ? conRmd.reduce((s, c) => s + (c.rmd_prom as number) * c.rmd_n, 0) / (rmd_n || 1)
        : null
    return {
      cluster: cl,
      clientes: grupo.length,
      ingresos_total,
      pct_clientes: clientes.length > 0 ? grupo.length / clientes.length : 0,
      pct_ingresos:
        facturacionTotalGlobal > 0 ? ingresos_total / facturacionTotalGlobal : 0,
      drop_size_prom:
        dropSizes.length > 0
          ? dropSizes.reduce((s, v) => s + v, 0) / dropSizes.length
          : 0,
      rmd_prom,
      rmd_n,
      no_pasan: grupo.filter((c) => c.estado === "no_pasa").length,
      en_atencion: grupo.filter((c) => c.salud === "atencion").length,
      sanos: grupo.filter((c) => c.salud === "sano").length,
    }
  })

  return {
    data: { periodo, umbral_ingresos: umbral, resumen, clientes },
  }
}
