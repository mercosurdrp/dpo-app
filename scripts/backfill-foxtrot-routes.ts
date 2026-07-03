/**
 * Backfill histórico de foxtrot_routes (solo nivel RUTA, sin waypoints ni
 * deliveries): trae de la API de Foxtrot las rutas de cada día del rango y
 * inserta las que NO existan ya en la base (no pisa lo sincronizado completo).
 * Alimenta "Camiones a la calle" (viajes/mes), "Tiempo prom. en ruta" y
 * "Camiones por día" del Cuadro Mensual. Las filas backfilleadas quedan con
 * los contadores de deliveries en 0 (default) y pct_tracking_activo null.
 *
 * Usage: npx tsx scripts/backfill-foxtrot-routes.ts [desde] [hasta]
 *        (default: 2026-01-01 → ayer)
 */

import { readFileSync, existsSync } from "fs"
import { createClient } from "@supabase/supabase-js"
import {
  listDcs,
  listDrivers,
  findRoutesByDate,
  getRoute,
  getRouteCompletionTime,
  foxtrotDcIds,
  isFoxtrotConfigured,
} from "../src/lib/foxtrot"

// Cargar .env.local si las vars no están ya en el entorno (foxtrot.ts y
// supabase leen process.env recién al llamarlos, no al importar).
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, "")
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !isFoxtrotConfigured()) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / FOXTROT_API_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function ayerARG(): string {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
  return arg.toISOString().slice(0, 10)
}

function fechasEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  let t = Date.parse(`${desde}T00:00:00Z`)
  const fin = Date.parse(`${hasta}T00:00:00Z`)
  for (; t <= fin; t += 24 * 60 * 60 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

async function main() {
  const desde = process.argv[2] ?? "2026-01-01"
  const hasta = process.argv[3] ?? ayerARG()
  console.log(`Backfill foxtrot_routes ${desde} → ${hasta}`)

  const dcsRes = await listDcs()
  if ("error" in dcsRes) throw new Error(`listDcs: ${dcsRes.error}`)
  const allowed = new Set(foxtrotDcIds())
  const dcs = dcsRes.data.filter((d) => allowed.has(d.id))
  if (dcs.length === 0) throw new Error("Ningún DC permitido encontrado en Foxtrot")

  // Nombres de choferes (una vez por DC).
  const driverNames = new Map<string, string>()
  for (const dc of dcs) {
    const dr = await listDrivers(dc.id)
    if ("data" in dr) for (const d of dr.data) driverNames.set(d.id, d.name)
  }

  let insertadas = 0
  let existentes = 0
  let errores = 0

  for (const fecha of fechasEntre(desde, hasta)) {
    // Rutas ya sincronizadas ese día (no pisarlas: pueden tener el detalle completo).
    const { data: yaRows, error: yaErr } = await supabase
      .from("foxtrot_routes")
      .select("route_id")
      .eq("fecha", fecha)
    if (yaErr) {
      console.error(`${fecha}: error leyendo existentes: ${yaErr.message}`)
      errores++
      continue
    }
    const ya = new Set((yaRows ?? []).map((r) => r.route_id as string))

    let nuevasDia = 0
    for (const dc of dcs) {
      const routesRes = await findRoutesByDate(dc.id, fecha)
      if ("error" in routesRes) {
        console.error(`${fecha} ${dc.id}: findRoutesByDate: ${routesRes.error}`)
        errores++
        continue
      }

      for (const stub of routesRes.data) {
        if (ya.has(stub.id)) {
          existentes++
          continue
        }
        let route = stub
        if (!route.start_time && !route.started_timestamp) {
          const rr = await getRoute(dc.id, stub.id)
          if ("data" in rr) route = rr.data
        }

        const ctRes = await getRouteCompletionTime(dc.id, route.id)
        const completion = "data" in ctRes ? ctRes.data : null

        const startedRealMs = route.started_timestamp
          ? new Date(route.started_timestamp).getTime()
          : null
        const startMs = startedRealMs ?? route.start_time ?? null
        const endFallbackMs = route.finalized_timestamp
          ? new Date(route.finalized_timestamp).getTime()
          : null
        const endMs = completion?.timestamp ?? endFallbackMs
        const tiempoRutaMin =
          startMs && endMs && endMs > startMs ? Math.round((endMs - startMs) / 60000) : null

        const driverId = route.assigned_driver_id ?? ""
        const { error: insErr } = await supabase.from("foxtrot_routes").insert({
          route_id: route.id,
          dc_id: dc.id,
          fecha,
          driver_id: driverId,
          driver_name: driverNames.get(driverId) ?? driverId,
          vehicle_id: route.vehicle_id ?? null,
          dominio: null,
          start_time: startMs ? new Date(startMs).toISOString() : null,
          end_time: endMs ? new Date(endMs).toISOString() : null,
          completion_type: completion?.type ?? null,
          is_active: route.is_active ?? null,
          is_finalized: route.is_finalized ?? null,
          total_waypoints: route.waypoint_ids?.length ?? 0,
          tiempo_ruta_minutos: tiempoRutaMin,
          pct_tracking_activo: null,
          raw_data: route,
          last_synced: new Date().toISOString(),
        })
        if (insErr) {
          console.error(`${fecha} insert ${route.id}: ${insErr.message}`)
          errores++
        } else {
          insertadas++
          nuevasDia++
        }
      }
    }
    if (nuevasDia > 0) console.log(`${fecha}: +${nuevasDia} rutas`)
  }

  console.log("\n--- Resultado ---")
  console.log(`insertadas: ${insertadas}`)
  console.log(`ya existían: ${existentes}`)
  console.log(`errores: ${errores}`)
  process.exit(errores > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})
