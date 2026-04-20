import QRCode from "qrcode"
import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

const APP_URL = process.env.APP_URL ?? "https://dpo-app-self.vercel.app"
const TARGET_URL = `${APP_URL}/linea-etica`
const OUTPUT_DIR = "/root/qr-linea-etica"

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  // 1) PNG del QR puro (grande, alta resolución)
  const pngPath = path.join(OUTPUT_DIR, "qr-linea-etica.png")
  await QRCode.toFile(pngPath, TARGET_URL, {
    width: 1200,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#0F172A", light: "#FFFFFF" },
  })
  console.log(`OK PNG -> ${pngPath}`)

  // 2) PDF A4 listo para imprimir con título + QR + leyenda
  const pdfPath = path.join(OUTPUT_DIR, "qr-linea-etica.pdf")
  const doc = new PDFDocument({ size: "A4", margin: 40 })
  doc.pipe(fs.createWriteStream(pdfPath))

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
  const qrBuf = await QRCode.toBuffer(TARGET_URL, {
    width: 500,
    margin: 1,
    errorCorrectionLevel: "H",
    color: { dark: "#0F172A", light: "#FFFFFF" },
  })
  const qrSize = 360
  const qrX = (pageW - qrSize) / 2
  doc.image(qrBuf, qrX, 180, { width: qrSize, height: qrSize })

  // URL debajo
  doc
    .fontSize(12)
    .fillColor("#0F172A")
    .text(TARGET_URL, m, 180 + qrSize + 20, {
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
  console.log(`OK PDF -> ${pdfPath}`)
  console.log(`\nTarget URL: ${TARGET_URL}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
