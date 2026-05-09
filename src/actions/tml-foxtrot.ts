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
  TmlFoxtrotDia,
  TmlFoxtrotEquipo,
  TmlFoxtrotResumen,
} from "@/types/database"

const META_MIN = 30

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

interface RouteWithDc {
  dc: string
  route: FoxtrotRouteRaw
}

function dcToSucursal(dc: string): "ELDORADO" | "IGUAZU" | null {
  if (dc === "eldorado") return "ELDORADO"
  if (dc === "iguazu") return "IGUAZU"
  return null
}

function normaliza(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase()
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

async function fetchRoutesForDate(fecha: string, dcIds: string[]): Promise<RouteWithDc[]> {
  const out: RouteWithDc[] = []
  await Promise.all(
    dcIds.map(async (dc) => {
      const r = await findRoutesByDate(dc, fecha)
      if ("error" in r) return
      const completas = await Promise.all(
        r.data.map(async (rt) => {
          // Si el endpoint find_by_date no incluyó started_timestamp o el driver
          // asignado, lo traemos via getRoute. WHY: a veces find_by_date solo
          // devuelve route_ids o stubs incompletos.
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

async function fetchDriverNamesByDc(dcIds: string[]): Promise<Map<string, Map<string, string>>> {
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

async function buildTmlFoxtrotEquipos(
  supabase: SupabaseClient,
  fecha: string,
): Promise<TmlFoxtrotEquipo[]> {
  if (!isFoxtrotConfigured()) {
    throw new Error("FOXTROT_API_KEY no configurada en este deploy")
  }

  const dcIdsEnv = process.env.FOXTROT_DC_IDS ?? "eldorado,iguazu"
  const dcIds = dcIdsEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const [routesByDc, driversByDc, empRes, marcasRes] = await Promise.all([
    fetchRoutesForDate(fecha, dcIds),
    fetchDriverNamesByDc(dcIds),
    supabase.from("empleados").select("id,legajo,nombre").eq("activo", true),
    supabase
      .from("asistencia_marcas")
      .select("legajo,fecha_marca,tipo_marca")
      .gte("fecha_marca", `${fecha}T00:00:00`)
      .lte("fecha_marca", `${fecha}T23:59:59`)
      .eq("tipo_marca", "E"),
  ])

  if (empRes.error) throw new Error(`empleados: ${empRes.error.message}`)
  if (marcasRes.error) throw new Error(`asistencia_marcas: ${marcasRes.error.message}`)

  const empleados = (empRes.data ?? []) as EmpleadoRow[]
  const marcas = (marcasRes.data ?? []) as MarcaRow[]

  const empByNombre = new Map<string, EmpleadoRow>()
  for (const e of empleados) empByNombre.set(normaliza(e.nombre), e)

  const primeraEntradaByLegajo = new Map<number, number>()
  for (const m of marcas) {
    const ms = marcaToEpochMs(m.fecha_marca)
    if (Number.isNaN(ms)) continue
    const prev = primeraEntradaByLegajo.get(m.legajo)
    if (prev == null || ms < prev) primeraEntradaByLegajo.set(m.legajo, ms)
  }

  // Para cada driver: la PRIMERA vuelta del día (menor started_timestamp).
  // Las segundas vueltas quedan descartadas automáticamente.
  const primeraRuta = new Map<string, RouteWithDc>()
  for (const item of routesByDc) {
    const dId = item.route.assigned_driver_id
    if (!dId) continue
    const started = item.route.started_timestamp
    if (!started) continue
    const key = `${item.dc}:${dId}`
    const prev = primeraRuta.get(key)
    if (!prev || (prev.route.started_timestamp ?? "9999") > started) {
      primeraRuta.set(key, item)
    }
  }

  const equipos: TmlFoxtrotEquipo[] = []
  for (const item of primeraRuta.values()) {
    const driverId = item.route.assigned_driver_id ?? ""
    const driverName = driversByDc.get(item.dc)?.get(driverId) ?? null
    const empleado = driverName ? empByNombre.get(normaliza(driverName)) : undefined

    const choferMarcaMs = empleado ? (primeraEntradaByLegajo.get(empleado.legajo) ?? null) : null
    const startedMs = item.route.started_timestamp
      ? new Date(item.route.started_timestamp).getTime()
      : null

    let tmlReal: number | null = null
    let tmlDesde7: number | null = null
    if (choferMarcaMs != null && startedMs != null) {
      tmlReal = diffMin(choferMarcaMs, startedMs)
      const corte = Math.max(siete00ArEpochMs(fecha), choferMarcaMs)
      tmlDesde7 = diffMin(corte, startedMs)
    }

    let estado: TmlFoxtrotEquipo["estado"]
    if (choferMarcaMs == null) estado = "sin_marca"
    else if (startedMs == null) estado = "sin_ruta"
    else if (tmlReal != null && tmlReal > META_MIN) estado = "fuera_meta"
    else estado = "ok"

    equipos.push({
      fecha,
      camion_id: item.route.id,
      dominio: item.route.vehicle_id ?? null,
      sucursal: dcToSucursal(item.dc),
      zona: "",
      chofer: {
        empleado_id: empleado?.id ?? null,
        legajo: empleado?.legajo ?? null,
        nombre: empleado?.nombre ?? driverName,
        hora_marca: epochMsToHHMM(choferMarcaMs ?? null),
        foxtrot_driver_id: driverId,
      },
      ayudante: {
        empleado_id: null,
        legajo: null,
        nombre: null,
        hora_marca: null,
        foxtrot_driver_id: null,
      },
      hora_marca_equipo: epochMsToHHMM(choferMarcaMs ?? null),
      hora_inicio_ruta: startedMs ? hhmmFormatter.format(new Date(startedMs)) : null,
      route_id: item.route.id,
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

export async function getTmlFoxtrotDia(
  fecha?: string,
): Promise<{ data: TmlFoxtrotDia } | { error: string }> {
  try {
    if (!IS_MISIONES) return { error: "TML Foxtrot solo disponible en Misiones" }
    await requireAuth()
    const supabase = await createClient()
    const f = fecha ?? new Date().toISOString().slice(0, 10)

    const equipos = await buildTmlFoxtrotEquipos(supabase, f)

    const por_sucursal = {
      ELDORADO: resumir(equipos.filter((e) => e.sucursal === "ELDORADO")),
      IGUAZU: resumir(equipos.filter((e) => e.sucursal === "IGUAZU")),
    }

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

    return {
      data: {
        fecha: f,
        meta_minutos: META_MIN,
        resumen: resumir(equipos),
        por_sucursal,
        equipos,
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

export async function getTmlFoxtrotMapByDominio(
  fecha?: string,
): Promise<Record<string, TmlFoxtrotEnVivo>> {
  if (!IS_MISIONES) return {}
  try {
    await requireAuth()
    const supabase = await createClient()
    const f = fecha ?? new Date().toISOString().slice(0, 10)
    const equipos = await buildTmlFoxtrotEquipos(supabase, f)
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
