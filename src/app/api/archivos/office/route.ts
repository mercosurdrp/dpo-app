import { NextRequest, NextResponse } from "next/server"
import { getProfile } from "@/lib/session"
import { docxAHtml, paginaVisor, xlsxAHtml } from "@/lib/office-html"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Visor propio de Excel y Word. Recibe la URL firmada del Storage (?src=) y el
// nombre original (?nombre=), convierte el archivo a HTML en el servidor y lo
// devuelve como página. Reemplaza al visor web de Microsoft
// (view.officeapps.live.com), que dejó de abrir nuestros archivos. PowerPoint y
// los .doc/.xls viejos no se convierten: se ofrece Descargar y el visor externo.

const MAX_BYTES = 25 * 1024 * 1024

function extensionDe(pathname: string): string {
  const m = pathname.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ""
}

function urlVisorOffice(url: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
}

export async function GET(req: NextRequest) {
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
  // Anti-SSRF: sólo el Storage de la Supabase de este tenant.
  let supabaseHost: string
  try {
    supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host
  } catch {
    return NextResponse.json({ error: "Config inválida" }, { status: 500 })
  }
  if (!supabaseHost || target.host !== supabaseHost) {
    return NextResponse.json({ error: "Host no permitido" }, { status: 403 })
  }

  const nombreParam = req.nextUrl.searchParams.get("nombre")
  const nombre =
    nombreParam ||
    decodeURIComponent(target.pathname.split("/").pop() ?? "archivo")
  const ext = extensionDe(nombre) || extensionDe(target.pathname)
  const urlDescarga = `/api/archivos/ver?src=${encodeURIComponent(src)}`

  const upstream = await fetch(target.toString())
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "No se pudo obtener el archivo" },
      { status: 502 },
    )
  }
  const buffer = await upstream.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.redirect(new URL(urlDescarga, req.nextUrl.origin))
  }

  try {
    let html: string
    if (ext === "xlsx" || ext === "xlsm" || ext === "xls" || ext === "csv") {
      html = paginaVisor(xlsxAHtml(buffer, nombre), urlDescarga)
    } else if (ext === "docx") {
      html = paginaVisor(await docxAHtml(buffer, nombre), urlDescarga)
    } else {
      // pptx, ppt, doc: sin conversor propio. Dejo Descargar + visor externo.
      html = paginaVisor(
        {
          titulo: nombre,
          cuerpo:
            '<p class="aviso">Este tipo de archivo no se puede previsualizar acá. Descargalo o probá con el visor de Microsoft.</p>',
          hojas: [],
        },
        urlDescarga,
        urlVisorOffice(src),
      )
    }
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=60",
        "X-Robots-Tag": "noindex",
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error convirtiendo"
    const html = paginaVisor(
      {
        titulo: nombre,
        cuerpo: `<p class="aviso">No se pudo mostrar el archivo (${msg}). Descargalo para abrirlo.</p>`,
        hojas: [],
      },
      urlDescarga,
      urlVisorOffice(src),
    )
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }
}
