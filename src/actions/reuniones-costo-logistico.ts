"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getBolsaDeposito,
  getCostoPorPdv,
  getCostosMensuales,
  getKmCiudades,
  type CostoPorPdvRow,
} from "@/actions/costo-pdv"

/**
 * Costo logístico del mes para la Reunión de Presupuesto (1er encuentro):
 * $/HL del mes cerrado y cómo pesa cada ciudad. Es la misma fuente que
 * Planeamiento → Costo por PDV (tabla costo_logistico_mensual + RPC
 * get_costo_por_pdv_json + bolsa de depósito), resumida por ciudad en el
 * server para que la reunión no cargue los ~PDV uno por uno.
 *
 * 🚨 El $/HL del mes se calcula como pool ÷ HL VENDIDOS (PDV + bolsa de
 * depósito), que es el VLC/HL del Árbol del Sueño. Dividir sólo por los HL
 * distribuidos daría un número más alto y distinto del que mira el Sueño.
 */

export interface CostoCiudadReunion {
  ciudad: string
  /** Km de ruta desde el CD; null si la ciudad no tiene distancia cargada. */
  km: number | null
  pdv: number
  hl: number
  venta: number
  costo: number
  /** Participación de la ciudad sobre el costo total del mes (0-100). */
  pctCosto: number
  /** Participación sobre los HL distribuidos del mes (0-100). */
  pctHl: number
  costoXHl: number
  /** Costo / venta neta (0-100). */
  pctVenta: number
  /** $/HL de la misma ciudad el mes anterior; null si no hay dato. */
  costoXHlAnterior: number | null
}

export interface CostoLogisticoReunionData {
  anio: number
  mes: number
  /** null si el mes no tiene costo cargado en costo_logistico_mensual. */
  pool: { distribucion: number; almacen: number; total: number } | null
  hlVendidos: number
  hlDistribuidos: number
  ventaNeta: number
  /** pool ÷ HL vendidos. null sin costo o sin HL. */
  costoXHl: number | null
  /** Costo ÷ venta neta (0-100). */
  pctVenta: number | null
  /** Mes anterior al cierre, para ver la tendencia. */
  anterior: { anio: number; mes: number; costoXHl: number | null }
  /** VLC/HL YTD del Árbol del Sueño (sueno_kpi_valores, kpi vlc_hl). */
  ytd: { valor: number | null; meta: number | null; gatillo: number | null }
  ciudades: CostoCiudadReunion[]
  /** Venta que se retira por depósito: consume almacén, no camión. */
  bolsa: { hl: number; costo: number; costoXHl: number } | null
}

function mesPrevio(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
}

function agruparPorCiudad(filas: CostoPorPdvRow[]) {
  const m = new Map<
    string,
    { pdv: number; hl: number; venta: number; costo: number }
  >()
  for (const f of filas) {
    const acc = m.get(f.ciudad) ?? { pdv: 0, hl: 0, venta: 0, costo: 0 }
    acc.pdv++
    acc.hl += f.hl
    acc.venta += f.venta_neta
    acc.costo += f.costo_total
    m.set(f.ciudad, acc)
  }
  return m
}

export async function getCostoLogisticoReunion(
  anio: number,
  mes: number,
): Promise<{ data: CostoLogisticoReunionData } | { error: string }> {
  try {
    await requireAuth()
    const prev = mesPrevio(anio, mes)
    const supabase = await createClient()

    const [costos, filasRes, bolsa, km, filasPrevRes, ytdRes] =
      await Promise.all([
        getCostosMensuales(),
        getCostoPorPdv(anio, mes),
        getBolsaDeposito(anio, mes),
        getKmCiudades(),
        getCostoPorPdv(prev.anio, prev.mes),
        supabase
          .from("sueno_kpi_valores")
          .select("valor_ytd, meta, gatillo")
          .eq("anio", anio)
          .eq("kpi_key", "vlc_hl")
          .maybeSingle(),
      ])

    if ("error" in filasRes) return { error: filasRes.error }
    const filas = filasRes.data
    const filasPrev = "data" in filasPrevRes ? filasPrevRes.data : []

    const costoMes = costos.find((c) => c.anio === anio && c.mes === mes) ?? null
    const costoPrev =
      costos.find((c) => c.anio === prev.anio && c.mes === prev.mes) ?? null

    const pool = costoMes
      ? {
          distribucion: costoMes.distribucion,
          almacen: costoMes.almacen,
          total: costoMes.distribucion + costoMes.almacen,
        }
      : null

    const hlDistribuidos = filas.reduce((s, f) => s + f.hl, 0)
    const ventaNeta = filas.reduce((s, f) => s + f.venta_neta, 0)
    const costoPdv = filas.reduce((s, f) => s + f.costo_total, 0)
    const hlVendidos = hlDistribuidos + (bolsa?.hl ?? 0)
    // Si no hay fila de costo mensual, la RPC devuelve costos en cero: no hay
    // $/HL que mostrar aunque haya venta.
    const costoXHl =
      pool && hlVendidos > 0 ? pool.total / hlVendidos : null

    const hlPrev = filasPrev.reduce((s, f) => s + f.hl, 0)
    let costoXHlPrev: number | null = null
    if (costoPrev && hlPrev > 0) {
      const bolsaPrev = await getBolsaDeposito(prev.anio, prev.mes)
      const hlVendPrev = hlPrev + (bolsaPrev?.hl ?? 0)
      costoXHlPrev =
        hlVendPrev > 0
          ? (costoPrev.distribucion + costoPrev.almacen) / hlVendPrev
          : null
    }

    const kmPorCiudad = new Map(km.map((k) => [k.ciudad, k.km]))
    const prevPorCiudad = agruparPorCiudad(filasPrev)
    const ciudades: CostoCiudadReunion[] = [...agruparPorCiudad(filas).entries()]
      .map(([ciudad, d]) => {
        const p = costoPrev ? prevPorCiudad.get(ciudad) : undefined
        return {
          ciudad,
          km: kmPorCiudad.get(ciudad) ?? null,
          pdv: d.pdv,
          hl: d.hl,
          venta: d.venta,
          costo: d.costo,
          pctCosto: costoPdv > 0 ? (100 * d.costo) / costoPdv : 0,
          pctHl: hlDistribuidos > 0 ? (100 * d.hl) / hlDistribuidos : 0,
          costoXHl: d.hl > 0 ? d.costo / d.hl : 0,
          pctVenta: d.venta > 0 ? (100 * d.costo) / d.venta : 0,
          costoXHlAnterior: p && p.hl > 0 ? p.costo / p.hl : null,
        }
      })
      .sort((a, b) => b.costo - a.costo)

    const ytdRow = ytdRes.data as {
      valor_ytd: number | null
      meta: number | null
      gatillo: number | null
    } | null

    return {
      data: {
        anio,
        mes,
        pool,
        hlVendidos,
        hlDistribuidos,
        ventaNeta,
        costoXHl,
        pctVenta: pool && ventaNeta > 0 ? (100 * pool.total) / ventaNeta : null,
        anterior: { anio: prev.anio, mes: prev.mes, costoXHl: costoXHlPrev },
        ytd: {
          valor: ytdRow?.valor_ytd != null ? Number(ytdRow.valor_ytd) : null,
          meta: ytdRow?.meta != null ? Number(ytdRow.meta) : null,
          gatillo: ytdRow?.gatillo != null ? Number(ytdRow.gatillo) : null,
        },
        ciudades,
        bolsa:
          bolsa && bolsa.hl > 0
            ? {
                hl: bolsa.hl,
                costo: bolsa.costo_almacen,
                costoXHl: bolsa.costo_x_hl,
              }
            : null,
      },
    }
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : "Error al calcular el costo logístico",
    }
  }
}
