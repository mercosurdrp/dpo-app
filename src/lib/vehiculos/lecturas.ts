import { createClient } from "@/lib/supabase/server"

// Helpers compartidos para reconstruir la actividad de la flota a partir de
// las 3 fuentes de odómetro: registros_vehiculos, checklist_vehiculos y
// registro_combustible. Extraído de src/actions/vehiculos-analytics.ts para
// poder reusarse desde otras actions (este archivo NO es "use server").

export type Fuente = "registros" | "checklist" | "combustible"

export interface Lectura {
  dominio: string
  fecha: string
  hora: string
  odometro: number
  fuente: Fuente
  tipo?: string | null
  chofer?: string | null
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(fecha: string, days: number): string {
  const d = new Date(fecha + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function addMonths(fecha: string, months: number): string {
  const d = new Date(fecha + "T12:00:00")
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export function startOfMonth(fecha: string): string {
  return fecha.slice(0, 7) + "-01"
}

export function startOfYear(fecha: string): string {
  return fecha.slice(0, 4) + "-01-01"
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T12:00:00").getTime()
  const db = new Date(b + "T12:00:00").getTime()
  return Math.round((db - da) / 86400000)
}

export function normalizeHora(hora: string | null | undefined): string {
  if (!hora) return "00:00:00"
  // checklist hora is TIMESTAMPTZ; registros hora is TIME HH:MM:SS
  if (hora.includes("T") || hora.includes(" ")) {
    const d = new Date(hora)
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(11, 19)
    }
  }
  return hora.length >= 8 ? hora.slice(0, 8) : (hora + ":00").slice(0, 8)
}

export function toFecha(fecha: string | null | undefined, hora: string | null | undefined): string {
  if (fecha) return fecha
  if (hora && (hora.includes("T") || hora.includes(" "))) {
    const d = new Date(hora)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return today()
}

export async function fetchLecturas(filters?: {
  dominio?: string
  fechaDesde?: string
  fechaHasta?: string
}): Promise<Lectura[]> {
  const supabase = await createClient()

  // PostgREST topea cada request en 1000 filas. Sin paginar se pierden
  // SILENCIOSAMENTE las lecturas más nuevas (p. ej. los checks recientes de los
  // autoelevadores), dejando el "último registro" y la proyección de service
  // congelados. Paginamos por `fecha` ascendente hasta agotar la tabla.
  const PAGE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aplicarFiltros = (q: any) => {
    if (filters?.dominio) q = q.eq("dominio", filters.dominio)
    if (filters?.fechaDesde) q = q.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) q = q.lte("fecha", filters.fechaHasta)
    return q
  }
  async function fetchTodo<T>(
    tabla: string,
    columnas: string
  ): Promise<T[]> {
    const out: T[] = []
    for (let desde = 0; ; desde += PAGE) {
      const { data, error } = await aplicarFiltros(
        supabase.from(tabla).select(columnas).not("odometro", "is", null)
      )
        .order("fecha", { ascending: true })
        .range(desde, desde + PAGE - 1)
      if (error) throw new Error(error.message)
      const filas = (data || []) as T[]
      out.push(...filas)
      if (filas.length < PAGE) break
    }
    return out
  }

  const [reg, chk, com] = await Promise.all([
    fetchTodo<{
      dominio: string
      fecha: string
      hora: string
      odometro: number | null
      tipo: string | null
      chofer: string | null
    }>("registros_vehiculos", "dominio, fecha, hora, odometro, tipo, chofer"),
    fetchTodo<{
      dominio: string
      fecha: string
      hora: string
      odometro: number | null
      tipo: string | null
      chofer: string | null
    }>("checklist_vehiculos", "dominio, fecha, hora, odometro, tipo, chofer"),
    fetchTodo<{
      dominio: string
      fecha: string
      odometro: number | null
      chofer: string | null
    }>("registro_combustible", "dominio, fecha, odometro, chofer"),
  ]).then(([r, c, k]) => [{ data: r }, { data: c }, { data: k }] as const)

  const lecturas: Lectura[] = []

  for (const r of (reg.data || []) as Array<{
    dominio: string
    fecha: string
    hora: string
    odometro: number | null
    tipo: string | null
    chofer: string | null
  }>) {
    if (r.odometro == null) continue
    lecturas.push({
      dominio: r.dominio,
      fecha: r.fecha,
      hora: normalizeHora(r.hora),
      odometro: Number(r.odometro),
      fuente: "registros",
      tipo: r.tipo,
      chofer: r.chofer,
    })
  }

  for (const r of (chk.data || []) as Array<{
    dominio: string
    fecha: string
    hora: string
    odometro: number | null
    tipo: string | null
    chofer: string | null
  }>) {
    if (r.odometro == null) continue
    lecturas.push({
      dominio: r.dominio,
      fecha: toFecha(r.fecha, r.hora),
      hora: normalizeHora(r.hora),
      odometro: Number(r.odometro),
      fuente: "checklist",
      tipo: r.tipo,
      chofer: r.chofer,
    })
  }

  for (const r of (com.data || []) as Array<{
    dominio: string
    fecha: string
    odometro: number | null
    chofer: string | null
  }>) {
    if (r.odometro == null) continue
    lecturas.push({
      dominio: r.dominio,
      fecha: r.fecha,
      hora: "12:00:00",
      odometro: Number(r.odometro),
      fuente: "combustible",
      chofer: r.chofer,
    })
  }

  return lecturas
}

export interface LecturaSugerida {
  odometro: number
  fecha: string
  fuente: Fuente
}

/**
 * Últimas lecturas de odómetro por dominio, más recientes primero, para ofrecer
 * como sugerencias al cargar una OT / mantenimiento. Deduplica por valor de
 * odómetro (se queda con la aparición más reciente) y corta en `limite`.
 */
export function ultimasLecturasPorDominio(
  lecturas: Lectura[],
  limite = 8
): Record<string, LecturaSugerida[]> {
  const porDominio = new Map<string, Lectura[]>()
  for (const l of lecturas) {
    if (!porDominio.has(l.dominio)) porDominio.set(l.dominio, [])
    porDominio.get(l.dominio)!.push(l)
  }
  const result: Record<string, LecturaSugerida[]> = {}
  for (const [dominio, arr] of porDominio) {
    // Orden descendente: fecha y luego hora.
    arr.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
      return a.hora < b.hora ? 1 : -1
    })
    const vistos = new Set<number>()
    const top: LecturaSugerida[] = []
    for (const l of arr) {
      if (vistos.has(l.odometro)) continue
      vistos.add(l.odometro)
      top.push({ odometro: l.odometro, fecha: l.fecha, fuente: l.fuente })
      if (top.length >= limite) break
    }
    result[dominio] = top
  }
  return result
}

/**
 * Km actual de cada dominio: odómetro máximo "limpio" (descarta retrocesos
 * tomando la secuencia cronológica y quedándose con el máximo creciente).
 * Devuelve también la fecha de la última lectura usada.
 */
export function kmActualPorDominio(
  lecturas: Lectura[]
): Map<string, { odometro: number; fecha: string }> {
  const porDominio = new Map<string, Lectura[]>()
  for (const l of lecturas) {
    if (!porDominio.has(l.dominio)) porDominio.set(l.dominio, [])
    porDominio.get(l.dominio)!.push(l)
  }
  const result = new Map<string, { odometro: number; fecha: string }>()
  for (const [dominio, arr] of porDominio) {
    arr.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
      return a.hora < b.hora ? -1 : 1
    })
    let max = -Infinity
    let fecha = ""
    for (const l of arr) {
      if (l.odometro >= max) {
        max = l.odometro
        fecha = l.fecha
      }
    }
    if (max > -Infinity) result.set(dominio, { odometro: max, fecha })
  }
  return result
}
