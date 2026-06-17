/**
 * Endpoint del sync diario de rechazos.
 *
 * Wrapper de:
 *   - Autenticación (4 caminos: cron / manual-bearer / manual-session / script)
 *   - Parseo de rango (cron y bearer/script: ayer→hoy por default; UI: body con fechaDesde)
 *   - Loop por día llamando a `syncRechazosForDate` (lógica reutilizable en /lib/sync)
 *   - Cálculo de KPIs auto
 *   - Insert en `sync_log`
 *
 * La lógica de fetch a Chess + upserts vive en `@/lib/sync/rechazos-sync.ts`
 * y la comparte el script CLI `scripts/maintenance/sync-rechazos-local.ts`.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { calcularKpisConClient } from "@/lib/dpo-kpis-calc"
import {
  chessLogin,
  loadMapeoManualChofer,
  syncRechazosForDate,
  type ChessCredentials,
  type SyncDayResult,
} from "@/lib/sync/rechazos-sync"
import {
  syncChessArticulos,
  recalcOcupacionBodegaDia,
  updateIndicadorOB,
} from "@/lib/sync/ocupacion-bodega"

const CHESS_BASE = process.env.CHESS_API_BASE_URL
const CHESS_USER = process.env.CHESS_API_USER
const CHESS_PASS = process.env.CHESS_API_PASS

const ALLOWED_ROLES = ["admin", "supervisor", "admin_rrhh"] as const
const CRON_SECRET = process.env.CRON_SECRET

type SyncSource = "cron" | "manual-bearer" | "manual-session" | "script"

export const maxDuration = 300

// Vercel Cron sólo dispara GET. Convertimos a un POST con body amplio
// (últimos 7 días → hoy) y delegamos al handler real. Captura los rechazos
// que Chess publica con 2-4 días de delay. Health-check rápido con `?ping=1`.
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("ping") === "1") {
    return NextResponse.json({ status: "ok", service: "rechazos-sync" })
  }
  const hoy = new Date()
  hoy.setUTCHours(0, 0, 0, 0)
  const desde = new Date(hoy)
  desde.setUTCDate(desde.getUTCDate() - 7)
  const proxied = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      fechaDesde: desde.toISOString().slice(0, 10),
      fechaHasta: hoy.toISOString().slice(0, 10),
    }),
  })
  return POST(proxied)
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  if (!CHESS_BASE || !CHESS_USER || !CHESS_PASS) {
    return NextResponse.json(
      {
        error:
          "Integración Chess no configurada en este deploy. Setear CHESS_API_BASE_URL, CHESS_API_USER y CHESS_API_PASS.",
      },
      { status: 503 }
    )
  }

  // ---- Auth: 4 caminos posibles, cada uno con su source ----
  //   cron           = Vercel cron schedule       (Bearer + UA vercel-cron)
  //   manual-bearer  = curl/Postman con Bearer     (Bearer sin UA vercel-cron)
  //   script         = script externo             (x-api-key)
  //   manual-session = botón "Sincronizar" en UI  (sesión Supabase)
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
    // ---- Parseo de rango ----
    // UI (manual-session) requiere body con fechaDesde. El resto de caminos
    // (cron / manual-bearer / script) si no traen body usan default ayer→hoy.
    let desde: Date
    let hasta: Date

    const body = (await request.json().catch(() => ({}))) as {
      fechaDesde?: string
      fechaHasta?: string
    }
    const { fechaDesde, fechaHasta } = body

    if (fechaDesde) {
      desde = new Date(fechaDesde)
      hasta = fechaHasta ? new Date(fechaHasta) : new Date(fechaDesde)
    } else if (source === "manual-session") {
      return NextResponse.json({ error: "fechaDesde is required" }, { status: 400 })
    } else {
      const hoy = new Date()
      hoy.setUTCHours(0, 0, 0, 0)
      const ayer = new Date(hoy)
      ayer.setUTCDate(ayer.getUTCDate() - 1)
      desde = ayer
      hasta = hoy
    }

    const fechaDesdeStr = desde.toISOString().slice(0, 10)
    const fechaHastaStr = hasta.toISOString().slice(0, 10)
    console.log(`[sync] start source=${source} desde=${fechaDesdeStr} hasta=${fechaHastaStr}`)

    const chess: ChessCredentials = { baseUrl: CHESS_BASE, user: CHESS_USER, pass: CHESS_PASS }
    const sessionId = await chessLogin(chess)

    const supabase = createAdminClient()
    const mapeoManualChofer = await loadMapeoManualChofer(supabase)
    console.log(`[sync] mapeo_manual=${mapeoManualChofer.size}`)

    let totalRechazosUp = 0
    let totalRechazosRep = 0
    let totalRechazosDel = 0
    let totalVentasUp = 0
    let totalDias = 0
    let diasSinDatos = 0
    let chMap = 0, chSin = 0
    const errors: SyncDayResult["errors"] = []

    const current = new Date(desde)
    while (current <= hasta) {
      const fechaStr = current.toISOString().slice(0, 10)
      totalDias++
      const r = await syncRechazosForDate(fechaStr, {
        supabase, chess, sessionId, mapeoManualChofer,
      })
      if (r.sin_datos) diasSinDatos++
      totalRechazosUp += r.rechazos_upserted
      totalRechazosRep += r.rechazos_repetidos
      totalRechazosDel += r.rechazos_eliminados
      totalVentasUp += r.ventas_diarias_upserted
      chMap += r.chofer.mapeo; chSin += r.chofer.sin_resolver
      errors.push(...r.errors)
      current.setDate(current.getDate() + 1)
    }

    // KPIs auto
    const mesesProcesados = new Set<string>()
    const loopDate = new Date(desde)
    while (loopDate <= hasta) {
      mesesProcesados.add(`${loopDate.getFullYear()}-${loopDate.getMonth() + 1}`)
      loopDate.setDate(loopDate.getDate() + 1)
    }
    let kpisCalculados = 0
    for (const key of mesesProcesados) {
      const [anioStr, mesStr] = key.split("-")
      const result = await calcularKpisConClient(supabase, Number(mesStr), Number(anioStr))
      if ("data" in result) kpisCalculados += result.data.calculados
    }

    // ---- Ocupación de Bodega (CEq) ----
    // 1) sync maestro de SKU (skip si fue corrido hace <20h)
    // 2) recalcular OB diaria para cada fecha procesada
    // 3) update indicador OB con AVG MTD
    let obMaestroNew = 0, obMaestroSkip = false, obDias = 0, obViajes = 0
    let obIndUpdated = false, obIndAvg = 0
    try {
      const m = await syncChessArticulos(supabase, chess, sessionId)
      obMaestroSkip = m.skipped
      obMaestroNew = m.total
      const ob = new Date(desde)
      while (ob <= hasta) {
        const f = ob.toISOString().slice(0, 10)
        const r = await recalcOcupacionBodegaDia(supabase, chess, sessionId, f)
        obDias++; obViajes += r.viajes
        ob.setDate(ob.getDate() + 1)
      }
      const ind = await updateIndicadorOB(supabase)
      obIndUpdated = ind.updated; obIndAvg = ind.avg
    } catch (eOB) {
      console.error("[ob] error:", eOB instanceof Error ? eOB.message : String(eOB))
      errors.push({ day: null, kind: "ocupacion_bodega", message: eOB instanceof Error ? eOB.message : String(eOB) })
    }
    console.log(
      `[ob] maestro_skipped=${obMaestroSkip} maestro_total=${obMaestroNew} ` +
      `dias=${obDias} viajes=${obViajes} indicador_avg=${obIndAvg} updated=${obIndUpdated}`
    )

    const durationMs = Date.now() - startedAt
    console.log(
      `[sync] done source=${source} dias=${totalDias} sin_datos=${diasSinDatos} ` +
      `rechazos_upserted=${totalRechazosUp} rechazos_eliminados=${totalRechazosDel} ventas_upserted=${totalVentasUp} ` +
      `chofer_mapeo=${chMap} chofer_sin_resolver=${chSin} ` +
      `errors=${errors.length} duration_ms=${durationMs}`
    )

    const { error: logErr } = await supabase.from("sync_log").insert({
      source,
      date_from: fechaDesdeStr,
      date_to: fechaHastaStr,
      rechazos_upserted: totalRechazosUp,
      ventas_upserted: totalVentasUp,
      errors,
      duration_ms: durationMs,
    })
    if (logErr) console.error(`[sync] could not write sync_log: ${logErr.message}`)

    return NextResponse.json({
      success: true,
      source,
      dias_procesados: totalDias,
      rechazos_insertados: totalRechazosUp,
      rechazos_repetidos: totalRechazosRep,
      rechazos_eliminados: totalRechazosDel,
      ventas_upserted: totalVentasUp,
      dias_sin_datos: diasSinDatos,
      kpis_calculados: kpisCalculados,
      chofer: { mapeo: chMap, sin_resolver: chSin },
      ocupacion_bodega: {
        maestro_skipped: obMaestroSkip,
        maestro_total: obMaestroNew,
        dias: obDias,
        viajes: obViajes,
        indicador_updated: obIndUpdated,
        indicador_avg_ceq: obIndAvg,
      },
      errors,
      duration_ms: durationMs,
    })
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const message = err instanceof Error ? err.message : "Error syncing rechazos"
    console.error(`[sync] fatal source=${source} duration_ms=${durationMs}: ${message}`)
    try {
      const supabase = createAdminClient()
      await supabase.from("sync_log").insert({
        source,
        rechazos_upserted: 0,
        ventas_upserted: 0,
        errors: [{ day: null, kind: "fatal", message }],
        duration_ms: durationMs,
      })
    } catch { /* sync_log unreachable, solo log */ }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
