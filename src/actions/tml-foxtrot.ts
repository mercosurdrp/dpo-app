"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  TmlFoxtrotDia,
  TmlFoxtrotEquipo,
  TmlFoxtrotResumen,
} from "@/types/database"

const META_MIN = 30

const MARCAS_EN_HORA_ARGENTINA = process.env.MARCAS_EN_HORA_ARGENTINA === "true"

const AR_TZ = "America/Argentina/Buenos_Aires"
const hhmmFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: AR_TZ,
})

interface OrdenSalidaRow {
  fecha: string
  camion_id: string
  chofer_empleado_id: string | null
  ayudante_empleado_id: string | null
  zona: string
}

interface CamionRow {
  id: string
  dominio: string
}

interface FlotaRow {
  vehiculo_id: string
  sucursal: "ELDORADO" | "IGUAZU"
}

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

interface MapeoRow {
  empleado_id: string
  foxtrot_driver_id: string
}

interface FoxtrotRouteMin {
  route_id: string
  driver_id: string
  start_time: string | null
}

// Misiones default (env unset / "false") => fecha_marca está en UTC verdadero.
// Pampeana ("true") => fecha_marca tiene hora AR disfrazada de UTC.
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

async function buildTmlFoxtrotEquipos(
  supabase: SupabaseClient,
  fecha: string,
): Promise<TmlFoxtrotEquipo[]> {
  const [asigRes, marcasRes, mapeoRes, routesRes] = await Promise.all([
    supabase
      .from("orden_salida_camion_diario")
      .select("fecha,camion_id,chofer_empleado_id,ayudante_empleado_id,zona")
      .eq("fecha", fecha)
      .eq("estado", "operativo"),
    supabase
      .from("asistencia_marcas")
      .select("legajo,fecha_marca,tipo_marca")
      .gte("fecha_marca", `${fecha}T00:00:00`)
      .lte("fecha_marca", `${fecha}T23:59:59`)
      .eq("tipo_marca", "E"),
    supabase
      .from("foxtrot_driver_mapping")
      .select("empleado_id,foxtrot_driver_id"),
    supabase
      .from("foxtrot_routes")
      .select("route_id,driver_id,start_time")
      .eq("fecha", fecha),
  ])

  if (asigRes.error) throw new Error(`orden_salida_camion_diario: ${asigRes.error.message}`)
  if (marcasRes.error) throw new Error(`asistencia_marcas: ${marcasRes.error.message}`)
  if (mapeoRes.error) throw new Error(`foxtrot_driver_mapping: ${mapeoRes.error.message}`)
  if (routesRes.error) throw new Error(`foxtrot_routes: ${routesRes.error.message}`)

  const asignaciones = (asigRes.data ?? []) as OrdenSalidaRow[]
  const marcas = (marcasRes.data ?? []) as MarcaRow[]
  const mapeos = (mapeoRes.data ?? []) as MapeoRow[]
  const routes = (routesRes.data ?? []) as FoxtrotRouteMin[]

  if (asignaciones.length === 0) return []

  const camionIds = Array.from(new Set(asignaciones.map((a) => a.camion_id)))
  const empleadoIds = Array.from(
    new Set(
      asignaciones
        .flatMap((a) => [a.chofer_empleado_id, a.ayudante_empleado_id])
        .filter((v): v is string => v != null),
    ),
  )

  const [camRes, flotaRes, empRes] = await Promise.all([
    supabase.from("catalogo_vehiculos").select("id,dominio").in("id", camionIds),
    supabase.from("orden_salida_flota").select("vehiculo_id,sucursal").in("vehiculo_id", camionIds),
    empleadoIds.length > 0
      ? supabase.from("empleados").select("id,legajo,nombre").in("id", empleadoIds)
      : Promise.resolve({ data: [] as EmpleadoRow[], error: null }),
  ])

  if (camRes.error) throw new Error(`catalogo_vehiculos: ${camRes.error.message}`)
  if (flotaRes.error) throw new Error(`orden_salida_flota: ${flotaRes.error.message}`)
  if ("error" in empRes && empRes.error) throw new Error(`empleados: ${empRes.error.message}`)

  const camionById = new Map<string, CamionRow>()
  for (const c of (camRes.data ?? []) as CamionRow[]) camionById.set(c.id, c)

  const sucursalByCamion = new Map<string, "ELDORADO" | "IGUAZU">()
  for (const f of (flotaRes.data ?? []) as FlotaRow[]) sucursalByCamion.set(f.vehiculo_id, f.sucursal)

  const empleadoById = new Map<string, EmpleadoRow>()
  for (const e of (empRes.data ?? []) as EmpleadoRow[]) empleadoById.set(e.id, e)

  // Primera entrada del día por legajo (ms epoch real).
  const primeraEntradaByLegajo = new Map<number, number>()
  for (const m of marcas) {
    const ms = marcaToEpochMs(m.fecha_marca)
    if (Number.isNaN(ms)) continue
    const prev = primeraEntradaByLegajo.get(m.legajo)
    if (prev == null || ms < prev) primeraEntradaByLegajo.set(m.legajo, ms)
  }

  const driverIdByEmpleado = new Map<string, string>()
  for (const m of mapeos) {
    if (m.empleado_id) driverIdByEmpleado.set(m.empleado_id, m.foxtrot_driver_id)
  }

  // Tomar la primera ruta del día por driver (con start_time válido).
  const routeByDriver = new Map<string, FoxtrotRouteMin>()
  for (const r of routes) {
    if (!r.start_time) continue
    const prev = routeByDriver.get(r.driver_id)
    if (!prev || (prev.start_time && r.start_time < prev.start_time)) {
      routeByDriver.set(r.driver_id, r)
    }
  }

  const equipos: TmlFoxtrotEquipo[] = asignaciones.map((a) => {
    const cam = camionById.get(a.camion_id)
    const sucursal = sucursalByCamion.get(a.camion_id) ?? null

    const choferEmp = a.chofer_empleado_id ? empleadoById.get(a.chofer_empleado_id) : undefined
    const ayudEmp = a.ayudante_empleado_id ? empleadoById.get(a.ayudante_empleado_id) : undefined

    const choferMarcaMs = choferEmp ? primeraEntradaByLegajo.get(choferEmp.legajo) ?? null : null
    const ayudMarcaMs = ayudEmp ? primeraEntradaByLegajo.get(ayudEmp.legajo) ?? null : null

    const choferDriverId = a.chofer_empleado_id ? driverIdByEmpleado.get(a.chofer_empleado_id) ?? null : null
    const ayudDriverId = a.ayudante_empleado_id ? driverIdByEmpleado.get(a.ayudante_empleado_id) ?? null : null

    // Tomar la marca más tardía del equipo: representa cuándo el equipo "está completo".
    const marcasEquipo: number[] = []
    if (choferMarcaMs != null) marcasEquipo.push(choferMarcaMs)
    if (ayudMarcaMs != null) marcasEquipo.push(ayudMarcaMs)
    const marcaEquipoMs = marcasEquipo.length > 0 ? Math.max(...marcasEquipo) : null

    // Buscar ruta Foxtrot: priorizar la del chofer; fallback al ayudante.
    const route =
      (choferDriverId ? routeByDriver.get(choferDriverId) : undefined) ??
      (ayudDriverId ? routeByDriver.get(ayudDriverId) : undefined) ??
      null
    const startMs = route?.start_time ? new Date(route.start_time).getTime() : null

    let tmlReal: number | null = null
    let tmlDesde7: number | null = null
    if (marcaEquipoMs != null && startMs != null) {
      tmlReal = diffMin(marcaEquipoMs, startMs)
      const corte = Math.max(siete00ArEpochMs(a.fecha), marcaEquipoMs)
      tmlDesde7 = diffMin(corte, startMs)
    }

    let estado: TmlFoxtrotEquipo["estado"]
    if (marcaEquipoMs == null) estado = "sin_marca"
    else if (startMs == null) estado = "sin_ruta"
    else if (tmlReal != null && tmlReal > META_MIN) estado = "fuera_meta"
    else estado = "ok"

    return {
      fecha: a.fecha,
      camion_id: a.camion_id,
      dominio: cam?.dominio ?? null,
      sucursal,
      zona: a.zona ?? "",
      chofer: {
        empleado_id: a.chofer_empleado_id,
        legajo: choferEmp?.legajo ?? null,
        nombre: choferEmp?.nombre ?? null,
        hora_marca: epochMsToHHMM(choferMarcaMs ?? null),
        foxtrot_driver_id: choferDriverId,
      },
      ayudante: {
        empleado_id: a.ayudante_empleado_id,
        legajo: ayudEmp?.legajo ?? null,
        nombre: ayudEmp?.nombre ?? null,
        hora_marca: epochMsToHHMM(ayudMarcaMs ?? null),
        foxtrot_driver_id: ayudDriverId,
      },
      hora_marca_equipo: epochMsToHHMM(marcaEquipoMs),
      hora_inicio_ruta: route?.start_time ? hhmmFormatter.format(new Date(route.start_time)) : null,
      route_id: route?.route_id ?? null,
      tml_minutos_real: tmlReal,
      tml_minutos_desde7: tmlDesde7,
      estado,
    }
  })

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

    // Ordenar: peor TML primero, luego sin marca, luego sin ruta, luego ok.
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
      return (a.dominio ?? "").localeCompare(b.dominio ?? "")
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

