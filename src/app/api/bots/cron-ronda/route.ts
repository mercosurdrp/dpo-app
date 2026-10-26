// Ronda de la mañana de los bots por pilar (ver src/lib/bots/ronda.ts).
//
// Auth: Bearer CRON_SECRET (Vercel lo inyecta en sus crons).
// Tenant: solo Pampeana; en Misiones sale 200 noop. Schedule en `vercel.json`
// (07:30 ART, lun-sáb: después de los syncs de Foxtrot, rechazos y GESCOM).
//
// Parámetros:
//   ?dry=1          no manda WhatsApp ni guarda planes (sí guarda la corrida)
//   ?bot=entrega    corre un solo bot
//   ?fecha=YYYY-MM-DD  "hoy" de referencia (para probar con otro día)
//
// Corrida manual:
//   curl -H "Authorization: Bearer $CRON_SECRET" ".../api/bots/cron-ronda?dry=1"

import { NextRequest, NextResponse } from "next/server"
import { IS_MISIONES } from "@/lib/empresa"
import { cargarBots, correrRonda } from "@/lib/bots/ronda"

const CRON_SECRET = process.env.CRON_SECRET?.trim()
export const maxDuration = 300
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "not-pampeana" })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const dry = sp.get("dry") === "1"
  const fecha = sp.get("fecha")
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "fecha inválida" }, { status: 400 })
  }

  try {
    const bots = await cargarBots(sp.get("bot") ?? undefined)
    const resultados = []
    for (const bot of bots) {
      try {
        const r = await correrRonda(bot, { dry, hoy: fecha ?? undefined })
        resultados.push({ ...r, contexto: sp.get("ver") === "1" ? r.contexto : undefined })
      } catch (e) {
        resultados.push({ bot: bot.key, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return NextResponse.json({ success: true, dry, resultados })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
