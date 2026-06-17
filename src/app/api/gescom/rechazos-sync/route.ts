/**
 * Endpoint del sync de rechazos/ventas de GESCOM (sistema "Gestión") — lado Gestión de la
 * unificación del indicador de rechazos (el lado Chess vive en /api/rechazos/sync).
 *
 * Auth idéntica al sync de Chess (4 caminos: cron / manual-bearer / manual-session / script).
 * Solo Pampeana: si IS_MISIONES, responde no-op.
 *
 * Rango: la API GESCOM no filtra por fecha; el sync localiza las últimas páginas y filtra
 * por `fechaEntrega` en [fechaDesde, fechaHasta]. Default cron: últimos 30 días → hoy.
 * `modo: "full"` (o `?full=1`) recorre TODO el histórico (backfill inicial, lento).
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { IS_MISIONES } from "@/lib/empresa"
import { gescomCredsFromEnv } from "@/lib/gescom/client"
import { syncGescomRechazos } from "@/lib/sync/gescom-rechazos-sync"

const CRON_SECRET = process.env.CRON_SECRET
const ALLOWED_ROLES = ["admin", "supervisor", "admin_rrhh"] as const

type SyncSource = "cron" | "manual-bearer" | "manual-session" | "script"

export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("ping") === "1") {
    return NextResponse.json({ status: "ok", service: "gescom-rechazos-sync" })
  }
  const hoy = new Date()
  hoy.setUTCHours(0, 0, 0, 0)
  const desde = new Date(hoy)
  desde.setUTCDate(desde.getUTCDate() - 30)
  const proxied = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      fechaDesde: desde.toISOString().slice(0, 10),
      fechaHasta: hoy.toISOString().slice(0, 10),
      modo: request.nextUrl.searchParams.get("full") === "1" ? "full" : "recientes",
    }),
  })
  return POST(proxied)
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  if (IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "no-op en Misiones (módulo solo Pampeana)" })
  }

  const creds = gescomCredsFromEnv()
  if (!creds.user || !creds.pass) {
    return NextResponse.json(
      { error: "Integración GESCOM no configurada. Setear GESCOM_USER y GESCOM_PASS." },
      { status: 503 },
    )
  }

  // ---- Auth: mismos 4 caminos que /api/rechazos/sync ----
  const authHeader = request.headers.get("authorization") ?? ""
  const apiKeyHeader = request.headers.get("x-api-key") ?? ""
  const userAgent = request.headers.get("user-agent") ?? ""

  const bearerMatch = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  const apiKeyMatch = !!CRON_SECRET && apiKeyHeader === CRON_SECRET
  const isVercelCron = bearerMatch && /^vercel-cron/i.test(userAgent)

  let source: SyncSource
  if (isVercelCron) {
    source = "cron"
  } else if (bearerMatch) {
    source = "manual-bearer"
  } else if (apiKeyMatch) {
    source = "script"
  } else {
    source = "manual-session"
    if (authHeader.startsWith("Bearer ") || apiKeyHeader) {
      return NextResponse.json({ error: "CRON_SECRET inválido" }, { status: 401 })
    }
    const sessionClient = await createClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const { data: profile } = await sessionClient
      .from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      fechaDesde?: string; fechaHasta?: string; modo?: "recientes" | "full"; paginas?: number
    }

    let fechaDesdeStr = body.fechaDesde
    let fechaHastaStr = body.fechaHasta
    if (!fechaDesdeStr) {
      if (source === "manual-session") {
        return NextResponse.json({ error: "fechaDesde is required" }, { status: 400 })
      }
      const hoy = new Date()
      hoy.setUTCHours(0, 0, 0, 0)
      const desde = new Date(hoy)
      desde.setUTCDate(desde.getUTCDate() - 30)
      fechaDesdeStr = desde.toISOString().slice(0, 10)
      fechaHastaStr = hoy.toISOString().slice(0, 10)
    }
    if (!fechaHastaStr) fechaHastaStr = fechaDesdeStr

    const modo = body.modo === "full" ? "full" : "recientes"
    console.log(`[gescom-sync] start source=${source} modo=${modo} desde=${fechaDesdeStr} hasta=${fechaHastaStr}`)

    const supabase = createAdminClient()
    const r = await syncGescomRechazos({
      supabase, creds, desde: fechaDesdeStr, hasta: fechaHastaStr, modo, paginas: body.paginas,
    })

    const durationMs = Date.now() - startedAt
    console.log(
      `[gescom-sync] done source=${source} ventas=${r.ventas_consideradas} ` +
      `rechazos_upserted=${r.rechazos_upserted} rechazos_eliminados=${r.rechazos_eliminados} ventas_diarias=${r.ventas_diarias_upserted} ` +
      `ventas_calle=${r.ventas_calle_contadas} revertidos=${r.dev_re_revertidos} errors=${r.errors.length} duration_ms=${durationMs}`,
    )

    const { error: logErr } = await supabase.from("sync_log").insert({
      source,
      date_from: fechaDesdeStr,
      date_to: fechaHastaStr,
      rechazos_upserted: r.rechazos_upserted,
      ventas_upserted: r.ventas_diarias_upserted,
      errors: r.errors,
      duration_ms: durationMs,
    })
    if (logErr) console.error(`[gescom-sync] could not write sync_log: ${logErr.message}`)

    return NextResponse.json({ success: true, source, ...r, duration_ms: durationMs })
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const message = err instanceof Error ? err.message : "Error syncing GESCOM"
    console.error(`[gescom-sync] fatal source=${source} duration_ms=${durationMs}: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
