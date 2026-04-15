import type { SupabaseClient } from "@supabase/supabase-js"
import type { FoxtrotSyncLog } from "@/types/database"
import {
  listDcs,
  listDrivers,
  findRoutesByDate,
  getRoute,
  getRouteCompletionTime,
  getRouteWaypoints,
  getWaypointDeliveries,
  getDriverLocation,
  isFoxtrotConfigured,
  type FoxtrotRouteRaw,
  type FoxtrotAttempt,
} from "./foxtrot"

interface DeliveryStats {
  total: number
  successful: number
  failed: number
  visitLater: number
  attempted: number
}

function countAttempts(attempts: FoxtrotAttempt[] | undefined): {
  successful: boolean
  failed: boolean
  visitLater: boolean
  anyAttempt: boolean
} {
  const result = { successful: false, failed: false, visitLater: false, anyAttempt: false }
  if (!attempts || attempts.length === 0) return result
  result.anyAttempt = true
  for (const a of attempts) {
    if (a.attempt_status === "SUCCESSFUL") result.successful = true
    else if (a.attempt_status === "FAILED") result.failed = true
    else if (a.attempt_status === "VISIT_LATER") result.visitLater = true
  }
  return result
}

export async function syncFoxtrotDay(
  supabase: SupabaseClient,
  fecha: string
): Promise<FoxtrotSyncLog> {
  const { data: logRow, error: logErr } = await supabase
    .from("foxtrot_sync_log")
    .insert({
      fecha,
      started_at: new Date().toISOString(),
      ok: false,
      rutas_sincronizadas: 0,
      posiciones_sincronizadas: 0,
      errores: 0,
    })
    .select()
    .single()

  if (logErr || !logRow) {
    throw new Error(`No se pudo crear el log de sync: ${logErr?.message ?? "unknown"}`)
  }

  const log = logRow as FoxtrotSyncLog
  let rutas = 0
  let posiciones = 0
  let errores = 0
  const errorMessages: string[] = []

  const finalize = async (ok: boolean, errorDetalle: string | null) => {
    const { data: updated } = await supabase
      .from("foxtrot_sync_log")
      .update({
        finished_at: new Date().toISOString(),
        rutas_sincronizadas: rutas,
        posiciones_sincronizadas: posiciones,
        errores,
        error_detalle: errorDetalle,
        ok,
      })
      .eq("id", log.id)
      .select()
      .single()
    return (updated as FoxtrotSyncLog) ?? { ...log, ok, error_detalle: errorDetalle }
  }

  try {
    if (!isFoxtrotConfigured()) {
      errores++
      errorMessages.push("FOXTROT_API_KEY no configurada")
      return await finalize(false, errorMessages.join(" | "))
    }

    const dcsRes = await listDcs()
    if ("error" in dcsRes) {
      errores++
      errorMessages.push(`listDcs: ${dcsRes.error}`)
      return await finalize(false, errorMessages.join(" | "))
    }

    // Foxtrot devuelve DCs de todo el mundo. Filtramos solo los de
    // Mercosur Región Pampeana. Configurable por env var si hace falta
    // agregar otros (ej: eldorado, iguazu, lujan).
    const configIds = process.env.FOXTROT_DC_IDS
    const allowedIds = new Set(
      (configIds?.split(",").map((s) => s.trim()).filter(Boolean)) ?? [
        "ramallo",
        "pergamino",
      ],
    )
    const filteredDcs = dcsRes.data.filter((dc) => allowedIds.has(dc.id))

    if (filteredDcs.length === 0) {
      errores++
      errorMessages.push(
        `Ningún DC de la lista ${Array.from(allowedIds).join(",")} se encontró en Foxtrot`,
      )
      return await finalize(false, errorMessages.join(" | "))
    }

    for (const dc of filteredDcs) {
      const routesRes = await findRoutesByDate(dc.id, fecha)
      if ("error" in routesRes) {
        errores++
        errorMessages.push(`findRoutesByDate(${dc.id}): ${routesRes.error}`)
        continue
      }

      const driverIdsSeen = new Set<string>()
      const driverNames = new Map<string, string>()

      for (const routeStub of routesRes.data) {
        let route: FoxtrotRouteRaw = routeStub
        if (!route.waypoint_ids || !route.start_time) {
          const rr = await getRoute(dc.id, routeStub.id)
          if ("error" in rr) {
            errores++
            errorMessages.push(`getRoute(${routeStub.id}): ${rr.error}`)
            continue
          }
          route = rr.data
        }

        const ctRes = await getRouteCompletionTime(dc.id, route.id)
        let endTimeMs: number | null = null
        let completionType: string | null = null
        if ("data" in ctRes && ctRes.data) {
          endTimeMs = ctRes.data.timestamp
          completionType = ctRes.data.type
        } else if ("error" in ctRes) {
          errores++
          errorMessages.push(`completion-time(${route.id}): ${ctRes.error}`)
        }

        const wpRes = await getRouteWaypoints(dc.id, route.id)
        const waypoints = "data" in wpRes ? wpRes.data : []
        if ("error" in wpRes) {
          errores++
          errorMessages.push(`waypoints(${route.id}): ${wpRes.error}`)
        }

        const stats: DeliveryStats = {
          total: 0,
          successful: 0,
          failed: 0,
          visitLater: 0,
          attempted: 0,
        }

        for (const wp of waypoints) {
          const dRes = await getWaypointDeliveries(dc.id, route.id, wp.id)
          if ("error" in dRes) {
            errores++
            errorMessages.push(`deliveries(${route.id}/${wp.id}): ${dRes.error}`)
            continue
          }
          for (const delivery of dRes.data) {
            stats.total++
            const c = countAttempts(delivery.attempts)
            if (c.anyAttempt) stats.attempted++
            if (c.successful) stats.successful++
            if (c.failed) stats.failed++
            if (c.visitLater) stats.visitLater++
          }
        }

        const startMs = route.start_time ?? null
        const tiempoRutaMin =
          startMs && endTimeMs ? Math.round((endTimeMs - startMs) / 60000) : null
        const pctTracking =
          stats.total > 0 ? Number(((stats.attempted / stats.total) * 100).toFixed(2)) : null

        const driverId = route.assigned_driver_id ?? ""
        if (driverId) driverIdsSeen.add(driverId)

        const { error: upErr } = await supabase.from("foxtrot_routes").upsert(
          {
            route_id: route.id,
            dc_id: dc.id,
            fecha,
            driver_id: driverId,
            driver_name: driverNames.get(driverId) ?? driverId,
            vehicle_id: route.vehicle_id ?? null,
            dominio: null,
            start_time: startMs ? new Date(startMs).toISOString() : null,
            end_time: endTimeMs ? new Date(endTimeMs).toISOString() : null,
            completion_type: completionType,
            is_active: route.is_active ?? null,
            is_finalized: route.is_finalized ?? null,
            total_waypoints: waypoints.length,
            total_deliveries: stats.total,
            deliveries_successful: stats.successful,
            deliveries_failed: stats.failed,
            deliveries_visit_later: stats.visitLater,
            deliveries_attempted: stats.attempted,
            tiempo_ruta_minutos: tiempoRutaMin,
            driver_click_score: null,
            adherencia_secuencia: null,
            pct_tracking_activo: pctTracking,
            raw_data: route,
            last_synced: new Date().toISOString(),
          },
          { onConflict: "route_id" }
        )

        if (upErr) {
          errores++
          errorMessages.push(`upsert route ${route.id}: ${upErr.message}`)
        } else {
          rutas++
        }
      }

      const driversRes = await listDrivers(dc.id)
      if ("error" in driversRes) {
        errores++
        errorMessages.push(`listDrivers(${dc.id}): ${driversRes.error}`)
      } else {
        for (const drv of driversRes.data) {
          driverIdsSeen.add(drv.id)
          driverNames.set(drv.id, drv.name)
        }

        // Backfill driver_name on rows we just inserted
        for (const [id, name] of driverNames) {
          await supabase
            .from("foxtrot_routes")
            .update({ driver_name: name })
            .eq("driver_id", id)
            .eq("fecha", fecha)
        }

        for (const driverId of driverIdsSeen) {
          const locRes = await getDriverLocation(dc.id, driverId)
          if ("error" in locRes) {
            errores++
            errorMessages.push(`location(${driverId}): ${locRes.error}`)
            continue
          }
          if (!locRes.data) continue
          const ts = new Date(locRes.data.timestamp).toISOString()
          const fechaLoc = ts.slice(0, 10)
          const { error: locErr } = await supabase
            .from("foxtrot_driver_locations")
            .upsert(
              {
                driver_id: driverId,
                driver_name: driverNames.get(driverId) ?? driverId,
                fecha: fechaLoc,
                timestamp: ts,
                latitud: locRes.data.location.latitude,
                longitud: locRes.data.location.longitude,
              },
              { onConflict: "driver_id,timestamp", ignoreDuplicates: true }
            )
          if (!locErr) posiciones++
        }
      }
    }

    const ok = errores === 0
    return await finalize(ok, errorMessages.length > 0 ? errorMessages.slice(0, 10).join(" | ") : null)
  } catch (e) {
    errores++
    const msg = e instanceof Error ? e.message : String(e)
    errorMessages.push(`exception: ${msg}`)
    return await finalize(false, errorMessages.slice(0, 10).join(" | "))
  }
}
