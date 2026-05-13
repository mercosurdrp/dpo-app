/**
 * Webhook que Evolution llama cuando llega un mensaje al bot.
 *
 * Configurar en Evolution Manager UI:
 *   URL:    https://dpo-app-self.vercel.app/api/wa-bot/webhook
 *   Events: messages.upsert  (al menos)
 *   Webhook by events: off (queremos un solo endpoint)
 *
 * Auth — Evolution v2 envía el header `apikey` con el global API key.
 * Validamos eso para evitar invocaciones falsas. El endpoint está en el
 * allowlist del middleware (no requiere sesión Supabase).
 *
 * Flujo:
 *   1) Validar apikey
 *   2) Si event != "messages.upsert" o el msg es propio (fromMe) → ignorar
 *   3) Extraer texto + número del remitente
 *   4) Resolver vendedor por phone_number
 *   5) Llamar getTopPedidosForVendedor + formatTopPedidosMessage
 *   6) sendText vía Evolution
 *   7) Loguear conversación
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { chessLogin } from "@/lib/wa-bot/chess"
import { extractText, resolvePhoneFromKey, sendText, type EvolutionMessage } from "@/lib/wa-bot/evolution"
import { formatTopPedidosMessage } from "@/lib/wa-bot/format"
import { getTopPedidosForVendedor } from "@/lib/wa-bot/pedidos"

export const maxDuration = 60

const CHESS_BASE = process.env.CHESS_API_BASE_URL
const CHESS_USER = process.env.CHESS_API_USER
const CHESS_PASS = process.env.CHESS_API_PASS
const EVO_API_KEY = process.env.EVOLUTION_API_KEY

// Comandos que disparan el top
const TRIGGER_REGEX = /\b(pedidos|pedido|top|mañana|manana)\b/i

interface EvolutionWebhookPayload {
  event?: string
  instance?: string
  data?: {
    key?: {
      remoteJid?: string
      remoteJidAlt?: string                      // formato número real cuando remoteJid es @lid
      participant?: string
      addressingMode?: string                    // "lid" | "pn" | undefined
      fromMe?: boolean
      id?: string
    }
    message?: EvolutionMessage
    pushName?: string
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "wa-bot-webhook" })
}

export async function POST(request: NextRequest) {
  const t0 = Date.now()

  // 1) Validar apikey
  const apikeyHeader = request.headers.get("apikey") ?? ""
  if (!EVO_API_KEY || apikeyHeader !== EVO_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: EvolutionWebhookPayload
  try {
    payload = (await request.json()) as EvolutionWebhookPayload
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 })
  }

  // 2) Solo escuchamos messages.upsert; ignoramos mensajes propios
  if (payload.event !== "messages.upsert") {
    return NextResponse.json({ ignored: "event", event: payload.event })
  }
  const key = payload.data?.key
  if (!key || key.fromMe) {
    return NextResponse.json({ ignored: "fromMe_or_no_key" })
  }

  // 3) Extraer texto + número (soporta formato nuevo "@lid")
  const phone = resolvePhoneFromKey(key)
  const text = extractText(payload.data?.message)?.trim() ?? ""
  if (!phone) return NextResponse.json({ ignored: "no_phone" })

  const admin = createAdminClient()
  const baseLog = {
    phone_number: phone,
    mensaje_in: text || null,
    source: "webhook" as const,
  }

  // Si el mensaje no tiene texto, agradecer y salir
  if (!text) {
    await sendText(phone, "Hola! Mandame *pedidos* y te paso los más cargados para mañana.").catch(() => null)
    await admin.from("bot_conversaciones_log").insert({
      ...baseLog,
      mensaje_out: "Hola! ... (mensaje sin texto)",
      duration_ms: Date.now() - t0,
    })
    return NextResponse.json({ ok: true, action: "greeting_no_text" })
  }

  // 4) Resolver vendedor
  const { data: vendedor } = await admin
    .from("bot_vendedores_wa")
    .select("id_promotor, nombre, empresa, activo")
    .eq("phone_number", phone)
    .eq("activo", true)
    .maybeSingle()

  if (!vendedor) {
    const outMsg =
      "Hola! Tu número no está registrado como vendedor en el sistema. " +
      "Pedile a tu supervisor que te dé de alta."
    await sendText(phone, outMsg).catch(() => null)
    await admin.from("bot_conversaciones_log").insert({
      ...baseLog,
      mensaje_out: outMsg,
      error: "vendedor_no_registrado",
      duration_ms: Date.now() - t0,
    })
    return NextResponse.json({ ok: true, action: "vendor_not_found" })
  }

  // 5) Si el texto no contiene una palabra trigger → ayuda
  if (!TRIGGER_REGEX.test(text)) {
    const outMsg =
      `Hola ${vendedor.nombre}! 👋\n\n` +
      `Mandame *pedidos* y te paso el top 5 más cargado para mañana, así llamás a esos clientes y confirmás antes de la entrega.`
    await sendText(phone, outMsg).catch(() => null)
    await admin.from("bot_conversaciones_log").insert({
      ...baseLog,
      id_promotor: vendedor.id_promotor,
      mensaje_out: outMsg,
      duration_ms: Date.now() - t0,
    })
    return NextResponse.json({ ok: true, action: "help" })
  }

  // 6) Top pedidos para mañana
  if (!CHESS_BASE || !CHESS_USER || !CHESS_PASS) {
    return NextResponse.json({ error: "Chess no configurado" }, { status: 503 })
  }

  try {
    const sessionId = await chessLogin({
      baseUrl: CHESS_BASE, user: CHESS_USER, pass: CHESS_PASS,
    })
    const result = await getTopPedidosForVendedor(
      admin,
      { creds: { baseUrl: CHESS_BASE, user: CHESS_USER, pass: CHESS_PASS }, sessionId },
      { id_promotor: vendedor.id_promotor, fecha: tomorrowART(), topN: 5 },
    )
    const outMsg = formatTopPedidosMessage(result, { vendedor_nombre: vendedor.nombre })
    const send = await sendText(phone, outMsg)

    await admin.from("bot_conversaciones_log").insert({
      ...baseLog,
      id_promotor: vendedor.id_promotor,
      mensaje_out: outMsg,
      error: send.ok ? null : `evolution_send_status_${send.status}`,
      duration_ms: Date.now() - t0,
    })
    return NextResponse.json({ ok: true, sent: send.ok, fecha: result.fecha })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error procesando mensaje"
    console.error(`[wa-bot:webhook] fatal phone=${phone}: ${msg}`)
    await admin.from("bot_conversaciones_log").insert({
      ...baseLog,
      id_promotor: vendedor.id_promotor,
      mensaje_out: null,
      error: msg,
      duration_ms: Date.now() - t0,
    })
    // No le respondemos error al vendedor — mejor silencio que ruido confuso
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** YYYY-MM-DD del día siguiente en ART. */
function tomorrowART(): string {
  const t = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(t)
  return `${p.find(x => x.type === "year")!.value}-${p.find(x => x.type === "month")!.value}-${p.find(x => x.type === "day")!.value}`
}
