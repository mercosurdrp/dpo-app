import { NextRequest, NextResponse } from "next/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

// Visor de archivos subidos. Recibe la URL del Storage (?src=) y re-sirve el
// contenido con el Content-Type correcto inferido por extensión y
// Content-Disposition inline para imágenes y PDF. Así los archivos guardados
// como application/octet-stream se visualizan en el navegador en vez de
// forzar descarga. El resto se devuelve como attachment (descarga).

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
}
const INLINE = new Set(Object.keys(CONTENT_TYPES))

function extensionDe(pathname: string): string {
  const m = pathname.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ""
}

export async function GET(req: NextRequest) {
  // El middleware ya exige sesión; confirmamos por defensa en profundidad.
  const profile = await getProfile()
  if (!profile) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const src = req.nextUrl.searchParams.get("src")
  if (!src) {
    return NextResponse.json({ error: "Falta el parámetro src" }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(src)
  } catch {
    return NextResponse.json({ error: "src inválido" }, { status: 400 })
  }

  // Anti-SSRF: solo se permiten URLs del Storage de la Supabase de este tenant.
  let supabaseHost: string
  try {
    supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host
  } catch {
    return NextResponse.json({ error: "Config inválida" }, { status: 500 })
  }
  if (!supabaseHost || target.host !== supabaseHost) {
    return NextResponse.json({ error: "Host no permitido" }, { status: 403 })
  }

  const upstream = await fetch(target.toString())
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "No se pudo obtener el archivo" },
      { status: 502 },
    )
  }

  const ext = extensionDe(target.pathname)
  const contentType =
    CONTENT_TYPES[ext] ||
    upstream.headers.get("content-type") ||
    "application/octet-stream"
  const disposition = INLINE.has(ext) ? "inline" : "attachment"

  const body = await upstream.arrayBuffer()
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=60",
    },
  })
}
