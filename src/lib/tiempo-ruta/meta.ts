/**
 * Tiempo en ruta (puerta a puerta, checklist de retorno) — DPO Entrega 1.2.
 * Meta oficial: 7 h (SOP 1.2 Rev H2). Antes la pantalla usaba 8 h y el SOP 7 h,
 * y el auditor veía dos metas distintas para el mismo indicador.
 *
 * Ojo: NO es "Horas en la calle (Foxtrot)" de la Matinal de Distribución. Ese
 * mide el camión en la calle con "más es mejor" (meta/gatillo en la config de
 * la reunión) y es otra lectura del tiempo.
 */
import type { TiempoRutaSemanal, TiempoRutaMensual } from "@/types/database"

export const TIEMPO_RUTA_META_MINUTOS = 420
/** Hasta acá es "amarillo" en la pantalla; por encima, rojo. */
export const TIEMPO_RUTA_TOLERANCIA_MINUTOS = 60

/**
 * Criterio ÚNICO (definido por Fausto el 09/11): un mes está en meta si el
 * PROMEDIO del tiempo en ruta es ≤ 7 h. El % de retornos ≤ 7 h se muestra como
 * dato informativo, sin umbral propio (con 65 % ningún mes de 2026 llegaba).
 */
export function tiempoRutaMesFueraDeMeta(promedioMinutos: number): boolean {
  return promedioMinutos > TIEMPO_RUTA_META_MINUTOS
}

/**
 * Traslado de ida y vuelta a las zonas lejanas (definido por Fausto el 09/11):
 * el camión que reparte en Pergamino viaja ~2 h por día más y el de Colón ~4 h.
 * Ese viaje no es tiempo de reparto, así que el tiempo "ajustado" lo descuenta.
 * Las claves son los nombres de `rutas_reparto`.
 */
export const AJUSTE_TRASLADO_MINUTOS: Record<string, number> = {
  Pergamino: 120,
  "Colón": 240,
}

export interface RetornoRuta {
  fecha: string
  /** Ruta dominante del camión ese día (por carga); null = sin dato de localidades. */
  ruta: string | null
  /** Tiempo real puerta a puerta. */
  minutos: number
}

/** "todas" | "sin_lejanas" (sin Pergamino ni Colón) | "sin_dato" | nombre de una ruta. */
export type FiltroZona = string

export interface TiempoRutaVista {
  totalRetornos: number
  promedioMinutos: number
  /** Promedio sin descontar traslados, sobre los mismos retornos (para mostrar al lado). */
  promedioRealMinutos: number
  promedioHoras: string
  dentroMeta: number
  pctDentroMeta: number
  metaMinutos: number
  semanal: TiempoRutaSemanal[]
  mensual: TiempoRutaMensual[]
}

export function minutosAjustados(r: RetornoRuta, ajustar: boolean): number {
  if (!ajustar || !r.ruta) return r.minutos
  return Math.max(0, r.minutos - (AJUSTE_TRASLADO_MINUTOS[r.ruta] ?? 0))
}

export function filtrarPorZona(retornos: RetornoRuta[], zona: FiltroZona): RetornoRuta[] {
  if (zona === "todas") return retornos
  if (zona === "sin_lejanas") return retornos.filter((r) => !r.ruta || !(r.ruta in AJUSTE_TRASLADO_MINUTOS))
  if (zona === "sin_dato") return retornos.filter((r) => !r.ruta)
  return retornos.filter((r) => r.ruta === zona)
}

function hhmm(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`
}

/** Agrega los retornos (ya filtrados) en total, semana y mes. */
export function calcularTiempoRuta(retornos: RetornoRuta[], ajustar: boolean): TiempoRutaVista {
  const meta = TIEMPO_RUTA_META_MINUTOS
  const vacio: TiempoRutaVista = {
    totalRetornos: 0, promedioMinutos: 0, promedioRealMinutos: 0, promedioHoras: "0:00",
    dentroMeta: 0, pctDentroMeta: 0, metaMinutos: meta, semanal: [], mensual: [],
  }
  if (retornos.length === 0) return vacio

  const prom = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
  const tiempos = retornos.map((r) => minutosAjustados(r, ajustar))
  const promedioMinutos = prom(tiempos)
  const dentroMeta = tiempos.filter((t) => t <= meta).length

  const semanalMap = new Map<string, { tiempos: number[]; year: number; semana: number }>()
  const mensualMap = new Map<string, { tiempos: number[]; year: number; mes: number }>()
  for (const r of retornos) {
    const t = minutosAjustados(r, ajustar)
    const date = new Date(r.fecha + "T12:00:00")
    const year = date.getFullYear()
    const startOfYear = new Date(year, 0, 1)
    const semana = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)
    const ks = `${year}-${semana}`
    if (!semanalMap.has(ks)) semanalMap.set(ks, { tiempos: [], year, semana })
    semanalMap.get(ks)!.tiempos.push(t)
    const mes = date.getMonth() + 1
    const km = `${year}-${mes}`
    if (!mensualMap.has(km)) mensualMap.set(km, { tiempos: [], year, mes })
    mensualMap.get(km)!.tiempos.push(t)
  }
  const resumen = (ts: number[]) => {
    const dm = ts.filter((t) => t <= meta).length
    return {
      promedio_minutos: prom(ts),
      total_retornos: ts.length,
      dentro_meta: dm,
      pct_dentro_meta: Math.round((dm / ts.length) * 100),
    }
  }
  const semanal: TiempoRutaSemanal[] = [...semanalMap.values()]
    .sort((a, b) => a.year - b.year || a.semana - b.semana)
    .map((g) => ({ semana: g.semana, year: g.year, ...resumen(g.tiempos) }))
  const mensual: TiempoRutaMensual[] = [...mensualMap.values()]
    .sort((a, b) => a.year - b.year || a.mes - b.mes)
    .map((g) => ({ mes: g.mes, year: g.year, ...resumen(g.tiempos) }))

  return {
    totalRetornos: tiempos.length,
    promedioMinutos,
    promedioRealMinutos: prom(retornos.map((r) => r.minutos)),
    promedioHoras: hhmm(promedioMinutos),
    dentroMeta,
    pctDentroMeta: Math.round((dentroMeta / tiempos.length) * 100),
    metaMinutos: meta,
    semanal,
    mensual,
  }
}
