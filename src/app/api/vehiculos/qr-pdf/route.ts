/**
 * Planilla de QR de la flota: una etiqueta por unidad para pegar en la cabina
 * (o en el autoelevador). Quien la escanea abre esa unidad en la app, donde
 * están sus OPL —las lecciones de un punto que aplican a su tipo— y su ficha.
 *
 * Por qué en papel y no en pantalla: la OPL sólo sirve si está donde se hace el
 * trabajo. El SOP completo no se abre parado al lado de la rueda; el QR sí.
 *
 * Alcanza a las tres familias que pidió la operación: camiones, unidades de
 * depósito (autoelevadores, zorras) y las de Team Run — o sea, todo el catálogo
 * activo, filtrable por sector o tipo con la query string.
 *
 * GET /api/vehiculos/qr-pdf            → todas las unidades activas
 * GET /api/vehiculos/qr-pdf?sector=deposito
 * GET /api/vehiculos/qr-pdf?tipo=camion
 */
import { NextRequest, NextResponse } from "next/server"
import PDFDocument from "pdfkit"
import QRCode from "qrcode"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { VEHICULO_TIPO_LABELS, type VehiculoTipo } from "@/types/database"
import type { Doc } from "../../rechazos/_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MARGEN = 28
/** 2 columnas × 3 filas: la etiqueta queda del tamaño de la palma, legible en cabina. */
const COLS = 2
const FILAS = 3

const TEXTO = "#0f172a"
const GRIS = "#64748b"
const LINEA = "#cbd5e1"

interface Unidad {
  dominio: string
  descripcion: string | null
  tipo: VehiculoTipo | null
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const supabase = await createClient()
  let query = supabase
    .from("catalogo_vehiculos")
    .select("dominio, descripcion, tipo, sector")
    .eq("active", true)
    .order("dominio")

  const sector = request.nextUrl.searchParams.get("sector")
  const tipo = request.nextUrl.searchParams.get("tipo")
  if (sector) query = query.eq("sector", sector)
  if (tipo) query = query.eq("tipo", tipo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unidades = (data || []) as Unidad[]
  if (unidades.length === 0) {
    return NextResponse.json({ error: "No hay unidades activas para imprimir" }, { status: 404 })
  }

  // El QR lleva a la unidad en la app. El origin sale del request para que el
  // mismo endpoint sirva en preview y en producción sin configurar nada.
  const base = request.nextUrl.origin
  const qrs = await Promise.all(
    unidades.map((u) =>
      QRCode.toBuffer(`${base}/vehiculos/${encodeURIComponent(u.dominio)}`, {
        width: 600,
        margin: 0,
        errorCorrectionLevel: "M",
      })
    )
  )

  const pdf = await render(unidades, qrs)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Flota-QR-Unidades.pdf"',
    },
  })
}

function render(unidades: Unidad[], qrs: Buffer[]): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGEN,
      autoFirstPage: false,
      info: {
        Title: "Flota — QR por unidad",
        Author: "Mercosur · dpo-app",
        Subject: "Etiqueta por unidad: abre sus OPL y su ficha (DPO Flota)",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    try {
      const ancho = (595.28 - MARGEN * 2) / COLS
      const alto = (841.89 - MARGEN * 2) / FILAS
      const porPagina = COLS * FILAS

      unidades.forEach((u, i) => {
        if (i % porPagina === 0) doc.addPage()
        const col = i % COLS
        const fila = Math.floor((i % porPagina) / COLS)
        const x = MARGEN + col * ancho
        const y = MARGEN + fila * alto
        etiqueta(doc, u, qrs[i], x, y, ancho, alto)
      })
      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}

function etiqueta(
  doc: Doc,
  u: Unidad,
  qr: Buffer,
  x: number,
  y: number,
  ancho: number,
  alto: number
) {
  const pad = 14
  // Marco punteado: es por dónde se corta.
  doc
    .save()
    .lineWidth(0.7)
    .dash(3, { space: 3 })
    .strokeColor(LINEA)
    .rect(x + 4, y + 4, ancho - 8, alto - 8)
    .stroke()
    .undash()
    .restore()

  const izq = x + pad + 4
  let cursor = y + pad + 8

  doc.fillColor(TEXTO).fontSize(24).text(u.dominio, izq, cursor, {
    width: ancho - pad * 2 - 8,
    lineBreak: false,
  })
  cursor += 28

  const subtitulo = [
    u.tipo ? VEHICULO_TIPO_LABELS[u.tipo] : null,
    u.descripcion?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ")
  if (subtitulo) {
    doc.fillColor(GRIS).fontSize(9).text(subtitulo, izq, cursor, {
      width: ancho - pad * 2 - 8,
      height: 22,
      ellipsis: true,
    })
  }

  // El QR centrado y lo más grande que entre: se escanea con el celular en la
  // mano, muchas veces con poca luz dentro de la cabina.
  const lado = Math.min(ancho - pad * 2 - 8, alto - 108)
  const qrX = x + (ancho - lado) / 2
  const qrY = cursor + 20
  doc.image(qr, qrX, qrY, { width: lado, height: lado })

  doc
    .fillColor(GRIS)
    .fontSize(8)
    .text("Escaneá para ver las OPL y la ficha de esta unidad", izq, qrY + lado + 8, {
      width: ancho - pad * 2 - 8,
      align: "center",
    })
}
