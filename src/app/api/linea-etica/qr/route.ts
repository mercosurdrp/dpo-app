export const maxDuration = 30
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import PDFDocument from "pdfkit"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  // Auth check — sólo autenticados pueden descargar
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const origin = request.nextUrl.origin
  const targetUrl = `${origin}/linea-etica`

  const qrBuffer = await QRCode.toBuffer(targetUrl, {
    width: 500,
    margin: 1,
    errorCorrectionLevel: "H",
    color: { dark: "#0F172A", light: "#FFFFFF" },
  })

  const doc = new PDFDocument({ size: "A4", margin: 40 })
  const chunks: Buffer[] = []
  doc.on("data", (c) => chunks.push(c as Buffer))
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  })

  const pageW = doc.page.width
  const m = 40

  // Header banda
  doc.rect(0, 0, pageW, 80).fill("#0F172A")
  doc
    .fillColor("#FFFFFF")
    .fontSize(24)
    .text("LÍNEA ÉTICA", m, 28, { align: "center", width: pageW - 2 * m })
  doc
    .fontSize(12)
    .fillColor("#94A3B8")
    .text("Mercosur Región Pampeana — canal de compliance", m, 58, {
      align: "center",
      width: pageW - 2 * m,
    })

  // Subtítulo
  doc
    .fillColor("#0F172A")
    .fontSize(16)
    .text("Reportá con total confidencialidad", m, 110, {
      align: "center",
      width: pageW - 2 * m,
    })
  doc
    .fontSize(11)
    .fillColor("#475569")
    .text(
      "Escaneá el código con la cámara de tu celular. La denuncia es anónima, no te pedimos datos.",
      m,
      135,
      { align: "center", width: pageW - 2 * m }
    )

  // QR grande centrado
  const qrSize = 360
  const qrX = (pageW - qrSize) / 2
  doc.image(qrBuffer, qrX, 180, { width: qrSize, height: qrSize })

  // URL debajo
  doc
    .fontSize(12)
    .fillColor("#0F172A")
    .text(targetUrl, m, 180 + qrSize + 20, {
      align: "center",
      width: pageW - 2 * m,
    })

  // Bloque "qué podés reportar"
  const bloqueY = 180 + qrSize + 60
  doc
    .fillColor("#0F172A")
    .fontSize(13)
    .text("¿Qué podés reportar?", m + 20, bloqueY, {
      width: pageW - 2 * (m + 20),
    })

  const items = [
    "Conductas indebidas o acoso",
    "Discriminación",
    "Corrupción, soborno o fraude",
    "Conflictos de interés",
    "Represalias",
  ]
  let y = bloqueY + 22
  doc.fontSize(11).fillColor("#334155")
  for (const it of items) {
    doc.text(`•  ${it}`, m + 30, y, { width: pageW - 2 * (m + 30) })
    y += 16
  }

  // Footer
  doc
    .fontSize(9)
    .fillColor("#94A3B8")
    .text(
      "Tu identidad no queda registrada salvo que elijas identificarte voluntariamente.",
      m,
      800,
      { align: "center", width: pageW - 2 * m }
    )

  doc.end()
  const pdfBuffer = await done

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="qr-linea-etica.pdf"',
      "Cache-Control": "no-store",
    },
  })
}
