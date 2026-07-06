/**
 * Backfill COMPLETO de foxtrot_routes para "Horas en ruta" del Cuadro Mensual:
 * además de insertar las rutas que falten (igual que backfill-foxtrot-routes),
 * REPARA las filas existentes sin tiempo (tiempo_ruta_minutos null/0) o sin
 * is_finalized, recalculándolos desde la API (getRoute + completion time).
 * No toca filas que ya tienen tiempo > 0: lo sincronizado completo queda igual.
 *
 * Usage: npx tsx scripts/backfill-foxtrot-tiempos.ts [desde] [hasta]
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

// Node 20 no trae WebSocket nativo y supabase-js lo exige al construir el
// cliente aunque no se use realtime (este script no lo usa): stub mínimo.
;(globalThis as { WebSocket?: unknown }).WebSocket ??= class {
  constructor() {
    throw new Error("realtime no disponible en este script")
  }
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
  console.log(`Backfill completo foxtrot_routes ${desde} → ${hasta}`)

  const dcsRes = await listDcs()
  if ("error" in dcsRes) throw new Error(`listDcs: ${dcsRes.error}`)
  const allowed = new Set(foxtrotDcIds())
  const dcs = dcsRes.data.filter((d) => allowed.has(d.id))
  if (dcs.length === 0) throw new Error("Ningún DC permitido encontrado en Foxtrot")

  const driverNames = new Map<string, string>()
  for (const dc of dcs) {
    const dr = await listDrivers(dc.id)
    if ("data" in dr) for (const d of dr.data) driverNames.set(d.id, d.name)
  }

  let insertadas = 0
  let reparadas = 0
  let intactas = 0
  let sinDatoApi = 0
  let errores = 0

  for (const fecha of fechasEntre(desde, hasta)) {
    // Estado actual del día: qué rutas hay y cuáles necesitan reparación.
    const { data: yaRows, error: yaErr } = await supabase
      .from("foxtrot_routes")
      .select("route_id, tiempo_ruta_minutos, is_finalized")
      .eq("fecha", fecha)
    if (yaErr) {
      console.error(`${fecha}: error leyendo existentes: ${yaErr.message}`)
      errores++
      continue
    }
    const existentes = new Map(
      (yaRows ?? []).map((r) => [
        r.route_id as string,
        {
          tiempo: r.tiempo_ruta_minutos as number | null,
          finalized: r.is_finalized as boolean | null,
        },
      ]),
    )

    let nuevasDia = 0
    let reparadasDia = 0
    for (const dc of dcs) {
      const routesRes = await findRoutesByDate(dc.id, fecha)
      if ("error" in routesRes) {
        console.error(`${fecha} ${dc.id}: findRoutesByDate: ${routesRes.error}`)
        errores++
        continue
      }

      for (const stub of routesRes.data) {
        const previa = existentes.get(stub.id)
        const necesitaReparar =
          previa !== undefined &&
          (!previa.tiempo || previa.tiempo <= 0 || previa.finalized === null)
        if (previa && !necesitaReparar) {
          intactas++
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

        if (previa) {
          // Reparación: solo si la API ahora sí devuelve algo que falta acá.
          if (tiempoRutaMin === null && route.is_finalized == null) {
            sinDatoApi++
            continue
          }
          const patch: Record<string, unknown> = {
            last_synced: new Date().toISOString(),
          }
          if (tiempoRutaMin !== null) {
            patch.tiempo_ruta_minutos = tiempoRutaMin
            patch.start_time = startMs ? new Date(startMs).toISOString() : null
            patch.end_time = endMs ? new Date(endMs).toISOString() : null
            patch.completion_type = completion?.type ?? null
          }
          if (route.is_finalized != null) patch.is_finalized = route.is_finalized
          const { error: updErr } = await supabase
            .from("foxtrot_routes")
            .update(patch)
            .eq("route_id", route.id)
            .eq("fecha", fecha)
          if (updErr) {
            console.error(`${fecha} update ${route.id}: ${updErr.message}`)
            errores++
          } else {
            reparadas++
            reparadasDia++
          }
          continue
        }

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
    if (nuevasDia > 0 || reparadasDia > 0) {
      console.log(`${fecha}: +${nuevasDia} nuevas · ${reparadasDia} reparadas`)
    }
  }

  console.log("\n--- Resultado ---")
  console.log(`insertadas: ${insertadas}`)
  console.log(`reparadas: ${reparadas}`)
  console.log(`intactas (ya con tiempo): ${intactas}`)
  console.log(`sin dato en la API: ${sinDatoApi}`)
  console.log(`errores: ${errores}`)
  process.exit(errores > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})
