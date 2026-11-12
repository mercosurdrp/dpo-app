/**
 * Tiempo en ruta — detalle por ciudad y por camión (pestaña «Por ciudad y camión»).
 *
 * Todo sale de los retornos que ya manda `getTiempoRutaKpis()`: no hay consulta
 * nueva. La ciudad de cada retorno es la ruta dominante del camión ese día (por
 * carga), la misma que usa el filtro de Zona de la pantalla.
 */
import {
  TIEMPO_RUTA_META_MINUTOS,
  TIEMPO_RUTA_TOLERANCIA_MINUTOS,
  minutosAjustados,
  type RetornoRuta,
} from "@/lib/tiempo-ruta/meta"

export const SIN_CIUDAD = "Sin dato"

export type Periodo = "mes" | "3meses" | "anio"

export const PERIODOS: { valor: Periodo; label: string }[] = [
  { valor: "mes", label: "Último mes" },
  { valor: "3meses", label: "Últimos 3 meses" },
  { valor: "anio", label: "Año" },
]

export interface Grupo {
  clave: string
  n: number
  promedio: number
  mediana: number
  pctMeta: number
}

export interface PuntoMes {
  /** "2026-04" */
  mes: string
  promedio: number
  n: number
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

export const ciudadDe = (r: RetornoRuta) => r.ruta ?? SIN_CIUDAD
export const camionDe = (r: RetornoRuta) => (r.dominio ?? "").trim().toUpperCase() || "—"

/** "2026-04" → "Abr 26" */
export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split("-")
  return `${MESES[Number(m) - 1]} ${y.slice(2)}`
}

export function nivelTiempo(min: number): "ok" | "alerta" | "mal" {
  if (min <= TIEMPO_RUTA_META_MINUTOS) return "ok"
  if (min <= TIEMPO_RUTA_META_MINUTOS + TIEMPO_RUTA_TOLERANCIA_MINUTOS) return "alerta"
  return "mal"
}

export const COLOR_NIVEL = { ok: "#10B981", alerta: "#F59E0B", mal: "#EF4444" } as const

export function colorTiempo(min: number): string {
  return COLOR_NIVEL[nivelTiempo(min)]
}

function restarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T12:00:00")
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

/** Fecha mínima (inclusive) del período, contando desde `hoy` (YYYY-MM-DD). */
export function desdePeriodo(periodo: Periodo, hoy: string): string {
  if (periodo === "mes") return restarDias(hoy, 30)
  if (periodo === "3meses") return restarDias(hoy, 91)
  return `${hoy.slice(0, 4)}-01-01`
}

export function filtrarPeriodo(retornos: RetornoRuta[], periodo: Periodo, hoy: string): RetornoRuta[] {
  const desde = desdePeriodo(periodo, hoy)
  return retornos.filter((r) => r.fecha >= desde && r.fecha <= hoy)
}

function resumen(tiempos: number[]): Omit<Grupo, "clave"> {
  const n = tiempos.length
  if (n === 0) return { n: 0, promedio: 0, mediana: 0, pctMeta: 0 }
  const orden = [...tiempos].sort((a, b) => a - b)
  const mitad = Math.floor(n / 2)
  const mediana = n % 2 ? orden[mitad] : Math.round((orden[mitad - 1] + orden[mitad]) / 2)
  const dentro = tiempos.filter((t) => t <= TIEMPO_RUTA_META_MINUTOS).length
  return {
    n,
    promedio: Math.round(tiempos.reduce((a, b) => a + b, 0) / n),
    mediana,
    pctMeta: Math.round((dentro / n) * 100),
  }
}

export function resumenRetornos(retornos: RetornoRuta[], ajustar: boolean): Omit<Grupo, "clave"> {
  return resumen(retornos.map((r) => minutosAjustados(r, ajustar)))
}

/** Promedio, mediana y % ≤ 7 h por clave; ordenado del más largo al más corto. */
export function agruparPor(
  retornos: RetornoRuta[],
  clave: (r: RetornoRuta) => string,
  ajustar: boolean,
): Grupo[] {
  const grupos = new Map<string, number[]>()
  for (const r of retornos) {
    const k = clave(r)
    const ts = grupos.get(k) ?? []
    ts.push(minutosAjustados(r, ajustar))
    grupos.set(k, ts)
  }
  return [...grupos.entries()]
    .map(([k, ts]) => ({ clave: k, ...resumen(ts) }))
    .sort((a, b) => b.promedio - a.promedio || a.clave.localeCompare(b.clave))
}

/** Meses presentes en los retornos, ordenados ("2026-04", "2026-05", ...). */
export function mesesDe(retornos: RetornoRuta[]): string[] {
  return [...new Set(retornos.map((r) => r.fecha.slice(0, 7)))].sort()
}

/** Promedio mensual por clave: clave → mes → {promedio, n}. */
export function serieMensualPor(
  retornos: RetornoRuta[],
  clave: (r: RetornoRuta) => string,
  ajustar: boolean,
): Map<string, Map<string, PuntoMes>> {
  const acum = new Map<string, Map<string, number[]>>()
  for (const r of retornos) {
    const k = clave(r)
    const mes = r.fecha.slice(0, 7)
    const porMes = acum.get(k) ?? new Map<string, number[]>()
    const ts = porMes.get(mes) ?? []
    ts.push(minutosAjustados(r, ajustar))
    porMes.set(mes, ts)
    acum.set(k, porMes)
  }
  const out = new Map<string, Map<string, PuntoMes>>()
  for (const [k, porMes] of acum) {
    const m = new Map<string, PuntoMes>()
    for (const [mes, ts] of porMes) {
      const r = resumen(ts)
      m.set(mes, { mes, promedio: r.promedio, n: r.n })
    }
    out.set(k, m)
  }
  return out
}

/** Promedio por día de la semana (lunes a sábado; el domingo solo si hubo retornos). */
export function porDiaSemana(retornos: RetornoRuta[], ajustar: boolean) {
  const acum = new Map<number, number[]>()
  for (const r of retornos) {
    const dia = new Date(r.fecha + "T12:00:00").getDay()
    const ts = acum.get(dia) ?? []
    ts.push(minutosAjustados(r, ajustar))
    acum.set(dia, ts)
  }
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => d !== 0 || acum.has(0))
    .map((d) => ({ dia: DIAS[d], ...resumen(acum.get(d) ?? []) }))
}

/** Ciudad donde más veces repartió cada camión (para la ficha). */
export function ciudadFrecuente(retornos: RetornoRuta[]): string | null {
  const g = agruparPor(retornos, ciudadDe, false).sort((a, b) => b.n - a.n)
  return g[0]?.clave ?? null
}
