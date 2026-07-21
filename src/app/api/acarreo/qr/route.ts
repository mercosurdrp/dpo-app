export const maxDuration = 30
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@/lib/supabase/server"
import { ACARREO_ANUNCIO_URL } from "@/lib/acarreo-anuncio"

/**
 * QR para que el chofer se anuncie al llegar.
 *   GET /api/acarreo/qr            -> PNG inline (para mostrarlo en pantalla)
 *   GET /api/acarreo/qr?format=pdf -> cartel A4 descargable (para imprimir)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const targetUrl = ACARREO_ANUNCIO_URL

  // errorCorrectionLevel "H": el cartel vive en portería, aguanta roce y suciedad.
  const qrBuffer = await QRCode.toBuffer(targetUrl, {
    width: 600,
    margin: 1,
    errorCorrectionLevel: "H",
    color: { dark: "#0F172A", light: "#FFFFFF" },
  })

  if (request.nextUrl.searchParams.get("format") !== "pdf") {
    return new NextResponse(new Uint8Array(qrBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    })
  }

  // Cartel A4 (595 x 842 pt)
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842])
  const { width, height } = page.getSize()

  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const slate900 = rgb(0.06, 0.09, 0.16)
  const slate500 = rgb(0.42, 0.45, 0.5)
  const slate400 = rgb(0.58, 0.64, 0.72)

  const centrar = (texto: string, y: number, size: number, font: typeof bold, color = slate900) => {
    const w = font.widthOfTextAtSize(texto, size)
    page.drawText(texto, { x: (width - w) / 2, y, size, font, color })
  }

  // Banda header
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: slate900 })
  const titulo = "ANUNCIÁ TU LLEGADA"
  const tituloW = bold.widthOfTextAtSize(titulo, 26)
  page.drawText(titulo, {
    x: (width - tituloW) / 2,
    y: height - 50,
    size: 26,
    font: bold,
    color: rgb(1, 1, 1),
  })
  const empresa = process.env.NEXT_PUBLIC_EMPRESA_NOMBRE ?? "Mercosur Región Pampeana"
  const sub = `${empresa} — recepción de acarreos`
  const subW = regular.widthOfTextAtSize(sub, 11)
  page.drawText(sub, {
    x: (width - subW) / 2,
    y: height - 70,
    size: 11,
    font: regular,
    color: slate400,
  })

  centrar("Escaneá el código con la cámara del celular", height - 115, 16, bold)
  centrar("No hace falta instalar ninguna aplicación.", height - 135, 11, regular, slate500)

  // QR centrado
  const qrImage = await pdfDoc.embedPng(qrBuffer)
  const qrSize = 360
  const qrX = (width - qrSize) / 2
  const qrY = height - 180 - qrSize
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize })

  centrar(targetUrl, qrY - 20, 11, regular)

  // Pasos
  const bloqueY = qrY - 55
  page.drawText("¿Cómo me anuncio?", { x: 60, y: bloqueY, size: 13, font: bold, color: slate900 })
  const pasos = [
    "Apuntá la cámara del celular al código de arriba",
    "Cargá patente, transportista, origen y remito",
    "Tocá «Registrar arribo»",
    "Esperá el llamado dentro del camión",
  ]
  let y = bloqueY - 22
  for (const [i, paso] of pasos.entries()) {
    page.drawText(`${i + 1}.  ${paso}`, {
      x: 75,
      y,
      size: 11,
      font: regular,
      color: rgb(0.2, 0.25, 0.33),
    })
    y -= 16
  }

  const pie = "Anunciarse apenas llegás arranca el reloj de espera y ordena la fila de descarga."
  const pieW = regular.widthOfTextAtSize(pie, 9)
  page.drawText(pie, {
    x: (width - pieW) / 2,
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
      "Content-Disposition": 'attachment; filename="qr-anuncio-camiones.pdf"',
      "Cache-Control": "no-store",
    },
  })
}
