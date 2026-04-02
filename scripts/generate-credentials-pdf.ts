/**
 * Genera un PDF con credenciales de acceso para cada empleado
 * Incluye QR al sistema, legajo y DNI
 *
 * Usage: npx tsx scripts/generate-credentials-pdf.ts
 */

import PDFDocument from "pdfkit"
import QRCode from "qrcode"
import fs from "fs"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL = "https://dpo-app-self.vercel.app/login"

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // Fetch empleados
  const { data: empleados, error } = await supabase
    .from("empleados")
    .select("legajo, nombre, numero_id, sector")
    .eq("activo", true)
    .order("nombre")

  if (error || !empleados) {
    console.error("Error:", error?.message)
    process.exit(1)
  }

  console.log(`Generating PDF for ${empleados.length} empleados...`)

  // Generate QR code as buffer
  const qrBuffer = await QRCode.toBuffer(APP_URL, {
    width: 150,
    margin: 1,
    color: { dark: "#0a1628", light: "#ffffff" },
  })

  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
  })

  const outputPath = "/root/dpo-app/credenciales-empleados.pdf"
  const stream = fs.createWriteStream(outputPath)
  doc.pipe(stream)

  const pageW = doc.page.width
  const pageH = doc.page.height
  const margin = 50

  // Title page
  doc.fontSize(28).font("Helvetica-Bold").fillColor("#0a1628")
  doc.text("DPO - Mercosur Región Pampeana", margin, 250, { align: "center", width: pageW - margin * 2 })
  doc.moveDown(1)
  doc.fontSize(18).font("Helvetica").fillColor("#64748b")
  doc.text("Credenciales de Acceso al Sistema", { align: "center", width: pageW - margin * 2 })
  doc.moveDown(2)
  doc.fontSize(12).fillColor("#94a3b8")
  doc.text(`${empleados.length} empleados • Generado: ${new Date().toLocaleDateString("es-AR")}`, { align: "center", width: pageW - margin * 2 })
  doc.moveDown(3)
  doc.image(qrBuffer, (pageW - 120) / 2, doc.y, { width: 120 })
  doc.moveDown(8)
  doc.fontSize(11).fillColor("#64748b")
  doc.text(APP_URL, { align: "center", width: pageW - margin * 2 })

  // One page per employee
  for (const emp of empleados) {
    doc.addPage()

    const centerX = pageW / 2

    // Card area
    const cardX = 60
    const cardY = 120
    const cardW = pageW - 120
    const cardH = 500

    // Card background
    doc.roundedRect(cardX, cardY, cardW, cardH, 12)
      .fillAndStroke("#f8fafc", "#e2e8f0")

    // Blue accent bar top
    doc.rect(cardX, cardY, cardW, 8).fill("#3b82f6")

    // Header
    doc.fontSize(10).font("Helvetica").fillColor("#94a3b8")
    doc.text("DPO — Mercosur Región Pampeana", cardX, cardY + 25, { align: "center", width: cardW })

    // Name
    doc.fontSize(26).font("Helvetica-Bold").fillColor("#0f172a")
    doc.text(emp.nombre, cardX, cardY + 55, { align: "center", width: cardW })

    // Sector badge
    const sectorText = (emp.sector ?? "Distribución").toUpperCase()
    const sectorColor = (emp.sector === "Depósito") ? "#6366f1" : "#f59e0b"
    doc.fontSize(11).font("Helvetica-Bold").fillColor(sectorColor)
    doc.text(sectorText, cardX, cardY + 95, { align: "center", width: cardW })

    // Divider
    doc.moveTo(cardX + 40, cardY + 120).lineTo(cardX + cardW - 40, cardY + 120).stroke("#e2e8f0")

    // QR centered
    const qrSize = 150
    doc.image(qrBuffer, centerX - qrSize / 2, cardY + 140, { width: qrSize })

    // URL below QR
    doc.fontSize(9).font("Helvetica").fillColor("#94a3b8")
    doc.text("Escaneá el QR o ingresá a:", cardX, cardY + 300, { align: "center", width: cardW })
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#3b82f6")
    doc.text(APP_URL, cardX, cardY + 315, { align: "center", width: cardW })

    // Divider
    doc.moveTo(cardX + 40, cardY + 345).lineTo(cardX + cardW - 40, cardY + 345).stroke("#e2e8f0")

    // Credentials side by side
    const leftCol = cardX + 60
    const rightCol = centerX + 30

    doc.fontSize(11).font("Helvetica").fillColor("#64748b")
    doc.text("LEGAJO (usuario)", leftCol, cardY + 365)
    doc.fontSize(36).font("Helvetica-Bold").fillColor("#0f172a")
    doc.text(String(emp.legajo), leftCol, cardY + 385)

    doc.fontSize(11).font("Helvetica").fillColor("#64748b")
    doc.text("DNI (contraseña)", rightCol, cardY + 365)
    doc.fontSize(36).font("Helvetica-Bold").fillColor("#0f172a")
    doc.text(emp.numero_id, rightCol, cardY + 385)

    // Footer instruction
    doc.fontSize(9).font("Helvetica").fillColor("#94a3b8")
    doc.text("Ingresá con tu legajo como usuario y tu DNI como contraseña", cardX, cardY + 450, { align: "center", width: cardW })
  }

  doc.end()

  await new Promise<void>((resolve) => stream.on("finish", resolve))
  console.log(`✅ PDF generado: ${outputPath}`)
  console.log(`   ${empleados.length} credenciales — 1 por página`)
}

main().catch(console.error)
