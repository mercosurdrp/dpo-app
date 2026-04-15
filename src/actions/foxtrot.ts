"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { syncFoxtrotDay } from "@/lib/foxtrot-sync"
import type {
  FoxtrotRoute,
  FoxtrotDriverLocation,
  FoxtrotSyncLog,
  FoxtrotKpis,
  FoxtrotDriverMapping,
} from "@/types/database"

type Result<T> = { data: T } | { error: string }

function monthRange(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export async function getFoxtrotKpis(): Promise<Result<FoxtrotKpis>> {
  await requireAuth()
  const supabase = await createClient()

  const now = new Date()
  const { start, end } = monthRange(now)
  const today = now.toISOString().slice(0, 10)

  const { data: mesRows, error: mesErr } = await supabase
    .from("foxtrot_routes")
    .select("tiempo_ruta_minutos, pct_tracking_activo, is_active, is_finalized, fecha")
    .gte("fecha", start)
    .lt("fecha", end)

  if (mesErr) return { error: mesErr.message }

  const mes = mesRows ?? []
  const totalRutasMes = mes.length
  const trackingVals = mes
    .map((r) => r.pct_tracking_activo)
    .filter((v): v is number => v !== null && v !== undefined)
  const pctTrackingActivoMes =
    trackingVals.length > 0
      ? Number((trackingVals.reduce((a, b) => a + b, 0) / trackingVals.length).toFixed(2))
      : 0

  const finalizadas = mes.filter(
    (r) => r.is_finalized === true && r.tiempo_ruta_minutos !== null
  )
  const tiempoRutaPromedioMinutos =
    finalizadas.length > 0
      ? Math.round(
          finalizadas.reduce((a, r) => a + (r.tiempo_ruta_minutos ?? 0), 0) /
            finalizadas.length
        )
      : 0
  const tiempoRutaDentroMeta = finalizadas.filter(
    (r) => (r.tiempo_ruta_minutos ?? 99999) <= 480
  ).length
  const tiempoRutaPctDentroMeta =
    finalizadas.length > 0
      ? Number(((tiempoRutaDentroMeta / finalizadas.length) * 100).toFixed(2))
      : 0

  const rutasHoy = mes.filter((r) => r.fecha === today).length
  const rutasActivasAhora = mes.filter(
    (r) => r.fecha === today && r.is_active === true && r.is_finalized !== true
  ).length

  const { data: lastSync } = await supabase
    .from("foxtrot_sync_log")
    .select("finished_at")
    .eq("ok", true)
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const seisMesesAtras = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const { data: histRows } = await supabase
    .from("foxtrot_routes")
    .select("fecha, tiempo_ruta_minutos, pct_tracking_activo")
    .gte("fecha", seisMesesAtras.toISOString().slice(0, 10))

  const mensualMap = new Map<
    string,
    { total: number; tiempos: number[]; trackings: number[]; year: number; mes: number }
  >()
  for (const r of histRows ?? []) {
    const d = new Date(r.fecha)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    const entry = mensualMap.get(key) ?? {
      total: 0,
      tiempos: [],
      trackings: [],
      year: d.getFullYear(),
      mes: d.getMonth() + 1,
    }
    entry.total++
    if (r.tiempo_ruta_minutos !== null) entry.tiempos.push(r.tiempo_ruta_minutos)
    if (r.pct_tracking_activo !== null) entry.trackings.push(r.pct_tracking_activo)
    mensualMap.set(key, entry)
  }

  const mensual = Array.from(mensualMap.values())
    .sort((a, b) => a.year - b.year || a.mes - b.mes)
    .map((e) => ({
      year: e.year,
      mes: e.mes,
      total_rutas: e.total,
      promedio_tiempo_ruta:
        e.tiempos.length > 0
          ? Math.round(e.tiempos.reduce((a, b) => a + b, 0) / e.tiempos.length)
          : 0,
      pct_tracking:
        e.trackings.length > 0
          ? Number(
              (e.trackings.reduce((a, b) => a + b, 0) / e.trackings.length).toFixed(2)
            )
          : 0,
    }))

  return {
    data: {
      totalRutasMes,
      pctTrackingActivoMes,
      tiempoRutaPromedioMinutos,
      tiempoRutaDentroMeta,
      tiempoRutaPctDentroMeta,
      rutasHoy,
      rutasActivasAhora,
      ultimaSincronizacion: lastSync?.finished_at ?? null,
      mensual,
    },
  }
}

export async function getFoxtrotRoutes(filters?: {
  fecha?: string
  driverName?: string
  dominio?: string
  limit?: number
}): Promise<Result<FoxtrotRoute[]>> {
  await requireAuth()
  const supabase = await createClient()

  let query = supabase
    .from("foxtrot_routes")
    .select("*")
    .order("fecha", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(filters?.limit ?? 200)

  if (filters?.fecha) query = query.eq("fecha", filters.fecha)
  if (filters?.driverName) query = query.ilike("driver_name", `%${filters.driverName}%`)
  if (filters?.dominio) query = query.ilike("dominio", `%${filters.dominio}%`)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: (data ?? []) as FoxtrotRoute[] }
}

export async function getFoxtrotDriverLocationsHoy(): Promise<
  Result<FoxtrotDriverLocation[]>
> {
  await requireAuth()
  const supabase = await createClient()

  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("foxtrot_driver_locations")
    .select("*")
    .eq("fecha", today)
    .order("timestamp", { ascending: false })

  if (error) return { error: error.message }

  // WHY: one row per driver = most recent
  const byDriver = new Map<string, FoxtrotDriverLocation>()
  for (const row of (data ?? []) as FoxtrotDriverLocation[]) {
    if (!byDriver.has(row.driver_id)) byDriver.set(row.driver_id, row)
  }
  return { data: Array.from(byDriver.values()) }
}

export async function getFoxtrotSyncLogs(
  limit = 20
): Promise<Result<FoxtrotSyncLog[]>> {
  await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("foxtrot_sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit)

  if (error) return { error: error.message }
  return { data: (data ?? []) as FoxtrotSyncLog[] }
}

export async function syncFoxtrotNow(
  fecha?: string
): Promise<Result<FoxtrotSyncLog>> {
  const profile = await requireAuth()
  if (profile.role !== "admin") {
    return { error: "Solo admins pueden disparar sync manual" }
  }

  const supabase = await createClient()
  const targetFecha = fecha ?? new Date().toISOString().slice(0, 10)
  try {
    const log = await syncFoxtrotDay(supabase, targetFecha)
    return { data: log }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function upsertFoxtrotDriverMapping(input: {
  foxtrot_driver_id: string
  foxtrot_driver_name: string
  empleado_id?: string | null
  notas?: string | null
}): Promise<Result<FoxtrotDriverMapping>> {
  const profile = await requireAuth()
  if (profile.role !== "admin") {
    return { error: "Solo admins pueden editar mapeos" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("foxtrot_driver_mapping")
    .upsert(
      {
        foxtrot_driver_id: input.foxtrot_driver_id,
        foxtrot_driver_name: input.foxtrot_driver_name,
        empleado_id: input.empleado_id ?? null,
        notas: input.notas ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "foxtrot_driver_id" }
    )
    .select()
    .single()

  if (error) return { error: error.message }
  return { data: data as FoxtrotDriverMapping }
}
