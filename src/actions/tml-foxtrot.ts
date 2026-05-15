"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  findRoutesByDate,
  getRoute,
  listDrivers,
  isFoxtrotConfigured,
  type FoxtrotRouteRaw,
} from "@/lib/foxtrot"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  TmlFoxtrotEquipo,
  TmlFoxtrotResumen,
  TmlFoxtrotSerieDia,
  TmlFoxtrotChoferAgg,
  TmlFoxtrotRango,
  TmlFoxtrotPeriodo,
} from "@/types/database"

const META_MIN = 30
// Tope de días que se pueden pedir de una sola vez (YTD ≈ 365 + margen).
const MAX_RANGO_DIAS = 400

// Misiones default (env unset / "false") => fecha_marca está en UTC verdadero.
// Pampeana ("true") => fecha_marca tiene hora AR disfrazada de UTC.
const MARCAS_EN_HORA_ARGENTINA = process.env.MARCAS_EN_HORA_ARGENTINA === "true"

const AR_TZ = "America/Argentina/Buenos_Aires"
const hhmmFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: AR_TZ,
})
// en-CA produce YYYY-MM-DD, que es justo el formato de fecha que usamos.
const ymdFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: AR_TZ })

interface EmpleadoRow {
  id: string
  legajo: number
  nombre: string
}

interface MarcaRow {
  legajo: number
  fecha_marca: string
  tipo_marca: "E" | "S"
}

// Ruta normalizada para el cálculo del TML, indistinto de si vino de la API
// en vivo (hoy) o de la tabla `foxtrot_routes` (días pasados ya sincronizados).
interface DayRoute {
  dc: string
  routeId: string
  driverId: string
  driverName: string | null
  vehicleId: string | null
  startedIso: string | null
}

// Fila cruda de `foxtrot_routes` (solo las columnas que usa el TML).
interface FoxtrotRouteRow {
  route_id: string
  dc_id: string
  fecha: string
  driver_id: string | null
  driver_name: string | null
  vehicle_id: string | null
  start_time: string | null
  raw_data: {
    // Salida REAL del vehículo (ROUTE_ANALYTICS), ISO UTC. Es el campo correcto
    // para el TML; lo carga el cron/backfill de analytics.
    tml_actual_departure?: string | null
    // "Driver Marked Route Start" — el chofer toca el botón. Solo fallback.
    started_timestamp?: string | null
  } | null
}

function dcToSucursal(dc: string): "ELDORADO" | "IGUAZU" | null {
  if (dc === "eldorado") return "ELDORADO"
  if (dc === "iguazu") return "IGUAZU"
  return null
}

function normaliza(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase()
}

function parseDcIds(): string[] {
  const env = process.env.FOXTROT_DC_IDS ?? "eldorado,iguazu"
  return env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function marcaToEpochMs(iso: string): number {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return NaN
  return MARCAS_EN_HORA_ARGENTINA ? t + 3 * 60 * 60 * 1000 : t
}

function epochMsToHHMM(ms: number | null): string | null {
  if (ms == null || Number.isNaN(ms)) return null
  return hhmmFormatter.format(new Date(ms))
}

// 07:00 hora Argentina del día = 10:00 UTC.
function siete00ArEpochMs(fecha: string): number {
  return new Date(`${fecha}T10:00:00.000Z`).getTime()
}

function diffMin(aMs: number, bMs: number): number {
  return Math.round((bMs - aMs) / 60000)
}

function hoyAr(): string {
  return ymdFormatter.format(new Date())
}

// Lista de fechas YYYY-MM-DD entre desde y hasta inclusive.
function eachDate(desde: string, hasta: string): string[] {
  const out: string[] = []
  // Mediodía UTC evita que los saltos de día crucen mal por timezone.
  const d = new Date(`${desde}T12:00:00.000Z`)
  const end = new Date(`${hasta}T12:00:00.000Z`)
  let guard = 0
  while (d <= end && guard < MAX_RANGO_DIAS) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
    guard++
  }
  return out
}

// Pagina cualquier query de Supabase para sortear el límite de 1000 filas
// de PostgREST. `build` recibe el rango [from, to] y devuelve la query.
async function fetchAllRows<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

// ---- Lectura de rutas ----

async function fetchRoutesForDate(
  fecha: string,
  dcIds: string[],
): Promise<{ dc: string; route: FoxtrotRouteRaw }[]> {
  const out: { dc: string; route: FoxtrotRouteRaw }[] = []
  await Promise.all(
    dcIds.map(async (dc) => {
      const r = await findRoutesByDate(dc, fecha)
      if ("error" in r) return
      const completas = await Promise.all(
        r.data.map(async (rt) => {
          // Si find_by_date devolvió un stub incompleto, completamos via getRoute.
          if (rt.started_timestamp !== undefined && rt.assigned_driver_id !== undefined) {
            return rt
          }
          const rr = await getRoute(dc, rt.id)
          return "data" in rr ? rr.data : rt
        }),
      )
      for (const rt of completas) out.push({ dc, route: rt })
    }),
  )
  return out
}

async function fetchDriverNamesByDc(
  dcIds: string[],
): Promise<Map<string, Map<string, string>>> {
  const result = new Map<string, Map<string, string>>()
  await Promise.all(
    dcIds.map(async (dc) => {
      const r = await listDrivers(dc)
      const m = new Map<string, string>()
      if ("data" in r) {
        for (const d of r.data) m.set(d.id, d.name)
      }
      result.set(dc, m)
    }),
  )
  return result
}

// Rutas del día leídas EN VIVO de la API de Foxtrot. Se usa solo para hoy
// (los días pasados salen de `foxtrot_routes`, ya sincronizados por el cron).
async function routesLive(fecha: string, dcIds: string[]): Promise<DayRoute[]> {
  const [routesByDc, driversByDc] = await Promise.all([
    fetchRoutesForDate(fecha, dcIds),
    fetchDriverNamesByDc(dcIds),
  ])
  return routesByDc.map(({ dc, route }) => {
    const driverId = route.assigned_driver_id ?? ""
    return {
      dc,
      routeId: route.id,
      driverId,
      driverName: driverId ? (driversByDc.get(dc)?.get(driverId) ?? null) : null,
      vehicleId: route.vehicle_id ?? null,
      startedIso: route.started_timestamp ?? null,
    }
  })
}

// Rutas de un rango de fechas leídas de la tabla `foxtrot_routes`.
async function routesFromDb(
  supabase: SupabaseClient,
  dcIds: string[],
  desde: string,
  hasta: string,
): Promise<Map<string, DayRoute[]>> {
  const rows = await fetchAllRows<FoxtrotRouteRow>((from, to) =>
    supabase
      .from("foxtrot_routes")
      .select("route_id,dc_id,fecha,driver_id,driver_name,vehicle_id,start_time,raw_data")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .in("dc_id", dcIds)
      .order("fecha")
      .range(from, to),
  )
  const byFecha = new Map<string, DayRoute[]>()
  for (const row of rows) {
    const dr: DayRoute = {
      dc: row.dc_id,
      routeId: row.route_id,
      driverId: row.driver_id ?? "",
      driverName: row.driver_name ?? null,
      vehicleId: row.vehicle_id ?? null,
      // Inicio de ruta = salida REAL del vehículo (ROUTE_ANALYTICS). Si todavía
      // no hay analytics, cae al "driver marked start" y luego al planificado.
      startedIso:
        row.raw_data?.tml_actual_departure ??
        row.raw_data?.started_timestamp ??
        row.start_time ??
        null,
    }
    const arr = byFecha.get(row.fecha)
    if (arr) arr.push(dr)
    else byFecha.set(row.fecha, [dr])
  }
  return byFecha
}

// Primera marca biométrica de entrada por (fecha, legajo) en todo el rango.
async function marcasEnRango(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<Map<string, Map<number, number>>> {
  const rows = await fetchAllRows<MarcaRow>((from, to) =>
    supabase
      .from("asistencia_marcas")
      .select("legajo,fecha_marca,tipo_marca")
      .gte("fecha_marca", `${desde}T00:00:00`)
      .lte("fecha_marca", `${hasta}T23:59:59`)
      .eq("tipo_marca", "E")
      .order("fecha_marca")
      .range(from, to),
  )
  const byFecha = new Map<string, Map<number, number>>()
  for (const m of rows) {
    const ms = marcaToEpochMs(m.fecha_marca)
    if (Number.isNaN(ms)) continue
    const fechaKey = m.fecha_marca.slice(0, 10)
    let inner = byFecha.get(fechaKey)
    if (!inner) {
      inner = new Map()
      byFecha.set(fechaKey, inner)
    }
    const prev = inner.get(m.legajo)
    if (prev == null || ms < prev) inner.set(m.legajo, ms)
  }
  return byFecha
}

// ---- Cálculo del TML ----

// Construye los equipos (uno por chofer) de un día puntual.
function computeEquiposDia(
  fecha: string,
  routes: DayRoute[],
  empByNombre: Map<string, EmpleadoRow>,
  primeraEntradaByLegajo: Map<number, number>,
): TmlFoxtrotEquipo[] {
  // Por cada driver: la PRIMERA vuelta del día (menor inicio de ruta).
  const primera = new Map<string, { route: DayRoute; startedMs: number }>()
  for (const r of routes) {
    if (!r.driverId || !r.startedIso) continue
    const ms = new Date(r.startedIso).getTime()
    if (Number.isNaN(ms)) continue
    // Descartar rutas cuyo inicio cae en otra fecha: Foxtrot a veces devuelve
    // en el día siguiente rutas viejas/no finalizadas, y producen TML espurios.
    if (ymdFormatter.format(new Date(ms)) !== fecha) continue
    const key = `${r.dc}:${r.driverId}`
    const prev = primera.get(key)
    if (!prev || ms < prev.startedMs) primera.set(key, { route: r, startedMs: ms })
  }

  const equipos: TmlFoxtrotEquipo[] = []
  for (const { route, startedMs } of primera.values()) {
    const empleado = route.driverName
      ? empByNombre.get(normaliza(route.driverName))
      : undefined
    const choferMarcaMs = empleado
      ? (primeraEntradaByLegajo.get(empleado.legajo) ?? null)
      : null

    let tmlReal: number | null = null
    let tmlDesde7: number | null = null
    if (choferMarcaMs != null) {
      tmlReal = diffMin(choferMarcaMs, startedMs)
      const corte = Math.max(siete00ArEpochMs(fecha), choferMarcaMs)
      tmlDesde7 = diffMin(corte, startedMs)
    }

    let estado: TmlFoxtrotEquipo["estado"]
    if (choferMarcaMs == null) estado = "sin_marca"
    else if (tmlReal != null && tmlReal > META_MIN) estado = "fuera_meta"
    else estado = "ok"

    equipos.push({
      fecha,
      camion_id: route.routeId,
      dominio: route.vehicleId,
      sucursal: dcToSucursal(route.dc),
      zona: "",
      chofer: {
        empleado_id: empleado?.id ?? null,
        legajo: empleado?.legajo ?? null,
        nombre: empleado?.nombre ?? route.driverName,
        hora_marca: epochMsToHHMM(choferMarcaMs ?? null),
        foxtrot_driver_id: route.driverId,
      },
      ayudante: {
        empleado_id: null,
        legajo: null,
        nombre: null,
        hora_marca: null,
        foxtrot_driver_id: null,
      },
      hora_marca_equipo: epochMsToHHMM(choferMarcaMs ?? null),
      hora_inicio_ruta: hhmmFormatter.format(new Date(startedMs)),
      route_id: route.routeId,
      tml_minutos_real: tmlReal,
      tml_minutos_desde7: tmlDesde7,
      estado,
    })
  }
  return equipos
}

function resumir(equipos: TmlFoxtrotEquipo[]): TmlFoxtrotResumen {
  const conTml = equipos.filter((e) => e.tml_minutos_real != null)
  const reales = conTml.map((e) => e.tml_minutos_real as number)
  const desde7 = conTml.map((e) => e.tml_minutos_desde7 as number)
  const promedio = (xs: number[]) =>
    xs.length === 0 ? null : Math.round(xs.reduce((s, x) => s + x, 0) / xs.length)
  return {
    equipos_totales: equipos.length,
    equipos_con_tml: conTml.length,
    promedio_real_min: promedio(reales),
    promedio_desde7_min: promedio(desde7),
    peor_real_min: reales.length === 0 ? null : Math.max(...reales),
    mejor_real_min: reales.length === 0 ? null : Math.min(...reales),
  }
}

// Agrega los equipos del rango por chofer (vista multi-día).
function agruparPorChofer(equipos: TmlFoxtrotEquipo[]): TmlFoxtrotChoferAgg[] {
  const grupos = new Map<string, TmlFoxtrotEquipo[]>()
  for (const e of equipos) {
    const key = e.chofer.empleado_id ?? `nombre:${normaliza(e.chofer.nombre)}`
    const arr = grupos.get(key)
    if (arr) arr.push(e)
    else grupos.set(key, [e])
  }

  const out: TmlFoxtrotChoferAgg[] = []
  for (const arr of grupos.values()) {
    const ref = arr[0]
    const reales = arr
      .map((e) => e.tml_minutos_real)
      .filter((v): v is number => v != null)
    const desde7 = arr
      .map((e) => e.tml_minutos_desde7)
      .filter((v): v is number => v != null)
    const diasFueraMeta = arr.filter((e) => e.estado === "fuera_meta").length
    const diasOk = arr.filter((e) => e.estado === "ok").length
    const diasSinMarca = arr.filter((e) => e.estado === "sin_marca").length
    const promedio = (xs: number[]) =>
      xs.length === 0 ? null : Math.round(xs.reduce((s, x) => s + x, 0) / xs.length)
    // sucursal: primera no nula
    const sucursal = arr.find((e) => e.sucursal != null)?.sucursal ?? null

    out.push({
      empleado_id: ref.chofer.empleado_id,
      legajo: ref.chofer.legajo,
      nombre: ref.chofer.nombre,
      sucursal,
      dias_con_ruta: arr.length,
      dias_con_tml: reales.length,
      dias_fuera_meta: diasFueraMeta,
      dias_sin_marca: diasSinMarca,
      tml_promedio_real: promedio(reales),
      tml_promedio_desde7: promedio(desde7),
      tml_peor_real: reales.length === 0 ? null : Math.max(...reales),
      tml_mejor_real: reales.length === 0 ? null : Math.min(...reales),
      pct_dentro_meta:
        diasOk + diasFueraMeta === 0
          ? null
          : Math.round((diasOk / (diasOk + diasFueraMeta)) * 100),
    })
  }

  // Peores primero (mayor TML promedio), nulos al final.
  out.sort((a, b) => {
    const aT = a.tml_promedio_real ?? -1
    const bT = b.tml_promedio_real ?? -1
    if (bT !== aT) return bT - aT
    return (a.nombre ?? "").localeCompare(b.nombre ?? "")
  })
  return out
}

function ordenarEquipos(equipos: TmlFoxtrotEquipo[]): void {
  const orden: Record<TmlFoxtrotEquipo["estado"], number> = {
    fuera_meta: 0,
    sin_marca: 1,
    sin_ruta: 2,
    ok: 3,
  }
  equipos.sort((a, b) => {
    const d = orden[a.estado] - orden[b.estado]
    if (d !== 0) return d
    const aT = a.tml_minutos_real ?? -1
    const bT = b.tml_minutos_real ?? -1
    if (bT !== aT) return bT - aT
    return (a.chofer.nombre ?? "").localeCompare(b.chofer.nombre ?? "")
  })
}

// ---- Acción pública: TML de un rango de fechas ----

export async function getTmlFoxtrotRango(
  desde: string,
  hasta: string,
  periodo: TmlFoxtrotPeriodo = "personalizado",
): Promise<{ data: TmlFoxtrotRango } | { error: string }> {
  try {
    if (!IS_MISIONES) return { error: "TML Foxtrot solo disponible en Misiones" }
    await requireAuth()
    if (!isFoxtrotConfigured()) {
      return { error: "FOXTROT_API_KEY no configurada en este deploy" }
    }
    const supabase = await createClient()
    const hoy = hoyAr()

    // Saneo de fechas: formato YYYY-MM-DD, desde ≤ hasta, hasta ≤ hoy.
    const re = /^\d{4}-\d{2}-\d{2}$/
    let d = re.test(desde) ? desde : hoy
    let h = re.test(hasta) ? hasta : hoy
    if (d > h) [d, h] = [h, d]
    if (h > hoy) h = hoy
    if (d > hoy) d = hoy

    const fechas = eachDate(d, h)
    if (fechas.length === 0) return { error: "Rango de fechas inválido" }
    // El rango efectivo puede recortarse si excedía MAX_RANGO_DIAS.
    const desdeEf = fechas[0]
    const hastaEf = fechas[fechas.length - 1]

    const dcIds = parseDcIds()

    // Empleados + marcas + rutas históricas: todo en paralelo.
    const [empRes, marcasByFecha, dbRoutesByFecha] = await Promise.all([
      supabase.from("empleados").select("id,legajo,nombre").eq("activo", true),
      marcasEnRango(supabase, desdeEf, hastaEf),
      routesFromDb(supabase, dcIds, desdeEf, hastaEf),
    ])
    if (empRes.error) throw new Error(`empleados: ${empRes.error.message}`)

    const empByNombre = new Map<string, EmpleadoRow>()
    for (const e of (empRes.data ?? []) as EmpleadoRow[]) {
      empByNombre.set(normaliza(e.nombre), e)
    }

    // El día de hoy se lee EN VIVO (el cron aún no lo sincronizó).
    const liveRoutes = fechas.includes(hoy) ? await routesLive(hoy, dcIds) : []

    const serie_diaria: TmlFoxtrotSerieDia[] = []
    const allEquipos: TmlFoxtrotEquipo[] = []
    for (const f of fechas) {
      const dayRoutes = f === hoy ? liveRoutes : (dbRoutesByFecha.get(f) ?? [])
      const marcas = marcasByFecha.get(f) ?? new Map<number, number>()
      const equiposDia = computeEquiposDia(f, dayRoutes, empByNombre, marcas)
      allEquipos.push(...equiposDia)
      const r = resumir(equiposDia)
      serie_diaria.push({
        fecha: f,
        promedio_real_min: r.promedio_real_min,
        promedio_desde7_min: r.promedio_desde7_min,
        equipos_con_tml: r.equipos_con_tml,
        equipos_totales: r.equipos_totales,
      })
    }

    const es_dia_unico = fechas.length === 1
    const equipos: TmlFoxtrotEquipo[] = es_dia_unico ? [...allEquipos] : []
    if (es_dia_unico) ordenarEquipos(equipos)

    return {
      data: {
        periodo,
        desde: desdeEf,
        hasta: hastaEf,
        es_dia_unico,
        // El día de hoy usa el inicio en vivo (driver marked); la salida real
        // se consolida al cierre con el cron de analytics.
        incluye_hoy_provisional: fechas.includes(hoy),
        meta_minutos: META_MIN,
        resumen: resumir(allEquipos),
        por_sucursal: {
          ELDORADO: resumir(allEquipos.filter((e) => e.sucursal === "ELDORADO")),
          IGUAZU: resumir(allEquipos.filter((e) => e.sucursal === "IGUAZU")),
        },
        serie_diaria,
        equipos,
        choferes: agruparPorChofer(allEquipos),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export interface TmlFoxtrotEnVivo {
  tml_minutos_real: number | null
  tml_minutos_desde7: number | null
  hora_inicio_ruta: string | null
}

// Mapa dominio → TML del día, leído en vivo. Lo usa `pre-ruta-en-vivo`.
export async function getTmlFoxtrotMapByDominio(
  fecha?: string,
): Promise<Record<string, TmlFoxtrotEnVivo>> {
  if (!IS_MISIONES) return {}
  try {
    await requireAuth()
    if (!isFoxtrotConfigured()) return {}
    const supabase = await createClient()
    const f = fecha ?? hoyAr()
    const dcIds = parseDcIds()

    const [routes, marcasByFecha, empRes] = await Promise.all([
      routesLive(f, dcIds),
      marcasEnRango(supabase, f, f),
      supabase.from("empleados").select("id,legajo,nombre").eq("activo", true),
    ])
    if (empRes.error) return {}

    const empByNombre = new Map<string, EmpleadoRow>()
    for (const e of (empRes.data ?? []) as EmpleadoRow[]) {
      empByNombre.set(normaliza(e.nombre), e)
    }

    const equipos = computeEquiposDia(
      f,
      routes,
      empByNombre,
      marcasByFecha.get(f) ?? new Map<number, number>(),
    )
    const map: Record<string, TmlFoxtrotEnVivo> = {}
    for (const e of equipos) {
      if (!e.dominio) continue
      map[e.dominio] = {
        tml_minutos_real: e.tml_minutos_real,
        tml_minutos_desde7: e.tml_minutos_desde7,
        hora_inicio_ruta: e.hora_inicio_ruta,
      }
    }
    return map
  } catch {
    return {}
  }
}
