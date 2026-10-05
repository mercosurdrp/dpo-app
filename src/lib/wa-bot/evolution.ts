/**
 * Cliente Evolution API — envía mensajes de WhatsApp.
 *
 * Evolution API v2 docs: https://doc.evolution-api.com/v2/api-reference
 *
 * Configurado vía env vars:
 *   EVOLUTION_BASE_URL   ej "https://evo.76-13-225-4.sslip.io" (VPS Hostinger)
 *   EVOLUTION_INSTANCE   ej "mercosur-pampeana"
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

/**
 * Resuelve el número real desde una key de mensaje Evolution.
 *
 * WhatsApp introdujo en 2026 el formato "@lid" (Linked Identity) en algunos
 * chats. Cuando llega un mensaje con remoteJid="<id>@lid", el número real
 * viene en `remoteJidAlt` (con formato normal "<number>@s.whatsapp.net").
 * Si no hay @lid, usamos remoteJid directo.
 */
export interface EvolutionKey {
  remoteJid?: string | null
  remoteJidAlt?: string | null
  participant?: string | null
  addressingMode?: string | null
}

export function resolvePhoneFromKey(key: EvolutionKey | null | undefined): string | null {
  if (!key) return null
  const isLid = key.remoteJid?.endsWith("@lid") || key.addressingMode === "lid"
  if (isLid && key.remoteJidAlt) {
    const phone = jidToPhone(key.remoteJidAlt)
    if (phone) return phone
  }
  return jidToPhone(key.remoteJid)
}

/** Extrae el texto de un message Evolution (varias formas posibles). */
export interface EvolutionMessage {
  conversation?: string
  extendedTextMessage?: { text?: string }
  imageMessage?: { caption?: string }
  videoMessage?: { caption?: string }
  audioMessage?: { seconds?: number; mimetype?: string }
}

export const esAudio = (message: EvolutionMessage | undefined | null) => !!message?.audioMessage

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

/**
 * Baja un adjunto (audio, imagen) de un mensaje recibido. Evolution lo
 * desencripta y lo devuelve en base64. null si falla: el que llama decide
 * qué responder.
 */
export async function getMediaBase64(
  messageId: string,
): Promise<{ base64: string; mimetype: string } | null> {
  if (!BASE || !INSTANCE || !API_KEY) return null
  const url = `${BASE.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${INSTANCE}`
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: API_KEY },
      body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!r.ok) return null
    const d = (await r.json()) as { base64?: string; mimetype?: string }
    return d.base64 ? { base64: d.base64, mimetype: d.mimetype ?? "audio/ogg" } : null
  } catch {
    return null
  }
}
