import crypto from "node:crypto"

// Cliente mínimo de Google Drive para el puente de edición online de la
// evidencia DPO: subir un archivo Office, hacerlo editable por link, bajarlo
// de vuelta y borrarlo. REST directo con node:crypto — sin SDK de Google.
//
// Credencial (una de las dos):
// - GOOGLE_DRIVE_OAUTH_JSON = {"client_id","client_secret","refresh_token"}
//   de una cuenta Gmail que autorizó a la app con scope drive.file (solo ve
//   los archivos que la propia app crea). Es el modo para cuentas gratuitas:
//   los archivos temporales viven en el Drive de esa cuenta.
// - GOOGLE_DRIVE_SA_JSON = key JSON de un service account. 🚨 Solo sirve con
//   Google Workspace (shared drives): los service accounts ya no tienen
//   cuota de almacenamiento propia y la subida a My Drive da 403.
// Ambas aceptan el JSON crudo o en base64.

interface ServiceAccount {
  client_email: string
  private_key: string
}

interface OAuthCred {
  client_id: string
  client_secret: string
  refresh_token: string
}

function parseEnvJson<T>(raw: string, nombre: string): T {
  const texto = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf-8")
  try {
    return JSON.parse(texto) as T
  } catch {
    throw new Error(`${nombre} no es un JSON válido`)
  }
}

function leerOAuth(): OAuthCred | null {
  const raw = process.env.GOOGLE_DRIVE_OAUTH_JSON
  if (!raw) return null
  const cred = parseEnvJson<OAuthCred>(raw, "GOOGLE_DRIVE_OAUTH_JSON")
  if (!cred.client_id || !cred.client_secret || !cred.refresh_token) {
    throw new Error(
      "GOOGLE_DRIVE_OAUTH_JSON debe tener client_id, client_secret y refresh_token",
    )
  }
  return cred
}

function leerServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_DRIVE_SA_JSON
  if (!raw) {
    throw new Error(
      "Falta configurar la credencial de Google (env GOOGLE_DRIVE_OAUTH_JSON o GOOGLE_DRIVE_SA_JSON)",
    )
  }
  const sa = parseEnvJson<ServiceAccount>(raw, "GOOGLE_DRIVE_SA_JSON")
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

  const oauth = leerOAuth()
  let body: URLSearchParams
  if (oauth) {
    body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: oauth.client_id,
      client_secret: oauth.client_secret,
      refresh_token: oauth.refresh_token,
    })
  } else {
    const sa = leerServiceAccount()
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
    body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${firma}`,
    })
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
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
