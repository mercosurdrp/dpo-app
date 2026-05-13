/**
 * Sync diaria: bot_clientes_cache desde Chess (Pampeana).
 *
 * Auth — 3 caminos (mismo patrón que /api/rechazos/sync):
 *   - cron          (Bearer CRON_SECRET + UA vercel-cron)
 *   - manual-bearer (Bearer CRON_SECRET sin UA cron)
 *   - manual-session (admin logueado, para correrlo desde una UI)
 *
 * Body opcional: { empresa: 'pampeana' | 'misiones' } — default 'pampeana'.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { chessLogin } from "@/lib/wa-bot/chess"
import { syncClientesCache } from "@/lib/wa-bot/sync-clientes"

export const maxDuration = 300

const CHESS_BASE = process.env.CHESS_API_BASE_URL
const CHESS_USER = process.env.CHESS_API_USER
const CHESS_PASS = process.env.CHESS_API_PASS
const CRON_SECRET = process.env.CRON_SECRET

const ALLOWED_ROLES = ["admin", "supervisor"] as const

export async function GET() {
  return NextResponse.json({ status: "ok", service: "wa-bot-sync-clientes" })
}

export async function POST(request: NextRequest) {
  const t0 = Date.now()
  if (!CHESS_BASE || !CHESS_USER || !CHESS_PASS) {
    return NextResponse.json(
      { error: "Chess no configurado (CHESS_API_*)." },
      { status: 503 },
    )
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const userAgent = request.headers.get("user-agent") ?? ""
  const bearerOk = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  const isCron = bearerOk && /^vercel-cron/i.test(userAgent)

  let source: "cron" | "manual-bearer" | "manual-session"
  if (isCron) source = "cron"
  else if (bearerOk) source = "manual-bearer"
  else {
    source = "manual-session"
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

  try {
    const body = (await request.json().catch(() => ({}))) as { empresa?: "pampeana" | "misiones" }
    const empresa = body.empresa ?? "pampeana"

    const sessionId = await chessLogin({
      baseUrl: CHESS_BASE, user: CHESS_USER, pass: CHESS_PASS,
    })
    const supabase = createAdminClient()
    const result = await syncClientesCache(
      supabase,
      { baseUrl: CHESS_BASE, user: CHESS_USER, pass: CHESS_PASS },
      sessionId,
      empresa,
    )

    console.log(
      `[wa-bot:sync-clientes] source=${source} empresa=${empresa} ` +
      `clientes=${result.clientes_chess} con_promotor=${result.con_promotor} ` +
      `sin_promotor=${result.sin_promotor} duration=${result.duration_ms}ms`,
    )

    return NextResponse.json({ success: true, source, empresa, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error sync-clientes"
    console.error(`[wa-bot:sync-clientes] fatal: ${msg}`)
    return NextResponse.json({ error: msg, duration_ms: Date.now() - t0 }, { status: 500 })
  }
}
