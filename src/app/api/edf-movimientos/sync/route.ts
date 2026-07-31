/**
 * Sync de movimientos de EQUIPOS DE FRÍO (COPOP/CTRCO) desde Chess, para el
 * SLA Ventas ↔ Logística `plan_equipos_frio`.
 *
 * Corre por cron diario y se puede disparar a mano (Bearer CRON_SECRET) o
 * desde la UI con sesión de admin/supervisor.
 *
 * Rango por defecto: últimos 7 días → hoy + 7 días hacia adelante. Los COPOP y
 * CTRCO se emiten con `fechaEntrega` FUTURA (el pedido se carga antes de que
 * salga el camión), así que la ventana mira para los dos lados.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  chessLogin,
  fetchEquiposFrio,
  syncEdfForDate,
  type ChessCredentials,
  type EdfSyncDayResult,
} from "@/lib/sync/edf-movimientos-sync"

const CHESS_BASE = process.env.CHESS_API_BASE_URL
const CHESS_USER = process.env.CHESS_API_USER
const CHESS_PASS = process.env.CHESS_API_PASS
const CRON_SECRET = process.env.CRON_SECRET

const ALLOWED_ROLES = ["admin", "supervisor"] as const

const DIAS_ATRAS = 7
const DIAS_ADELANTE = 7

export const maxDuration = 300

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("ping") === "1") {
    return NextResponse.json({ status: "ok", service: "edf-movimientos-sync" })
  }
  return handler(request)
}

export async function POST(request: NextRequest) {
  return handler(request)
}

async function handler(request: NextRequest) {
  const startedAt = Date.now()

  if (!CHESS_BASE || !CHESS_USER || !CHESS_PASS) {
    return NextResponse.json(
      {
        error:
          "Integración Chess no configurada en este deploy. Setear CHESS_API_BASE_URL, CHESS_API_USER y CHESS_API_PASS.",
      },
      { status: 503 },
    )
  }

  // ---- Auth: cron/bearer/api-key, o sesión con rol habilitado ----
  const authHeader = request.headers.get("authorization") ?? ""
  const apiKeyHeader = request.headers.get("x-api-key") ?? ""
  const bearerMatch = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  const apiKeyMatch = !!CRON_SECRET && apiKeyHeader === CRON_SECRET

  if (!bearerMatch && !apiKeyMatch) {
    if (authHeader.startsWith("Bearer ") || apiKeyHeader) {
      return NextResponse.json({ error: "CRON_SECRET inválido" }, { status: 401 })
    }
    const sessionClient = await createClient()
    const {
      data: { user },
    } = await sessionClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const { data: profile } = await sessionClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }
  }

  try {
    const params = request.nextUrl.searchParams
    const hoy = new Date()
    hoy.setUTCHours(0, 0, 0, 0)

    const desdeParam = params.get("fechaDesde")
    const hastaParam = params.get("fechaHasta")

    const desde = desdeParam ? new Date(`${desdeParam}T00:00:00Z`) : new Date(hoy)
    if (!desdeParam) desde.setUTCDate(desde.getUTCDate() - DIAS_ATRAS)
    const hasta = hastaParam ? new Date(`${hastaParam}T00:00:00Z`) : new Date(hoy)
    if (!hastaParam) hasta.setUTCDate(hasta.getUTCDate() + DIAS_ADELANTE)

    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 })
    }
    if (desde > hasta) {
      return NextResponse.json(
        { error: "fechaDesde no puede ser posterior a fechaHasta" },
        { status: 400 },
      )
    }

    const creds: ChessCredentials = {
      baseUrl: CHESS_BASE,
      user: CHESS_USER,
      pass: CHESS_PASS,
    }
    const sessionId = await chessLogin(creds)
    const equipos = await fetchEquiposFrio(creds, sessionId)
    if (equipos.size === 0) {
      return NextResponse.json(
        { error: "El maestro de Chess no devolvió equipos de frío" },
        { status: 502 },
      )
    }

    const supabase = createAdminClient()
    const resultados: EdfSyncDayResult[] = []
    // 🚨 Secuencial a propósito: Chess devuelve 403 ante llamadas concurrentes.
    for (let d = new Date(desde); d <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
      resultados.push(
        await syncEdfForDate(supabase, creds, sessionId, isoDia(d), equipos),
      )
    }

    const movimientos = resultados.reduce((a, r) => a + r.movimientos, 0)
    const enCamion = resultados.reduce((a, r) => a + r.enCamion, 0)
    const fueraDeVentana = resultados.reduce((a, r) => a + r.fueraDeVentana, 0)

    return NextResponse.json({
      ok: true,
      desde: isoDia(desde),
      hasta: isoDia(hasta),
      equiposEnMaestro: equipos.size,
      movimientos,
      enCamion,
      fueraDeVentana,
      duracionMs: Date.now() - startedAt,
      dias: resultados,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en el sync" },
      { status: 500 },
    )
  }
}
