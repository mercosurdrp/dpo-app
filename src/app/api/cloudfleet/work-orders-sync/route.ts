// Cron diario que sincroniza las órdenes de trabajo de Cloudfleet a
// `mantenimiento_realizados` (módulo de mantenimiento, pestaña Órdenes de
// Trabajo). Trae solo la flota Pampeana (filtra por catalogo_vehiculos).
//
// Auth: Bearer CRON_SECRET (Vercel lo inyecta en sus crons).
// Tenant: solo Pampeana; en Misiones sale 200 noop. Schedule en `vercel.json`.
//
// Backfill manual:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     ".../api/cloudfleet/work-orders-sync?desde=2026-01-01&hasta=2026-06-27"

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { syncCloudfleetWorkOrders } from "@/lib/cloudfleet/work-orders-sync"
import { IS_MISIONES } from "@/lib/empresa"

const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 300

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
// Ventana hacia atrás por default: repara huecos y recoge cambios de estado/
// costos de OT recientes (una OT abierta se cierra días después).
const VENTANA_DIAS_DEFAULT = 45

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const startedAt = Date.now()

  // El módulo de mantenimiento (y la flota a sincronizar) es solo Pampeana.
  if (IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "not-pampeana" })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const isAuthorized = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  if (!isAuthorized) {
    return NextResponse.json({ error: "CRON_SECRET inválido o faltante" }, { status: 401 })
  }

  const url = new URL(request.url)
  const hoy = new Date().toISOString().slice(0, 10)
  const qDesde = url.searchParams.get("desde")
  const qHasta = url.searchParams.get("hasta")
  const desde =
    qDesde && FECHA_RE.test(qDesde)
      ? qDesde
      : new Date(Date.now() - VENTANA_DIAS_DEFAULT * 86_400_000).toISOString().slice(0, 10)
  const hasta = qHasta && FECHA_RE.test(qHasta) ? qHasta : hoy

  try {
    const supabase = createAdminClient()
    const result = await syncCloudfleetWorkOrders(supabase, desde, hasta)
    const durationMs = Date.now() - startedAt
    console.log(
      `[cloudfleet-wo-sync] desde=${desde} hasta=${hasta} ` +
        `total=${result.total} ok=${result.ok} duration_ms=${durationMs}`,
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error, duration_ms: durationMs }, { status: 500 })
    }
    return NextResponse.json({ success: true, desde, hasta, ...result, duration_ms: durationMs })
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const message = err instanceof Error ? err.message : "Error sincronizando OT de Cloudfleet"
    console.error(`[cloudfleet-wo-sync] fatal duration_ms=${durationMs}: ${message}`)
    return NextResponse.json({ error: message, duration_ms: durationMs }, { status: 500 })
  }
}
