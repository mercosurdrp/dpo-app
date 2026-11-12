// Análisis del Tiempo Interno (TI) sobre los registros que ya devuelve
// getTiKpis(): día de semana × chofer, hora de llegada, simultaneidad de
// llegadas y detección de desvíos semanales por chofer.
//
// Archivo puro (sin "use server"): lo usan los componentes cliente y el smoke
// de verificación, y puede exportar constantes.

import type { TiRegistro } from "@/types/database"
import { claveSemana, rangoDeSemana, semanaDelAnio } from "@/lib/tiempo-interno"

export const TI_META = 30
/** Un día "malo" para la regla de reincidencia. */
export const TI_REINCIDENCIA_MINUTOS = 45
/** Días malos en la misma semana para disparar la reincidencia. */
export const TI_REINCIDENCIA_DIAS = 3
/** Retornos mínimos en la semana para juzgar el promedio del chofer. */
export const TI_MIN_RETORNOS_SEMANA = 2
/** Ventana para contar "quién llegó antes que vos" (cola para rendir). */
export const TI_VENTANA_COLA_MIN = 30

const AR_OFFSET_MS = 3 * 3600 * 1000

export const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const

export type TiRegistroValido = TiRegistro & { ti_minutos: number }

export function registrosValidos(registros: TiRegistro[]): TiRegistroValido[] {
  return registros.filter(
    (r): r is TiRegistroValido => r.motivo_sin_dato === null && r.ti_minutos != null,
  )
}

export function normChofer(s: string): string {
  return (s || "").trim().toUpperCase().replace(/\s+/g, " ")
}

/** Instante (ms UTC) del inicio del TI, según la fuente que usó el cálculo. */
export function inicioMs(r: TiRegistro): number {
  if (r.fuente_inicio === "gps" && r.hora_llegada_gps) return new Date(r.hora_llegada_gps).getTime()
  if (r.fuente_inicio === "foxtrot_fin" && r.hora_fin_foxtrot) return new Date(r.hora_fin_foxtrot).getTime()
  return new Date(r.hora_retorno).getTime()
}

/** Minutos desde la medianoche en hora ARG. */
function minutosArg(ms: number): number {
  const d = new Date(ms - AR_OFFSET_MS)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

function diaSemana(fecha: string): number {
  return new Date(fecha + "T12:00:00Z").getUTCDay()
}

export interface Celda {
  promedio: number
  n: number
  pctMeta: number
}

function celda(tis: number[]): Celda | null {
  if (tis.length === 0) return null
  const dentro = tis.filter((t) => t <= TI_META).length
  return {
    promedio: Math.round(tis.reduce((a, b) => a + b, 0) / tis.length),
    n: tis.length,
    pctMeta: Math.round((dentro / tis.length) * 100),
  }
}

export interface MatrizDiaSemana {
  /** Índices de DIAS_SEMANA presentes en los datos, de lunes a domingo. */
  dias: number[]
  filas: { chofer: string; celdas: (Celda | null)[]; total: Celda }[]
  totalPorDia: (Celda | null)[]
  total: Celda | null
}

/** Promedio de TI de cada chofer por día de la semana. */
export function matrizDiaSemana(registros: TiRegistroValido[]): MatrizDiaSemana {
  const orden = [1, 2, 3, 4, 5, 6, 0]
  const presentes = new Set(registros.map((r) => diaSemana(r.fecha)))
  const dias = orden.filter((d) => presentes.has(d))
  const porChofer = new Map<string, Map<number, number[]>>()
  const porDia = new Map<number, number[]>()
  for (const r of registros) {
    const ch = normChofer(r.chofer)
    const d = diaSemana(r.fecha)
    if (!porChofer.has(ch)) porChofer.set(ch, new Map())
    const m = porChofer.get(ch)!
    if (!m.has(d)) m.set(d, [])
    m.get(d)!.push(r.ti_minutos)
    if (!porDia.has(d)) porDia.set(d, [])
    porDia.get(d)!.push(r.ti_minutos)
  }
  const filas = [...porChofer.entries()]
    .map(([chofer, m]) => ({
      chofer,
      celdas: dias.map((d) => celda(m.get(d) ?? [])),
      total: celda([...m.values()].flat())!,
    }))
    .sort((a, b) => b.total.promedio - a.total.promedio)
  return {
    dias,
    filas,
    totalPorDia: dias.map((d) => celda(porDia.get(d) ?? [])),
    total: celda(registros.map((r) => r.ti_minutos)),
  }
}

export interface FranjaLlegada {
  /** "13:30" — inicio de la franja, hora ARG. */
  franja: string
  minutoInicio: number
  n: number
  promedio: number
  pctMeta: number
}

/** TI según la hora en que el chofer llegó al CD, en franjas de `ancho` minutos. */
export function porFranjaLlegada(registros: TiRegistroValido[], ancho = 30): FranjaLlegada[] {
  const map = new Map<number, number[]>()
  for (const r of registros) {
    const ini = Math.floor(minutosArg(inicioMs(r)) / ancho) * ancho
    if (!map.has(ini)) map.set(ini, [])
    map.get(ini)!.push(r.ti_minutos)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ini, tis]) => {
      const c = celda(tis)!
      const hh = String(Math.floor(ini / 60)).padStart(2, "0")
      const mm = String(ini % 60).padStart(2, "0")
      return { franja: `${hh}:${mm}`, minutoInicio: ini, n: c.n, promedio: c.promedio, pctMeta: c.pctMeta }
    })
}

export interface GrupoCola {
  /** 0, 1 o 2 (= "2 o más") choferes que llegaron en la ventana previa. */
  antes: 0 | 1 | 2
  n: number
  promedio: number
  pctMeta: number
}

/**
 * ¿Rendir tarda más cuando otros llegaron justo antes? Para cada retorno cuenta
 * cuántos choferes del mismo día llegaron en los `ventana` minutos previos y
 * agrupa el TI en 0 / 1 / 2 o más.
 */
export function efectoCola(
  registros: TiRegistroValido[],
  /** Si se pasa, la cola se cuenta con todos pero se promedian sólo estos retornos. */
  soloDe?: Set<TiRegistroValido>,
  ventana = TI_VENTANA_COLA_MIN,
): GrupoCola[] {
  const porFecha = new Map<string, number[]>()
  for (const r of registros) {
    if (!porFecha.has(r.fecha)) porFecha.set(r.fecha, [])
    porFecha.get(r.fecha)!.push(inicioMs(r))
  }
  const grupos: Record<0 | 1 | 2, number[]> = { 0: [], 1: [], 2: [] }
  for (const r of registros) {
    if (soloDe && !soloDe.has(r)) continue
    const mio = inicioMs(r)
    const desde = mio - ventana * 60000
    // Se resta uno: el propio retorno siempre cae en su ventana.
    const antes = (porFecha.get(r.fecha) ?? []).filter((t) => t >= desde && t <= mio).length - 1
    grupos[Math.min(Math.max(antes, 0), 2) as 0 | 1 | 2].push(r.ti_minutos)
  }
  return ([0, 1, 2] as const)
    .map((k) => {
      const c = celda(grupos[k])
      return c ? { antes: k, n: c.n, promedio: c.promedio, pctMeta: c.pctMeta } : null
    })
    .filter((g): g is GrupoCola => g !== null)
}

export type ReglaDesvio = "semana_sobre_meta" | "reincidencia"

export interface DesvioTi {
  /** Se guarda en planes_accion.notas para vincular el plan con el desvío. */
  clave: string
  /** Regla principal (la que va en la clave): reincidencia si se cumple, si no semana_sobre_meta. */
  regla: ReglaDesvio
  /** Todas las reglas que dispara el chofer en la semana (una fila y un plan por chofer/semana). */
  reglas: ReglaDesvio[]
  chofer: string
  /** "2026-45" (misma numeración que el filtro y la serie semanal). */
  semana: string
  semanaNum: number
  year: number
  rango: string
  /** Promedio de la semana (min). */
  promedio: number
  retornos: number
  /** Días con TI > TI_REINCIDENCIA_MINUTOS. */
  diasMalos: number
  /** Fecha más reciente de la semana (para ordenar). */
  ultimaFecha: string
}

export function claveDesvio(regla: ReglaDesvio, chofer: string, semana: string): string {
  return `ti_desvio=${regla}|${normChofer(chofer)}|${semana}`
}

export function parseClaveDesvio(
  notas: string | null | undefined,
): { regla: ReglaDesvio; chofer: string; semana: string; clave: string } | null {
  const m = (notas ?? "").match(/ti_desvio=(semana_sobre_meta|reincidencia)\|([^|\n]+)\|(\d{4}-\d{1,2})/)
  if (!m) return null
  return { regla: m[1] as ReglaDesvio, chofer: m[2], semana: m[3], clave: m[0] }
}

/**
 * Desvíos por chofer y semana:
 *  - semana_sobre_meta: promedio semanal > meta con al menos TI_MIN_RETORNOS_SEMANA retornos.
 *  - reincidencia: TI_REINCIDENCIA_DIAS o más días con TI > TI_REINCIDENCIA_MINUTOS.
 * Si el chofer dispara las dos reglas en la misma semana sale UNA fila (y un
 * solo plan) con las dos marcadas.
 */
export function detectarDesvios(registros: TiRegistroValido[]): DesvioTi[] {
  const grupos = new Map<string, TiRegistroValido[]>()
  for (const r of registros) {
    const k = `${claveSemana(r.fecha)}|${normChofer(r.chofer)}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(r)
  }
  const out: DesvioTi[] = []
  for (const [k, regs] of grupos) {
    const [semana, chofer] = k.split("|")
    const { year, semana: semanaNum } = semanaDelAnio(regs[0].fecha)
    const tis = regs.map((r) => r.ti_minutos)
    const promedio = Math.round(tis.reduce((a, b) => a + b, 0) / tis.length)
    const fechas = regs.map((r) => r.fecha)
    const diasMalos = new Set(regs.filter((r) => r.ti_minutos > TI_REINCIDENCIA_MINUTOS).map((r) => r.fecha)).size
    const base = {
      chofer,
      semana,
      semanaNum,
      year,
      rango: rangoDeSemana(fechas),
      promedio,
      retornos: regs.length,
      diasMalos,
      ultimaFecha: [...fechas].sort().at(-1)!,
    }
    const reglas: ReglaDesvio[] = []
    if (diasMalos >= TI_REINCIDENCIA_DIAS) reglas.push("reincidencia")
    if (regs.length >= TI_MIN_RETORNOS_SEMANA && promedio > TI_META) reglas.push("semana_sobre_meta")
    if (reglas.length === 0) continue
    out.push({ ...base, regla: reglas[0], reglas, clave: claveDesvio(reglas[0], chofer, semana) })
  }
  return out.sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha) || b.promedio - a.promedio)
}

export interface EfectoPlan {
  antes: Celda | null
  despues: Celda | null
  /** "mejoro" si bajó ≥ 3 min, "empeoro" si subió ≥ 3 min. */
  veredicto: "mejoro" | "igual" | "empeoro" | "sin_datos"
}

/** TI del chofer en los `dias` previos a la creación del plan vs. los posteriores. */
export function efectoPlan(
  registros: TiRegistroValido[],
  chofer: string,
  creadoIso: string,
  dias = 28,
): EfectoPlan {
  const corte = creadoIso.slice(0, 10)
  const desde = new Date(new Date(corte + "T12:00:00Z").getTime() - dias * 86400000).toISOString().slice(0, 10)
  const hasta = new Date(new Date(corte + "T12:00:00Z").getTime() + dias * 86400000).toISOString().slice(0, 10)
  const ch = normChofer(chofer)
  const mios = registros.filter((r) => normChofer(r.chofer) === ch)
  const antes = celda(mios.filter((r) => r.fecha >= desde && r.fecha < corte).map((r) => r.ti_minutos))
  const despues = celda(mios.filter((r) => r.fecha > corte && r.fecha <= hasta).map((r) => r.ti_minutos))
  let veredicto: EfectoPlan["veredicto"] = "sin_datos"
  if (antes && despues) {
    const d = despues.promedio - antes.promedio
    veredicto = d <= -3 ? "mejoro" : d >= 3 ? "empeoro" : "igual"
  }
  return { antes, despues, veredicto }
}
