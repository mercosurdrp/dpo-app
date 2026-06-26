"use server"

import { consultarVentasPorCliente } from "@/lib/mercosur-dashboard"
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

// Estado de salud de servicio (superpuesto al cluster económico):
// "no pasa" si rechaza reiteradamente; "atención" si es caro/flojo de servir.
const RECHAZO_EVENTOS_NO_PASA = 2 // entregas rechazadas en la ventana
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
 * Trae las calificaciones RMD por cliente desde la base de dpo-app y devuelve
 * el promedio y la cantidad por cod_cliente en la ventana indicada.
 */
async function getRmdPorCliente(
  desde: string,
): Promise<Map<number, { suma: number; n: number }>> {
  const supabase = await createClient()
  const acc = new Map<number, { suma: number; n: number }>()
  const PAGE = 1000
  let from = 0
  // PostgREST trunca a 1000 filas; paginar hasta agotar.
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
 * Bultos rechazados por cliente en la ventana [desde, hasta] (tabla `rechazos`,
 * id_cliente Chess). Sirve para el % de rechazo y el flag "no pasa".
 */
async function getRechazoPorCliente(
  desde: string,
  hasta: string,
): Promise<Map<number, { bultos: number; eventos: number }>> {
  const supabase = await createClient()
  const acc = new Map<number, { bultos: number; eventos: number }>()
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("rechazos")
      .select("id_cliente, bultos_rechazados")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .range(from, from + PAGE - 1)
    if (error) break // rechazo es opcional: si falla, seguimos sin él
    if (!data || data.length === 0) break
    for (const r of data as { id_cliente: number; bultos_rechazados: number | null }[]) {
      const prev = acc.get(r.id_cliente) ?? { bultos: 0, eventos: 0 }
      prev.bultos += Number(r.bultos_rechazados ?? 0)
      prev.eventos += 1 // cada fila = una entrega rechazada
      acc.set(r.id_cliente, prev)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return acc
}

/** Resta `meses` a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
function restarMeses(fechaYmd: string, meses: number): string {
  const [y, m, d] = fechaYmd.split("-").map((s) => parseInt(s, 10))
  const dt = new Date(Date.UTC(y, m - 1 - meses, d))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`
}

export async function getClusterizacion(
  diasPeriodo = 90,
): Promise<Result<ClusterizacionData>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }

  let ventas
  try {
    ventas = await consultarVentasPorCliente(diasPeriodo)
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `No se pudieron leer las ventas: ${e.message}`
          : "No se pudieron leer las ventas.",
    }
  }

  const { periodo, clientes: rows } = ventas
  if (rows.length === 0) {
    return {
      data: {
        periodo,
        umbral_ingresos: 0,
        resumen: [],
        clientes: [],
      },
    }
  }

  // RMD de los últimos 6 meses (ventana más amplia que las ventas para tener
  // muestra suficiente por cliente).
  const rmdDesde = periodo.actual_hasta
    ? restarMeses(periodo.actual_hasta, 6)
    : ""
  const rmdMap = rmdDesde ? await getRmdPorCliente(rmdDesde) : new Map()

  // Rechazos en la MISMA ventana de ventas (para el % de rechazo y el "no pasa").
  const rechazoMap =
    periodo.actual_desde && periodo.actual_hasta
      ? await getRechazoPorCliente(periodo.actual_desde, periodo.actual_hasta)
      : new Map<number, { bultos: number; eventos: number }>()

  // Umbral de ingresos = mediana de los ingresos del período actual.
  const umbral = mediana(rows.map((r) => r.ingresos_actual))

  const clientes: ClienteClusterizado[] = rows.map((r) => {
    const crecimiento_pct =
      r.ingresos_anterior > 0
        ? (r.ingresos_actual - r.ingresos_anterior) / r.ingresos_anterior
        : null // sin venta previa → cliente nuevo
    // Nuevo (sin venta previa) o crecimiento >= 0 cuenta como "crece".
    const crecePositivo = crecimiento_pct === null || crecimiento_pct >= 0
    const ingresoAlto = r.ingresos_actual >= umbral
    const drop_size = r.dias_actual > 0 ? r.bultos_actual / r.dias_actual : 0
    const rmd = rmdMap.get(r.id_cliente)
    const rmd_prom = rmd ? rmd.suma / rmd.n : null
    const rech = rechazoMap.get(r.id_cliente)
    const rechazos_bultos = rech?.bultos ?? 0
    const rechazos_eventos = rech?.eventos ?? 0
    const baseRech = r.bultos_actual + rechazos_bultos
    const rechazo_pct = baseRech > 0 ? (100 * rechazos_bultos) / baseRech : 0
    // Estado de salud: rechazo reiterado manda; si no, drop/RMD bajo = atención.
    const drop_bajo = r.dias_actual > 0 && drop_size < DROP_BAJO
    const rmd_bajo = rmd_prom != null && rmd_prom < RMD_BAJO
    const estado: "no_pasa" | "atencion" | "sano" =
      rechazos_eventos >= RECHAZO_EVENTOS_NO_PASA
        ? "no_pasa"
        : drop_bajo || rmd_bajo
          ? "atencion"
          : "sano"
    return {
      id_cliente: r.id_cliente,
      nombre: r.nombre,
      localidad: r.localidad,
      promotor: r.promotor,
      segmento: r.segmento,
      cluster: clasificar(ingresoAlto, crecePositivo),
      ingresos_actual: r.ingresos_actual,
      ingresos_anterior: r.ingresos_anterior,
      crecimiento_pct,
      bultos_actual: r.bultos_actual,
      dias_actual: r.dias_actual,
      drop_size,
      rmd_prom,
      rmd_n: rmd ? rmd.n : 0,
      rechazos_bultos,
      rechazos_eventos,
      rechazo_pct,
      drop_bajo,
      rmd_bajo,
      estado,
    }
  })

  // Resumen por cluster.
  const ingresosTotalGlobal = clientes.reduce(
    (s, c) => s + c.ingresos_actual,
    0,
  )
  const orden: ClusterId[] = [
    "ganador",
    "en_crecimiento",
    "basico",
    "ventas_bajas",
  ]
  const resumen: ClusterResumen[] = orden.map((cl) => {
    const grupo = clientes.filter((c) => c.cluster === cl)
    const ingresos_total = grupo.reduce((s, c) => s + c.ingresos_actual, 0)
    const dropSizes = grupo.filter((c) => c.dias_actual > 0).map((c) => c.drop_size)
    const conRmd = grupo.filter((c) => c.rmd_prom !== null)
    const rmd_n = conRmd.reduce((s, c) => s + c.rmd_n, 0)
    const rmd_prom =
      conRmd.length > 0
        ? conRmd.reduce((s, c) => s + (c.rmd_prom as number) * c.rmd_n, 0) /
          (rmd_n || 1)
        : null
    return {
      cluster: cl,
      clientes: grupo.length,
      ingresos_total,
      pct_clientes: clientes.length > 0 ? grupo.length / clientes.length : 0,
      pct_ingresos:
        ingresosTotalGlobal > 0 ? ingresos_total / ingresosTotalGlobal : 0,
      drop_size_prom:
        dropSizes.length > 0
          ? dropSizes.reduce((s, v) => s + v, 0) / dropSizes.length
          : 0,
      rmd_prom,
      rmd_n,
      no_pasan: grupo.filter((c) => c.estado === "no_pasa").length,
      en_atencion: grupo.filter((c) => c.estado === "atencion").length,
      sanos: grupo.filter((c) => c.estado === "sano").length,
    }
  })

  return {
    data: {
      periodo,
      umbral_ingresos: umbral,
      resumen,
      clientes,
    },
  }
}
