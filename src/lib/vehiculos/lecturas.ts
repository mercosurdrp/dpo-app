import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

// Helpers compartidos para reconstruir la actividad de la flota a partir de
// las 3 fuentes de odómetro: registros_vehiculos, checklist_vehiculos y
// registro_combustible. Extraído de src/actions/vehiculos-analytics.ts para
// poder reusarse desde otras actions (este archivo NO es "use server").

export type Fuente = "registros" | "checklist" | "combustible" | "mantenimiento" | "manual"

export interface Lectura {
  dominio: string
  fecha: string
  hora: string
  odometro: number
  fuente: Fuente
  tipo?: string | null
  chofer?: string | null
  // Solo `mantenimiento_realizados` guarda odómetro y horómetro en columnas
  // separadas. En autoelevadores el odómetro de esa tabla no representa las
  // horas (se carga suelto), así que el cálculo de horas usa este campo cuando
  // está. El resto de las fuentes guarda las horas del AE en `odometro`.
  horometro?: number | null
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

export async function fetchLecturas(
  filters?: {
    dominio?: string
    fechaDesde?: string
    fechaHasta?: string
  },
  // Client explícito para contextos sin sesión (cron con service role).
  client?: SupabaseClient
): Promise<Lectura[]> {
  const supabase = client ?? (await createClient())

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

  // OT de mantenimiento: el odómetro/horómetro que se carga al registrar una
  // orden completada es una lectura real del vehículo (y a veces la MÁS reciente,
  // si todavía no se cargó un checklist/combustible posterior). Sin esto, los km
  // que el usuario carga en la OT no se reflejan en el "km/horas actual" ni en la
  // proyección del próximo service. Para autoelevadores el valor puede venir en
  // `horometro`; si no, se usa `odometro` (donde el check guarda las horas).
  let qMant = supabase
    .from("mantenimiento_realizados")
    .select("dominio, fecha, odometro, horometro")
    .eq("estado", "completado")
    .or("odometro.not.is.null,horometro.not.is.null")
  if (filters?.dominio) qMant = qMant.eq("dominio", filters.dominio)
  if (filters?.fechaDesde) qMant = qMant.gte("fecha", filters.fechaDesde)
  if (filters?.fechaHasta) qMant = qMant.lte("fecha", filters.fechaHasta)
  const mant = await qMant
  if (mant.error) throw new Error(mant.error.message)

  // Lecturas cargadas a mano desde el Tablero operativo (unidades sin fuente
  // automática: autoelevadores sin checklist diario, camionetas del depósito).
  // `valor` son km u horas según el tipo de la unidad.
  let qMan = supabase
    .from("vehiculos_lecturas")
    .select("dominio, fecha, valor, created_at")
    .order("fecha", { ascending: true })
  if (filters?.dominio) qMan = qMan.eq("dominio", filters.dominio)
  if (filters?.fechaDesde) qMan = qMan.gte("fecha", filters.fechaDesde)
  if (filters?.fechaHasta) qMan = qMan.lte("fecha", filters.fechaHasta)
  const man = await qMan
  if (man.error) throw new Error(man.error.message)

  const lecturas: Lectura[] = []

  for (const r of (man.data || []) as Array<{
    dominio: string
    fecha: string
    valor: number | null
    created_at: string
  }>) {
    if (r.valor == null) continue
    lecturas.push({
      dominio: r.dominio,
      fecha: r.fecha,
      hora: normalizeHora(r.created_at),
      odometro: Number(r.valor),
      fuente: "manual",
      tipo: null,
      chofer: null,
    })
  }

  for (const r of (mant.data || []) as Array<{
    dominio: string
    fecha: string
    odometro: number | null
    horometro: number | null
  }>) {
    const val = r.odometro ?? r.horometro
    if (val == null) continue
    lecturas.push({
      dominio: r.dominio,
      fecha: r.fecha,
      hora: "12:00:00",
      odometro: Number(val),
      fuente: "mantenimiento",
      tipo: null,
      chofer: null,
      horometro: r.horometro != null ? Number(r.horometro) : null,
    })
  }

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
 * Historial de lecturas por dominio de los últimos `dias` días (por defecto ~el
 * último mes y medio), una fila por día (la lectura de odómetro más alta de ese
 * día), más reciente primero. Sirve de referencia al cargar una OT con fecha
 * retroactiva: el usuario carga las facturas del mes juntas y necesita ver cómo
 * venían los km/día para completar el odómetro del día de cada factura.
 */
export function historialLecturasPorDominio(
  lecturas: Lectura[],
  dias = 45
): Record<string, LecturaSugerida[]> {
  const limite = addDays(today(), -dias)
  // dominio -> (fecha 'YYYY-MM-DD' -> mejor lectura de ese día)
  const porDominio = new Map<string, Map<string, LecturaSugerida>>()
  for (const l of lecturas) {
    const dia = l.fecha.slice(0, 10)
    if (dia < limite) continue
    let porDia = porDominio.get(l.dominio)
    if (!porDia) {
      porDia = new Map()
      porDominio.set(l.dominio, porDia)
    }
    const prev = porDia.get(dia)
    if (!prev || l.odometro > prev.odometro) {
      porDia.set(dia, { odometro: l.odometro, fecha: dia, fuente: l.fuente })
    }
  }
  const result: Record<string, LecturaSugerida[]> = {}
  for (const [dominio, porDia] of porDominio) {
    result[dominio] = [...porDia.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  }
  return result
}

export interface HorasResumen {
  // Se reusan los nombres km* del resto del tablero para no duplicar tipos: en
  // autoelevadores el "odómetro" es en realidad el HORÓMETRO (horas), así que
  // estos valores son horas.
  horasMes: number
  horasYTD: number
  horasHistorico: number
  ultimoHorometro: number | null
  ultimaFecha: string | null
  // Horas trabajadas por día en los últimos 30 (delta del horómetro contra la
  // lectura previa). Campo `km` para poder reusar el mismo chart que camiones.
  porDia30: { fecha: string; km: number }[]
}

/**
 * Resumen de HORAS para autoelevadores. A diferencia de los camiones (que
 * registran varias lecturas por día y las horas/km del día salen del span
 * intradía), el horómetro del autoelevador es un contador ACUMULADO con UNA
 * lectura por día. Por eso las horas de un período = último horómetro del
 * período − horómetro base al inicio (la última lectura anterior al período, o
 * la primera del propio período si no hay historia previa). Descarta retrocesos
 * quedándose con la secuencia monótona creciente.
 */
export function resumenHorasHorometro(
  lecturas: Lectura[],
  hoy: string,
  inicioMes: string,
  inicioAnio: string
): HorasResumen {
  // Valor en HORAS de la lectura. `mantenimiento_realizados` guarda odómetro y
  // horómetro por separado y en los autoelevadores el odómetro de esa tabla
  // trae cualquier cosa (el de HELI1 marcaba 68 el día que el horómetro real
  // iba 42). Un valor adelantado envenena la serie: al descartar retrocesos se
  // comía todas las lecturas buenas siguientes hasta superarlo.
  const horas = (l: Lectura): number => l.horometro ?? l.odometro

  const orden = [...lecturas].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
    return a.hora < b.hora ? -1 : 1
  })
  // Secuencia monótona creciente (descarta cargas erróneas más bajas).
  const limpio: Lectura[] = []
  let prev = -Infinity
  for (const l of orden) {
    if (horas(l) >= prev) {
      limpio.push(l)
      prev = horas(l)
    }
  }

  if (limpio.length === 0) {
    return {
      horasMes: 0,
      horasYTD: 0,
      horasHistorico: 0,
      ultimoHorometro: null,
      ultimaFecha: null,
      porDia30: [],
    }
  }

  const ultimo = limpio[limpio.length - 1]
  const horasHistorico = horas(ultimo) - horas(limpio[0])

  const horasDesde = (inicioPeriodo: string): number => {
    const enPeriodo = limpio.filter((l) => l.fecha >= inicioPeriodo)
    if (enPeriodo.length === 0) return 0
    const anteriores = limpio.filter((l) => l.fecha < inicioPeriodo)
    const base = anteriores.length
      ? horas(anteriores[anteriores.length - 1])
      : horas(enPeriodo[0])
    const fin = horas(enPeriodo[enPeriodo.length - 1])
    return Math.max(0, fin - base)
  }

  const mapa30 = new Map<string, number>()
  for (let i = 29; i >= 0; i--) mapa30.set(addDays(hoy, -i), 0)
  for (let i = 1; i < limpio.length; i++) {
    const f = limpio[i].fecha
    if (!mapa30.has(f)) continue
    const delta = horas(limpio[i]) - horas(limpio[i - 1])
    mapa30.set(f, (mapa30.get(f) || 0) + delta)
  }
  const porDia30 = Array.from(mapa30.entries()).map(([fecha, km]) => ({ fecha, km }))

  return {
    horasMes: horasDesde(inicioMes),
    horasYTD: horasDesde(inicioAnio),
    horasHistorico,
    ultimoHorometro: horas(ultimo),
    ultimaFecha: ultimo.fecha,
    porDia30,
  }
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
