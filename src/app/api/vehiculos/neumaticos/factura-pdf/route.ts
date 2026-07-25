/**
 * Devuelve la factura adjunta de una cubierta como PDF.
 *
 * GET /api/vehiculos/neumaticos/factura-pdf?url=<url del adjunto>
 *
 * Las facturas se suben como foto (el compresor del proyecto las deja en JPEG) o
 * como PDF. Este endpoint sirve para bajarlas siempre en PDF: si ya es un PDF lo
 * pasa tal cual y si es una imagen la mete en una página A4 escalada.
 *
 * Solo acepta URLs del Storage de este Supabase: la URL viene del cliente, así
 * que sin ese filtro el endpoint sería un proxy abierto a cualquier host.
 */
import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { requireAuth } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TIPOS_IMAGEN = ["image/jpeg", "image/jpg", "image/png"]

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const url = req.nextUrl.searchParams.get("url")
  if (!url) return NextResponse.json({ error: "Falta la URL del adjunto" }, { status: 400 })

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) {
    return NextResponse.json({ error: "Storage no configurado" }, { status: 500 })
  }
  let permitida = false
  try {
    permitida = new URL(url).origin === new URL(base).origin
  } catch {
    permitida = false
  }
  if (!permitida) {
    return NextResponse.json({ error: "URL no permitida" }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch(url, { cache: "no-store" })
  } catch (err) {
    return NextResponse.json(
      { error: "No se pudo leer el adjunto", message: err instanceof Error ? err.message : "" },
      { status: 502 }
    )
  }
  if (!res.ok) {
    return NextResponse.json({ error: "No se pudo leer el adjunto" }, { status: res.status })
  }

  const tipo = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
  const buf = Buffer.from(await res.arrayBuffer())
  const nombreBase = decodeURIComponent(url.split("/").pop() ?? "factura").replace(
    /\.[a-z0-9]+$/i,
    ""
  )

  // Ya es PDF: se devuelve tal cual.
  if (tipo === "application/pdf" || /\.pdf$/i.test(url)) {
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nombreBase}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    })
  }

  if (!TIPOS_IMAGEN.includes(tipo)) {
    return NextResponse.json(
      { error: `No se puede convertir a PDF un adjunto de tipo ${tipo || "desconocido"}` },
      { status: 415 }
    )
  }

  let pdf: Buffer
  try {
    pdf = await imagenAPdf(buf, nombreBase)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombreBase}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

// Una página A4 con la imagen centrada y escalada para que entre completa.
function imagenAPdf(imagen: Buffer, titulo: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 24,
      info: { Title: titulo, Author: "Mercosur · dpo-app", Subject: "Factura de neumáticos" },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      const ancho = doc.page.width - 48
      const alto = doc.page.height - 48
      doc.image(imagen, 24, 24, { fit: [ancho, alto], align: "center", valign: "center" })
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
