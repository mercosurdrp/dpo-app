export const maxDuration = 30
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  // Auth check — sólo autenticados
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const origin = request.nextUrl.origin
  const targetUrl = `${origin}/linea-etica`

  // Generar QR como PNG
  const qrBuffer = await QRCode.toBuffer(targetUrl, {
    width: 600,
    margin: 1,
    errorCorrectionLevel: "H",
    color: { dark: "#0F172A", light: "#FFFFFF" },
  })

  // Construir PDF A4 (595 x 842 pt)
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842])
  const { width, height } = page.getSize()

  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const slate900 = rgb(0.06, 0.09, 0.16)
  const slate500 = rgb(0.42, 0.45, 0.5)
  const slate400 = rgb(0.58, 0.64, 0.72)

  // Banda header (80pt)
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width,
    height: 80,
    color: slate900,
  })
  const title = "LÍNEA ÉTICA"
  const titleW = bold.widthOfTextAtSize(title, 26)
  page.drawText(title, {
    x: (width - titleW) / 2,
    y: height - 50,
    size: 26,
    font: bold,
    color: rgb(1, 1, 1),
  })
  const empresa = process.env.NEXT_PUBLIC_EMPRESA_NOMBRE ?? "Mercosur Región Pampeana"
  const sub = `${empresa} — canal de compliance`
  const subW = regular.widthOfTextAtSize(sub, 11)
  page.drawText(sub, {
    x: (width - subW) / 2,
    y: height - 70,
    size: 11,
    font: regular,
    color: slate400,
  })

  // Subtítulo
  const h2 = "Reportá con total confidencialidad"
  const h2W = bold.widthOfTextAtSize(h2, 16)
  page.drawText(h2, {
    x: (width - h2W) / 2,
    y: height - 115,
    size: 16,
    font: bold,
    color: slate900,
  })
  const lead = "Escaneá el código con la cámara de tu celular."
  const leadW = regular.widthOfTextAtSize(lead, 11)
  page.drawText(lead, {
    x: (width - leadW) / 2,
    y: height - 135,
    size: 11,
    font: regular,
    color: slate500,
  })
  const lead2 = "La denuncia es anónima, no te pedimos datos."
  const lead2W = regular.widthOfTextAtSize(lead2, 11)
  page.drawText(lead2, {
    x: (width - lead2W) / 2,
    y: height - 150,
    size: 11,
    font: regular,
    color: slate500,
  })

  // QR (embed PNG) — 360pt centrado
  const qrImage = await pdfDoc.embedPng(qrBuffer)
  const qrSize = 360
  const qrX = (width - qrSize) / 2
  const qrY = height - 180 - qrSize
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize })

  // URL debajo del QR
  const urlW = regular.widthOfTextAtSize(targetUrl, 11)
  page.drawText(targetUrl, {
    x: (width - urlW) / 2,
    y: qrY - 20,
    size: 11,
    font: regular,
    color: slate900,
  })

  // Bloque "¿Qué podés reportar?"
  const bloqueY = qrY - 55
  page.drawText("¿Qué podés reportar?", {
    x: 60,
    y: bloqueY,
    size: 13,
    font: bold,
    color: slate900,
  })
  const items = [
    "Conductas indebidas o acoso",
    "Discriminación",
    "Corrupción, soborno o fraude",
    "Conflictos de interés",
    "Represalias",
  ]
  let y = bloqueY - 22
  for (const it of items) {
    page.drawText(`•  ${it}`, {
      x: 75,
      y,
      size: 11,
      font: regular,
      color: rgb(0.2, 0.25, 0.33),
    })
    y -= 16
  }

  // Footer
  const foot = "Tu identidad no queda registrada salvo que elijas identificarte voluntariamente."
  const footW = regular.widthOfTextAtSize(foot, 9)
  page.drawText(foot, {
    x: (width - footW) / 2,
    y: 40,
    size: 9,
    font: regular,
    color: slate400,
  })

  const pdfBytes = await pdfDoc.save()

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="qr-linea-etica.pdf"',
      "Cache-Control": "no-store",
    },
  })
}
