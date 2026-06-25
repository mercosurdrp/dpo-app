/**
 * Envío de email vía la API REST de Resend (https://resend.com).
 *
 * No agrega dependencias: usa `fetch` contra el endpoint de Resend.
 * Si falta RESEND_API_KEY el envío es un no-op controlado (devuelve
 * { ok:false, skipped:true }) para que las features que mandan mail
 * sigan funcionando aunque todavía no esté configurado.
 *
 * Variables de entorno:
 *   RESEND_API_KEY    API key de Resend (server-only).
 *   RESEND_FROM       Remitente por defecto. En modo prueba Resend solo
 *                     entrega a tu propia casilla; usa onboarding@resend.dev
 *                     hasta verificar un dominio propio.
 */

export interface EmailAdjunto {
  filename: string
  /** Contenido en base64 (sin el prefijo data:). */
  content: string
}

export interface EnviarEmailInput {
  to: string[]
  cc?: string[]
  subject: string
  html: string
  text?: string
  attachments?: EmailAdjunto[]
  /** Sobrescribe el remitente por defecto. */
  from?: string
}

export type EnviarEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string }

const DEFAULT_FROM = process.env.RESEND_FROM ?? "Mercosur Gastos <onboarding@resend.dev>"

/** Parsea una lista de correos separados por coma o punto y coma. */
export function parseEmailList(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter((s) => s.includes("@"))
}

export async function enviarEmail(input: EnviarEmailInput): Promise<EnviarEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, skipped: true, reason: "RESEND_API_KEY no configurada" }
  }
  if (!input.to.length) {
    return { ok: false, skipped: true, reason: "Sin destinatarios (GASTOS_MAIL_TO vacío)" }
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from ?? DEFAULT_FROM,
        to: input.to,
        cc: input.cc?.length ? input.cc : undefined,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.length
          ? input.attachments.map((a) => ({ filename: a.filename, content: a.content }))
          : undefined,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` }
    }

    const data = (await res.json().catch(() => null)) as { id?: string } | null
    return { ok: true, id: data?.id ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red enviando email" }
  }
}
