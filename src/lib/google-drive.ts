import crypto from "node:crypto"

// Cliente mínimo de Google Drive para el puente de edición online de la
// evidencia DPO: subir un archivo Office, hacerlo editable por link, bajarlo
// de vuelta y borrarlo. REST directo con un JWT de service account firmado
// con node:crypto — sin SDK de Google.
//
// Credencial: env GOOGLE_DRIVE_SA_JSON = JSON de la key del service account
// (crudo o en base64). El service account debe tener la Drive API habilitada
// en su proyecto; los archivos viven en SU drive, temporalmente, mientras
// dura la edición.

interface ServiceAccount {
  client_email: string
  private_key: string
}

function leerCredencial(): ServiceAccount {
  const raw = process.env.GOOGLE_DRIVE_SA_JSON
  if (!raw) {
    throw new Error(
      "Falta configurar la credencial de Google (env GOOGLE_DRIVE_SA_JSON)",
    )
  }
  const texto = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf-8")
  const sa = JSON.parse(texto) as ServiceAccount
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GOOGLE_DRIVE_SA_JSON no parece una key de service account")
  }
  return sa
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// Token cacheado por instancia (las lambdas viven varios minutos).
let tokenCache: { token: string; expira: number } | null = null

async function accessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expira - 60_000) {
    return tokenCache.token
  }
  const sa = leerCredencial()
  const ahora = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      iat: ahora,
      exp: ahora + 3600,
    }),
  )
  const firmador = crypto.createSign("RSA-SHA256")
  firmador.update(`${header}.${claims}`)
  const firma = b64url(firmador.sign(sa.private_key))
  const jwt = `${header}.${claims}.${firma}`

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    throw new Error(`Google OAuth falló (${res.status}): ${await res.text()}`)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    token: json.access_token,
    expira: Date.now() + json.expires_in * 1000,
  }
  return json.access_token
}

async function driveFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await accessToken()
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Drive API ${res.status}: ${await res.text()}`)
  }
  return res
}

/**
 * Sube el archivo TAL CUAL (sin convertir a formato Google): Docs/Sheets/
 * Slides lo editan en modo compatibilidad Office y el binario conserva su
 * formato .docx/.xlsx/.pptx, así la vuelta es byte-a-byte del mismo tipo.
 * Lo deja editable para cualquiera con el link y devuelve id + URL de edición.
 */
export async function driveSubirParaEditar(
  contenido: ArrayBuffer,
  nombre: string,
  mimeType: string,
): Promise<{ id: string; url: string }> {
  const boundary = `dpoapp${crypto.randomUUID()}`
  const meta = JSON.stringify({ name: nombre, mimeType })
  const cuerpo = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    Buffer.from(contenido),
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const subida = await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: cuerpo,
    },
  )
  const file = (await subida.json()) as { id: string; webViewLink: string }

  await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}/permissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "writer", type: "anyone" }),
    },
  )

  return { id: file.id, url: file.webViewLink }
}

/** Baja el binario actual del archivo (mismo formato con el que se subió). */
export async function driveDescargar(fileId: string): Promise<ArrayBuffer> {
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
  )
  return res.arrayBuffer()
}

/** Borra el archivo temporal del Drive del service account. Best-effort. */
export async function driveBorrar(fileId: string): Promise<void> {
  try {
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
    })
  } catch {
    // si ya no existe (o falla el delete), no bloquea el flujo
  }
}
