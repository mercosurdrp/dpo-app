// Cron diario que sincroniza las rutas de Foxtrot a `foxtrot_routes`.
// Lo consume el indicador TML Foxtrot (`/indicadores/tml-foxtrot`): los días
// pasados se leen de esta tabla en vez de pegarle a la API en vivo, que es
// inviable para rangos largos (semana / mes / YTD).
//
// Auth: Bearer CRON_SECRET (Vercel lo inyecta automáticamente en sus crons).
// Tenant: corre en AMBOS (Misiones eldorado,iguazu · Pampeana pergamino,ramallo);
// los DCs los resuelve foxtrotDcIds() en cada deploy. Schedule en `vercel.json`.
//
// Backfill manual (tramos cortos — el sync es pesado y secuencial):
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     ".../api/foxtrot/cron-sync?desde=2026-05-01&hasta=2026-05-07"

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { syncFoxtrotDay } from "@/lib/foxtrot-sync"
import { syncFoxtrotRouteAnalytics } from "@/lib/foxtrot-analytics"

const CRON_SECRET = process.env.CRON_SECRET
// El sync de Foxtrot es pesado (waypoints + deliveries + locations por ruta).
// 300s da margen para un día; el backfill se cap­ea a tramos cortos.
export const maxDuration = 300

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_BACKFILL_DIAS = 60

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const startedAt = Date.now()

  const authHeader = request.headers.get("authorization") ?? ""
  const isAuthorized = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "CRON_SECRET inválido o faltante" },
      { status: 401 },
    )
  }

  // El cron corre 01:00 ARG = 04:00 UTC, que YA es el día siguiente en UTC.
  // Por eso el default sincroniza AYER + HOY (UTC): "ayer" es el día operativo
  // que cerró (rutas completas + ROUTE_ANALYTICS ya generado a esa hora, lo que
  // antes fallaba al correr a las 20:30 ARG); "hoy" no daña (aún sin rutas, el
  // sync es idempotente). Para backfill manual se pasan ?desde=&hasta= (tramos
  // cortos para no exceder maxDuration); con solo ?desde se sincroniza ese día.
  const url = new URL(request.url)
  const hoy = new Date().toISOString().slice(0, 10)
  const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const qDesde = url.searchParams.get("desde")
  const qHasta = url.searchParams.get("hasta")
  const tieneDesde = !!qDesde && FECHA_RE.test(qDesde)
  const desde = tieneDesde ? qDesde! : ayer
  const hasta = qHasta && FECHA_RE.test(qHasta) ? qHasta : tieneDesde ? qDesde! : hoy

  const fechas: string[] = []
  const d = new Date(`${desde}T12:00:00.000Z`)
  const end = new Date(`${hasta}T12:00:00.000Z`)
  let guard = 0
  while (d <= end && guard < MAX_BACKFILL_DIAS) {
    fechas.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
    guard++
  }

  try {
    const supabase = createAdminClient()
    const resultados: { fecha: string; ok: boolean; rutas: number; errores: number }[] =
      []
    let rutas = 0
    let errores = 0
    for (const f of fechas) {
      const log = await syncFoxtrotDay(supabase, f)
      rutas += log.rutas_sincronizadas
      errores += log.errores
      resultados.push({
        fecha: f,
        ok: log.ok,
        rutas: log.rutas_sincronizadas,
        errores: log.errores,
      })
    }

    // Enriquecer con el departure real (ROUTE_ANALYTICS). El analytics se
    // genera asíncrono tras el cierre de la ruta, así que cubrimos una ventana
    // hacia atrás: el día de hoy puede no estar listo todavía, los previos sí.
    const analyticsHasta = fechas[fechas.length - 1]
    const analyticsDesde = new Date(`${fechas[0]}T12:00:00.000Z`)
    analyticsDesde.setUTCDate(analyticsDesde.getUTCDate() - 4)
    const analytics = await syncFoxtrotRouteAnalytics(
      supabase,
      analyticsDesde.toISOString().slice(0, 10),
      analyticsHasta,
    )

    const durationMs = Date.now() - startedAt
    console.log(
      `[foxtrot-cron-sync] ok dias=${fechas.length} rutas=${rutas} ` +
        `errores=${errores} analytics_ok=${analytics.ok} ` +
        `departures=${analytics.rutas_actualizadas} duration_ms=${durationMs}`,
    )

    return NextResponse.json({
      success: true,
      dias: fechas.length,
      rutas,
      errores,
      resultados,
      analytics,
      duration_ms: durationMs,
    })
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const message = err instanceof Error ? err.message : "Error sincronizando Foxtrot"
    console.error(`[foxtrot-cron-sync] fatal duration_ms=${durationMs}: ${message}`)
    return NextResponse.json({ error: message, duration_ms: durationMs }, { status: 500 })
  }
}
