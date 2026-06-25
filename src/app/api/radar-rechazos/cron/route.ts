/**
 * Cron del Radar de Rechazos del Día Siguiente.
 *
 * Corre ~09:30 AR (post-ruteo): arma la foto de los clientes que se entregan
 * MAÑANA y tienen historial de rechazo por CERRADO / SIN DINERO, y la congela
 * en `radar_rechazos_snapshot` + `radar_rechazos_cliente`. Ventas la trabaja en
 * su matinal para avisar al cliente y evitar el rechazo.
 *
 * Auth (igual que /api/rechazos/sync):
 *   cron          = Vercel cron (Bearer CRON_SECRET + UA vercel-cron)
 *   manual-bearer = curl/Postman con Bearer CRON_SECRET
 *   manual-session= botón "Regenerar" en la UI (sesión admin/supervisor)
 *
 * Health-check rápido con ?ping=1. Permite ?fecha=YYYY-MM-DD para re-armar una
 * fecha puntual (default: mañana ART).
 */
import { NextRequest, NextResponse } from "next/server"
import { IS_MISIONES } from "@/lib/empresa"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { buildRadarRechazos, mananaART } from "@/lib/radar-rechazos/build"
import { persistRadarSnapshot } from "@/lib/radar-rechazos/persist"

export const maxDuration = 120

const CHESS_BASE = process.env.CHESS_API_BASE_URL
const CHESS_USER = process.env.CHESS_API_USER
const CHESS_PASS = process.env.CHESS_API_PASS
const CRON_SECRET = process.env.CRON_SECRET

const ALLOWED_ROLES = ["admin", "supervisor"] as const

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("ping") === "1") {
    return NextResponse.json({ status: "ok", service: "radar-rechazos" })
  }
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}

async function run(request: NextRequest) {
  const startedAt = Date.now()

  // Radar solo aplica a Pampeana; en Misiones no existen las tablas radar_*.
  if (IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "not-pampeana" })
  }

  if (!CHESS_BASE || !CHESS_USER || !CHESS_PASS) {
    return NextResponse.json({ error: "Chess no configurado" }, { status: 503 })
  }

  // ---- Auth ----
  const authHeader = request.headers.get("authorization") ?? ""
  const userAgent = request.headers.get("user-agent") ?? ""
  const bearerMatch = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`

  if (!bearerMatch) {
    if (authHeader.startsWith("Bearer ")) {
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

  const source = bearerMatch
    ? (/^vercel-cron/i.test(userAgent) ? "cron" : "manual-bearer")
    : "manual-session"

  try {
    const fecha = request.nextUrl.searchParams.get("fecha")?.trim() || mananaART()
    const supabase = createAdminClient()
    const snap = await buildRadarRechazos(
      supabase,
      { baseUrl: CHESS_BASE, user: CHESS_USER, pass: CHESS_PASS },
      fecha,
    )
    const res = await persistRadarSnapshot(supabase, snap)
    const durationMs = Date.now() - startedAt
    console.log(
      `[radar-rechazos] source=${source} fecha=${fecha} ` +
      `clientes_dia=${snap.total_clientes_dia} en_riesgo=${snap.total_clientes_riesgo} ` +
      `bultos_riesgo=${snap.total_bultos_riesgo} duration_ms=${durationMs}`,
    )
    return NextResponse.json({
      success: true,
      source,
      fecha,
      clientes_dia: snap.total_clientes_dia,
      clientes_riesgo: snap.total_clientes_riesgo,
      bultos_riesgo: snap.total_bultos_riesgo,
      monto_riesgo: snap.total_monto_riesgo,
      snapshot_id: res.snapshot_id,
      duration_ms: durationMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error armando radar"
    console.error(`[radar-rechazos] fatal source=${source}: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
