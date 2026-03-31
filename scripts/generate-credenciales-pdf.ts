import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

const empleados = [
  { legajo: 54, nombre: "ACOSTA ANGEL", doc: "33205114" },
  { legajo: 62, nombre: "ACOSTA JOEL EMANUEL", doc: "38849761" },
  { legajo: 48, nombre: "ARANCIBIA JULIO CESAR", doc: "35243859" },
  { legajo: 174, nombre: "AVALOS HUGO ALBERTO", doc: "30683337" },
  { legajo: 47, nombre: "CERBIN ADRIAN", doc: "22435580" },
  { legajo: 45, nombre: "CHURRUARIN OSCAR DANIEL", doc: "29259341" },
  { legajo: 28, nombre: "CORDONE LUIS DARIO", doc: "27937760" },
  { legajo: 29, nombre: "DAVALOS ARENA NICOLAS PABLO", doc: "94121351" },
  { legajo: 13, nombre: "ESCOBAR ROBERTO", doc: "22365794" },
  { legajo: 60, nombre: "FERNANDEZ LUCAS", doc: "27978965" },
  { legajo: 64, nombre: "FRIAS ANGEL ERMINDO", doc: "29095863" },
  { legajo: 55, nombre: "OLAZAGOITIA GABRIEL", doc: "34452286" },
  { legajo: 34, nombre: "RIVERO EZEQUIEL JORGE", doc: "32307039" },
  { legajo: 50, nombre: "RIVERO FEDERICO", doc: "36467534" },
  { legajo: 88, nombre: "RIVERO LAUREANO", doc: "28450149" },
  { legajo: 83, nombre: "RODRIGUEZ MARCELO", doc: "24667105" },
  { legajo: 35, nombre: "RODRIGUEZ WALTER GUSTAVO", doc: "25365516" },
  { legajo: 11, nombre: "SANDOVAL ANTONIO", doc: "20475105" },
  { legajo: 21, nombre: "SEQUEIRA HUMBERTO DAVID", doc: "32658032" },
  { legajo: 25, nombre: "SEQUEIRA WALTER DAMIAN", doc: "29772068" },
  { legajo: 140, nombre: "TEVES JORGE EZEQUIEL", doc: "37934203" },
  { legajo: 56, nombre: "TISEIRA HECTOR OSCAR", doc: "21488413" },
  { legajo: 18, nombre: "ZACARIAS JUAN CARLOS", doc: "25715965" },
  { legajo: 121, nombre: "ZACCO LORENZO", doc: "41071335" },
  { legajo: 65, nombre: "ZARATE RODOLFO ADRIAN", doc: "28673490" },
]

const APP_URL = "https://dpo-app-self.vercel.app"

const doc = new PDFDocument({ size: "A4", margin: 60 })
const outputPath = path.join("/root", "credenciales-capacitaciones.pdf")
const stream = fs.createWriteStream(outputPath)
doc.pipe(stream)

empleados.forEach((emp, idx) => {
  if (idx > 0) doc.addPage()

  const pageW = doc.page.width
  const centerX = pageW / 2

  // Top decoration line
  doc
    .moveTo(60, 80)
    .lineTo(pageW - 60, 80)
    .lineWidth(3)
    .strokeColor("#1E3A5F")
    .stroke()

  // Company header
  doc
    .fontSize(14)
    .fillColor("#64748B")
    .text("MERCOSUR REGION PAMPEANA", 60, 110, { align: "center" })

  doc
    .fontSize(28)
    .fillColor("#0F172A")
    .text("DPO - Capacitaciones", 60, 140, { align: "center" })

  doc
    .fontSize(12)
    .fillColor("#64748B")
    .text("Credenciales de acceso al sistema", 60, 180, { align: "center" })

  // Separator
  doc
    .moveTo(150, 220)
    .lineTo(pageW - 150, 220)
    .lineWidth(1)
    .strokeColor("#CBD5E1")
    .stroke()

  // Employee name - big and bold
  doc
    .fontSize(24)
    .fillColor("#1E3A5F")
    .text(emp.nombre, 60, 260, { align: "center" })

  // Legajo
  doc
    .fontSize(13)
    .fillColor("#94A3B8")
    .text(`Legajo: ${emp.legajo}`, 60, 300, { align: "center" })

  // Credential box
  const boxX = 100
  const boxY = 360
  const boxW = pageW - 200
  const boxH = 200

  // Box background
  doc
    .roundedRect(boxX, boxY, boxW, boxH, 12)
    .fillColor("#F1F5F9")
    .fill()

  // Box border
  doc
    .roundedRect(boxX, boxY, boxW, boxH, 12)
    .lineWidth(1)
    .strokeColor("#E2E8F0")
    .stroke()

  // URL
  const fieldStartY = boxY + 25
  doc
    .fontSize(11)
    .fillColor("#94A3B8")
    .text("DIRECCION WEB", boxX + 30, fieldStartY)

  doc
    .fontSize(15)
    .fillColor("#1E3A5F")
    .text(APP_URL, boxX + 30, fieldStartY + 20)

  // Separator inside box
  doc
    .moveTo(boxX + 30, fieldStartY + 55)
    .lineTo(boxX + boxW - 30, fieldStartY + 55)
    .lineWidth(0.5)
    .strokeColor("#E2E8F0")
    .stroke()

  // Usuario
  doc
    .fontSize(11)
    .fillColor("#94A3B8")
    .text("USUARIO (EMAIL)", boxX + 30, fieldStartY + 70)

  doc
    .fontSize(18)
    .fillColor("#0F172A")
    .text(`${emp.doc}@mercosur.local`, boxX + 30, fieldStartY + 92)

  // Separator
  doc
    .moveTo(boxX + 30, fieldStartY + 125)
    .lineTo(boxX + boxW - 30, fieldStartY + 125)
    .lineWidth(0.5)
    .strokeColor("#E2E8F0")
    .stroke()

  // Password
  doc
    .fontSize(11)
    .fillColor("#94A3B8")
    .text("CONTRASENA", boxX + 30, fieldStartY + 140)

  doc
    .fontSize(18)
    .fillColor("#0F172A")
    .text(emp.doc, boxX + 30, fieldStartY + 162)

  // Instructions
  doc
    .fontSize(12)
    .fillColor("#64748B")
    .text(
      "Instrucciones:",
      60,
      boxY + boxH + 40,
      { underline: true }
    )

  doc
    .fontSize(11)
    .fillColor("#64748B")
    .text(
      "1. Ingresa a la direccion web desde tu celular o computadora",
      80,
      boxY + boxH + 65
    )
    .text(
      "2. Escribe tu usuario (email) y contrasena",
      80,
      boxY + boxH + 85
    )
    .text(
      "3. Completa las capacitaciones asignadas",
      80,
      boxY + boxH + 105
    )
    .text(
      "4. No compartas tu contrasena con nadie",
      80,
      boxY + boxH + 125
    )

  // Bottom line
  doc
    .moveTo(60, doc.page.height - 80)
    .lineTo(pageW - 60, doc.page.height - 80)
    .lineWidth(1)
    .strokeColor("#CBD5E1")
    .stroke()

  // Footer
  doc
    .fontSize(9)
    .fillColor("#94A3B8")
    .text(
      "Mercosur Region Pampeana - Sistema DPO - Documento confidencial",
      60,
      doc.page.height - 60,
      { align: "center" }
    )
})

doc.end()

stream.on("finish", () => {
  console.log(`PDF generado: ${outputPath}`)
  console.log(`${empleados.length} paginas (una por empleado)`)
})
