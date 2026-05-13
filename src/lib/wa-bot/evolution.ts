/**
 * Cliente Evolution API — envía mensajes de WhatsApp.
 *
 * Evolution API v2 docs: https://doc.evolution-api.com/v2/api-reference
 *
 * Configurado vía env vars:
 *   EVOLUTION_BASE_URL   ej "https://mercosur-evolution-api.bdgnn2.easypanel.host"
 *   EVOLUTION_INSTANCE   ej "mercopedidos"
 *   EVOLUTION_API_KEY    Global API key (header `apikey`)
 */

const BASE = process.env.EVOLUTION_BASE_URL
const INSTANCE = process.env.EVOLUTION_INSTANCE
const API_KEY = process.env.EVOLUTION_API_KEY

export interface EvolutionSendResult {
  ok: boolean
  status: number
  body: unknown
}

/** Envía texto al número indicado (formato e.164 sin "+" ni "@s.whatsapp.net"). */
export async function sendText(phoneNumber: string, text: string): Promise<EvolutionSendResult> {
  if (!BASE || !INSTANCE || !API_KEY) {
    throw new Error("Evolution no configurado (EVOLUTION_BASE_URL/INSTANCE/API_KEY).")
  }
  const url = `${BASE.replace(/\/$/, "")}/message/sendText/${INSTANCE}`
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: API_KEY },
    body: JSON.stringify({ number: phoneNumber, text }),
  })
  const body = await r.json().catch(() => null)
  return { ok: r.ok, status: r.status, body }
}

/** Saca "@s.whatsapp.net" de un remoteJid de Evolution. */
export function jidToPhone(remoteJid: string | null | undefined): string | null {
  if (!remoteJid) return null
  const m = remoteJid.match(/^(\d{8,15})@/)
  return m ? m[1] : null
}

/** Extrae el texto de un message Evolution (varias formas posibles). */
export interface EvolutionMessage {
  conversation?: string
  extendedTextMessage?: { text?: string }
  imageMessage?: { caption?: string }
  videoMessage?: { caption?: string }
}

export function extractText(message: EvolutionMessage | undefined | null): string | null {
  if (!message) return null
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    null
  )
}
