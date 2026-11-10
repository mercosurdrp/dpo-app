export const maxDuration = 30
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib"
import { createClient } from "@/lib/supabase/server"
import { getRemito } from "@/actions/remitos-internos"
import type { RemitoInterno } from "@/types/remitos-internos"

/**
 * Remito interno imprimible: A4 con ORIGINAL (viaja con la carga) y DUPLICADO
 * (queda en origen). El QR abre el remito en dpo-app para confirmar la descarga.
 *   GET /api/remitos-internos/<id>/pdf
 */

// Helvetica estándar sólo codifica WinAnsi: lo que no entra se reemplaza.
const limpiar = (s: string) =>
  s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")

const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}
const fmtCant = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)

const A4: [number, number] = [595, 842]
const M = 40
const slate900 = rgb(0.06, 0.09, 0.16)
const slate500 = rgb(0.42, 0.45, 0.5)
const linea = rgb(0.8, 0.83, 0.87)

function cortar(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  const palabras = limpiar(texto).split(/\s+/)
  const out: string[] = []
  let actual = ""
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p
    if (font.widthOfTextAtSize(prueba, size) <= ancho) actual = prueba
    else {
      if (actual) out.push(actual)
      actual = p
    }
  }
  if (actual) out.push(actual)
  return out.length ? out : [""]
}

function dibujarCopia(
  pdf: PDFDocument,
  r: RemitoInterno,
  copia: string,
  qr: PDFImage,
  url: string,
  bold: PDFFont,
  regular: PDFFont,
) {
  const [W, H] = A4
  let page: PDFPage = pdf.addPage(A4)
  let hoja = 1
  const texto = (p: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color = slate900) =>
    p.drawText(limpiar(s), { x, y, size, font, color })

  // Encabezado
  texto(page, "REMITO INTERNO", M, H - M - 18, 20, bold)
  texto(page, `Viaje N° ${r.numero}`, M, H - M - 44, 26, bold)
  texto(page, r.operacion_nombre, M, H - M - 62, 11, regular, slate500)
  texto(page, `${copia}${r.anulado ? " - ANULADO" : ""}`, M, H - M - 78, 10, bold, r.anulado ? rgb(0.75, 0.1, 0.1) : slate500)

  const qrSize = 110
  page.drawImage(qr, { x: W - M - qrSize, y: H - M - qrSize, width: qrSize, height: qrSize })
  const leyenda = "Escanear al descargar"
  texto(page, leyenda, W - M - qrSize + (qrSize - regular.widthOfTextAtSize(leyenda, 8)) / 2, H - M - qrSize - 10, 8, regular, slate500)

  // Datos
  let y = H - M - 140
  const datos: [string, string][] = [
    ["Fecha", fmtFecha(r.fecha)],
    ["Camión", r.patente],
    ["Origen", r.origen ?? "-"],
    ["Chofer", r.chofer_nombre],
    ["Destino", r.destino ?? "-"],
    ["", ""],
  ]
  const colW = (W - 2 * M) / 2
  for (let i = 0; i < datos.length; i += 2) {
    for (const [j, [label, valor]] of [datos[i], datos[i + 1]].entries()) {
      if (!label) continue
      const x = M + j * colW
      texto(page, label, x, y + 12, 8, regular, slate500)
      texto(page, cortar(valor, bold, 12, colW - 10)[0], x, y, 12, bold)
    }
    y -= 32
  }

  // Tabla
  const colCant = W - M - 110
  const encabezadoTabla = (p: PDFPage, yy: number) => {
    p.drawRectangle({ x: M, y: yy - 6, width: W - 2 * M, height: 20, color: rgb(0.95, 0.96, 0.97) })
    texto(p, "#", M + 6, yy, 9, bold, slate500)
    texto(p, "Descripción", M + 30, yy, 9, bold, slate500)
    texto(p, "Cantidad", colCant + 10, yy, 9, bold, slate500)
    return yy - 22
  }
  y = encabezadoTabla(page, y)
  const pieReservado = 170
  for (const [idx, it] of r.items.entries()) {
    const lineas = cortar(it.descripcion, regular, 10, colCant - M - 36)
    const alto = lineas.length * 13 + 6
    if (y - alto < M + pieReservado) {
      texto(page, "Continúa en la hoja siguiente", M, y - 4, 9, regular, slate500)
      page = pdf.addPage(A4)
      hoja++
      texto(page, `REMITO INTERNO - Viaje N° ${r.numero} - ${copia} - hoja ${hoja}`, M, H - M - 12, 11, bold)
      y = encabezadoTabla(page, H - M - 40)
    }
    texto(page, String(idx + 1), M + 6, y, 10, regular, slate500)
    lineas.forEach((l, k) => texto(page, l, M + 30, y - k * 13, 10, regular))
    texto(page, `${fmtCant(it.cantidad)} ${it.unidad}`, colCant + 10, y, 10, bold)
    y -= alto
    page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.5, color: linea })
  }

  if (r.observaciones) {
    y -= 8
    texto(page, "Observaciones", M, y, 8, regular, slate500)
    for (const l of cortar(r.observaciones, regular, 10, W - 2 * M).slice(0, 4)) {
      y -= 13
      texto(page, l, M, y, 10, regular)
    }
  }

  // Pie: firmas y control de descarga
  const yF = M + 95
  const anchoF = (W - 2 * M - 40) / 3
  ;["Entregó (origen)", "Chofer", "Recibió (destino)"].forEach((label, i) => {
    const x = M + i * (anchoF + 20)
    page.drawLine({ start: { x, y: yF }, end: { x: x + anchoF, y: yF }, thickness: 0.7, color: slate500 })
    texto(page, label, x, yF - 12, 9, regular, slate500)
    texto(page, "Aclaración y hora:", x, yF - 40, 8, regular, slate500)
  })
  texto(page, "Descarga:   [  ] OK     [  ] Con novedad (detallar en la app)", M, M + 20, 10, bold)
  texto(page, url, M, M + 5, 7, regular, slate500)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { id } = await params
  const res = await getRemito(id)
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 500 })
  if (!res.data) return NextResponse.json({ error: "Remito inexistente" }, { status: 404 })
  const r = res.data

  const url = `${request.nextUrl.origin}/remitos-internos/${r.id}`
  const qrBuffer = await QRCode.toBuffer(url, { width: 400, margin: 1, errorCorrectionLevel: "M" })

  const pdf = await PDFDocument.create()
  pdf.setTitle(`Remito interno N° ${r.numero}`)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const qr = await pdf.embedPng(qrBuffer)

  dibujarCopia(pdf, r, "ORIGINAL - viaja con la carga", qr, url, bold, regular)
  dibujarCopia(pdf, r, "DUPLICADO - queda en origen", qr, url, bold, regular)

  const bytes = await pdf.save()
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="remito-interno-${r.numero}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
