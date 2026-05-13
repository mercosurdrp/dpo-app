/**
 * Preview del bot — devuelve el mismo top que respondería por WhatsApp,
 * sin necesidad de tener Evolution conectado. Sirve para probar la lógica.
 *
 * Auth: solo sesión admin/supervisor.
 *
 * Uso:
 *   GET /api/wa-bot/preview?id_promotor=123
 *   GET /api/wa-bot/preview?id_promotor=123&fecha=2026-05-14
 *   GET /api/wa-bot/preview?phone=549115...   ← resuelve id_promotor desde bot_vendedores_wa
 *
 * Default fecha = mañana ART.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { chessLogin } from "@/lib/wa-bot/chess"
import { getTopPedidosForVendedor } from "@/lib/wa-bot/pedidos"
import { formatTopPedidosMessage } from "@/lib/wa-bot/format"

export const maxDuration = 60

const CHESS_BASE = process.env.CHESS_API_BASE_URL
const CHESS_USER = process.env.CHESS_API_USER
const CHESS_PASS = process.env.CHESS_API_PASS

const ALLOWED_ROLES = ["admin", "supervisor"] as const

export async function GET(request: NextRequest) {
  if (!CHESS_BASE || !CHESS_USER || !CHESS_PASS) {
    return NextResponse.json({ error: "Chess no configurado" }, { status: 503 })
  }

  // Auth
  const sessionClient = await createClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const { data: profile } = await sessionClient
    .from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  // Args
  const sp = request.nextUrl.searchParams
  let id_promotor = sp.get("id_promotor")?.trim() ?? null
  const phone = sp.get("phone")?.trim() ?? null
  const fecha = sp.get("fecha")?.trim() || defaultMañanaART()
  const topN = Number(sp.get("topN") ?? 5)

  const admin = createAdminClient()
  let vendedorNombre: string | null = null

  // Resolver id_promotor desde phone si vino sin id_promotor
  if (!id_promotor && phone) {
    const { data: v } = await admin
      .from("bot_vendedores_wa")
      .select("id_promotor, nombre")
      .eq("phone_number", phone)
      .eq("activo", true)
      .maybeSingle()
    if (!v) return NextResponse.json({ error: `Phone ${phone} no registrado` }, { status: 404 })
    id_promotor = v.id_promotor
    vendedorNombre = v.nombre
  } else if (id_promotor) {
    const { data: v } = await admin
      .from("bot_vendedores_wa")
      .select("nombre")
      .eq("id_promotor", id_promotor)
      .maybeSingle()
    vendedorNombre = v?.nombre ?? null
  }

  if (!id_promotor) {
    return NextResponse.json({ error: "Faltan id_promotor o phone" }, { status: 400 })
  }

  try {
    const sessionId = await chessLogin({
      baseUrl: CHESS_BASE, user: CHESS_USER, pass: CHESS_PASS,
    })
    const result = await getTopPedidosForVendedor(
      admin,
      { creds: { baseUrl: CHESS_BASE, user: CHESS_USER, pass: CHESS_PASS }, sessionId },
      { id_promotor, fecha, topN },
    )
    const mensaje = formatTopPedidosMessage(result, {
      vendedor_nombre: vendedorNombre ?? undefined,
    })
    return NextResponse.json({ result, mensaje, vendedor: vendedorNombre })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error preview"
    console.error(`[wa-bot:preview] ${msg}`)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** YYYY-MM-DD del día siguiente en ART. */
function defaultMañanaART(): string {
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(tomorrow)
  const y = parts.find((p) => p.type === "year")!.value
  const m = parts.find((p) => p.type === "month")!.value
  const d = parts.find((p) => p.type === "day")!.value
  return `${y}-${m}-${d}`
}
