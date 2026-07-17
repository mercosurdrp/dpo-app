"use server"

import { requireAuth } from "@/lib/session"
import {
  getPptoCantidades,
  type PptoCantidades,
} from "@/actions/presupuesto-generador"

/**
 * KPI físico de las iniciativas de ahorro del depósito: cuánto se rompe/vence
 * por cada HL vendido, contra el mismo ratio presupuestado.
 *
 * Por qué no va en pesos: el KPI viejo comparaba $ del mes contra el gasto real
 * del año ANTERIOR, así que mezclaba pesos de dos años (inflación) y no ajustaba
 * por volumen — vender más = romper más, y eso se leía como gestión peor. El
 * ratio contra HL vendidos neutraliza las dos cosas.
 *
 * 🚨 Numerador y denominador salen de fuentes distintas a propósito:
 *  - lo perdido, del tablero de Esteban (es quien reporta las pérdidas y de ahí
 *    salen al EERR: verificado contra el EERR de junio 2026, abr/may/jun cuadran
 *    al peso en los dos rubros; enero difiere 10% por ajuste de cierre);
 *  - lo vendido, del EERR, porque es la ÚNICA serie de HL que tiene presupuesto.
 *    Sin ella no habría target contra el cual comparar. El tablero también
 *    publica hl_ventas, pero sin presupuesto y difiere del EERR hasta 14,5%.
 */

const PERDIDAS_URL =
  "https://deposito-esteban.vercel.app/api/shared/load?module=perdidas"
const TIMEOUT_MS = 8000

type Result<T> = { data: T } | { error: string }

/** Grupo del tablero de Esteban ← rubro del EERR. */
const GRUPO_POR_RUBRO: Record<string, string> = {
  "ROTURAS Y DERRAMES": "Roturas y Derrames",
  "PRODUCTO VENCIDO": "Vencidos",
}

/** Concepto de la hoja ALMACEN PXQ que trae la Q de cada rubro. */
const CONCEPTO_POR_RUBRO: Record<string, string> = {
  "ROTURAS Y DERRAMES": "ROTURAS Y DERRAMES",
  "PRODUCTO VENCIDO": "PRODUCTO VENCIDO",
}

interface PerdidaItem {
  grupo?: string
  bultos?: number
  unidades?: number
  un_bulto?: number
  hl?: number
}

export interface KpiPerdidasMes {
  mes: number
  /** ppm = HL perdidos por millón de HL vendidos. */
  targetPpm: number
  realPpm: number
  targetHl: number
  realHl: number
}

export interface KpiPerdidas {
  meses: KpiPerdidasMes[]
  /** Acumulado del año: no es el promedio de los meses sino la razón de sumas. */
  targetPpmAcum: number
  realPpmAcum: number
}

/**
 * Cuánto de un bulto es un HL, medido del mix REAL del mes.
 *
 * El presupuesto declara la Q en bultos y no dice cuántos HL son; el mix cambia
 * mes a mes (un bulto de roturas ≈ 0,118 HL, uno de vencidos ≈ 0,036 — envases
 * más chicos, no productos más caros). Convertir el target con el factor del
 * propio mes deja la comparación target-vs-real IDÉNTICA a la que se haría en
 * bultos: el factor se cancela de los dos lados. Así el KPI se lee en HL sin que
 * el mix se cuele como supuesto.
 */
function factorHlPorBulto(items: PerdidaItem[]): number | null {
  const bultos = items.reduce(
    (acc, x) => acc + (x.bultos ?? 0) + (x.unidades ?? 0) / (x.un_bulto || 1),
    0,
  )
  const hl = items.reduce((acc, x) => acc + (x.hl ?? 0), 0)
  if (bultos <= 0) return null
  return hl / bultos
}

async function fetchPerdidas(): Promise<Record<string, PerdidaItem[]>> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(PERDIDAS_URL, {
      signal: ctrl.signal,
      next: { revalidate: 300 },
    })
    if (!res.ok) throw new Error(`El tablero de depósito respondió ${res.status}`)
    const json = await res.json()
    const actual = (json?.data ?? json)?.data_actual
    if (!actual || typeof actual !== "object") {
      throw new Error("El tablero de depósito no devolvió data_actual")
    }
    const out: Record<string, PerdidaItem[]> = {}
    for (const [mes, val] of Object.entries(actual)) {
      const detalle = (val as { detalle?: PerdidaItem[] })?.detalle
      if (Array.isArray(detalle)) out[String(Number(mes))] = detalle
    }
    return out
  } finally {
    clearTimeout(t)
  }
}

/**
 * KPI de pérdidas por rubro. Sólo devuelve los rubros que tienen los dos lados
 * (Q presupuestada y pérdidas reportadas); el resto no entra.
 */
export async function getKpiPerdidas(
  anio: number,
): Promise<Result<Record<string, KpiPerdidas>>> {
  try {
    await requireAuth()

    const cantRes = await getPptoCantidades(anio)
    if ("error" in cantRes) return cantRes
    const ppto: PptoCantidades = cantRes.data

    const perdidas = await fetchPerdidas()

    const volPorMes = new Map(ppto.volumen.map((v) => [v.mes, v]))
    const out: Record<string, KpiPerdidas> = {}

    for (const [rubro, grupo] of Object.entries(GRUPO_POR_RUBRO)) {
      const qMeses = ppto.porConcepto[CONCEPTO_POR_RUBRO[rubro]]
      if (!qMeses) continue

      const filas: KpiPerdidasMes[] = []
      for (const { mes, bultos } of qMeses) {
        const vol = volPorMes.get(mes)
        // Sin volumen vendido el mes no cerró: el EERR todavía no lo trae.
        if (!vol || vol.hlPpto <= 0 || vol.hlReal <= 0) continue

        const items = (perdidas[String(mes)] ?? []).filter(
          (x) => x.grupo === grupo,
        )
        const factor = factorHlPorBulto(items)
        if (factor === null) continue // sin pérdidas reales no hay con qué convertir

        const realHl = items.reduce((acc, x) => acc + (x.hl ?? 0), 0)
        const targetHl = bultos * factor
        filas.push({
          mes,
          targetHl,
          realHl,
          targetPpm: (targetHl / vol.hlPpto) * 1e6,
          realPpm: (realHl / vol.hlReal) * 1e6,
        })
      }
      if (filas.length === 0) continue

      // 🚨 No marcar como sospechoso un target que se dispara: en PRODUCTO
      // VENCIDO el ppto pide 222 bultos en mayo y 329 en junio contra menos de 40
      // el resto del año, y eso es CORRECTO — mayo-junio es la temporada baja e
      // históricamente se vence mucho, así que el presupuesto lo prevé. Una
      // versión anterior lo señalaba como error de carga: era una lectura mía sin
      // el contexto del negocio.

      const sumT = filas.reduce((a, f) => a + f.targetHl, 0)
      const sumR = filas.reduce((a, f) => a + f.realHl, 0)
      const sumVp = filas.reduce(
        (a, f) => a + (volPorMes.get(f.mes)?.hlPpto ?? 0),
        0,
      )
      const sumVr = filas.reduce(
        (a, f) => a + (volPorMes.get(f.mes)?.hlReal ?? 0),
        0,
      )
      out[rubro] = {
        meses: filas,
        targetPpmAcum: sumVp > 0 ? (sumT / sumVp) * 1e6 : 0,
        realPpmAcum: sumVr > 0 ? (sumR / sumVr) * 1e6 : 0,
      }
    }

    return { data: out }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error armando el KPI de pérdidas",
    }
  }
}
