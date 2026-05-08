import PDFDocument from "pdfkit"
import fs from "fs"

const APP_URL = "https://dpo-app-self.vercel.app"
const PASSWORD = "mercosur2026"

const instructores = [
  { user: "ealtube", nombre: "E. Altube" },
  { user: "sroselli", nombre: "S. Roselli" },
  { user: "eteves", nombre: "E. Teves" },
  { user: "fperez", nombre: "F. Perez" },
  { user: "posteneros", nombre: "P. Osteneros" },
  { user: "cmorel", nombre: "C. Morel" },
  { user: "davaro", nombre: "D. Avaro" },
]

for (const inst of instructores) {
  const doc = new PDFDocument({ size: "A4", margin: 50 })
  const outputPath = `/root/credenciales-instructores/${inst.user}.pdf`
  doc.pipe(fs.createWriteStream(outputPath))

  const pageW = doc.page.width
  const m = 50

  // ─── Header ───
  doc.moveTo(m, 70).lineTo(pageW - m, 70).lineWidth(3).strokeColor("#1E3A5F").stroke()

  doc.fontSize(13).fillColor("#64748B").text("MERCOSUR REGION PAMPEANA", m, 90, { align: "center" })
  doc.fontSize(26).fillColor("#0F172A").text("DPO - Portal de Capacitaciones", m, 115, { align: "center" })
  doc.fontSize(12).fillColor("#64748B").text("Guia para Instructores", m, 150, { align: "center" })

  doc.moveTo(150, 180).lineTo(pageW - 150, 180).lineWidth(1).strokeColor("#CBD5E1").stroke()

  // ─── Nombre ───
  doc.fontSize(22).fillColor("#1E3A5F").text(inst.nombre, m, 200, { align: "center" })

  // ─── Credenciales box ───
  const boxX = 80
  const boxY = 245
  const boxW = pageW - 160
  doc.roundedRect(boxX, boxY, boxW, 120, 10).fillColor("#F1F5F9").fill()
  doc.roundedRect(boxX, boxY, boxW, 120, 10).lineWidth(1).strokeColor("#E2E8F0").stroke()

  doc.fontSize(10).fillColor("#94A3B8").text("DIRECCION WEB", boxX + 25, boxY + 15)
  doc.fontSize(14).fillColor("#1E3A5F").text(APP_URL, boxX + 25, boxY + 30)

  doc.moveTo(boxX + 25, boxY + 52).lineTo(boxX + boxW - 25, boxY + 52).lineWidth(0.5).strokeColor("#E2E8F0").stroke()

  doc.fontSize(10).fillColor("#94A3B8").text("USUARIO", boxX + 25, boxY + 62)
  doc.fontSize(14).fillColor("#0F172A").text(`${inst.user}@mercosur.local`, boxX + 25, boxY + 77)

  doc.fontSize(10).fillColor("#94A3B8").text("CONTRASENA", boxX + 280, boxY + 62)
  doc.fontSize(14).fillColor("#0F172A").text(PASSWORD, boxX + 280, boxY + 77)

  // ─── Tutorial ───
  let y = boxY + 145

  doc.fontSize(15).fillColor("#1E3A5F").text("Como usar el sistema", m, y)
  y += 30

  const steps = [
    {
      title: "1. Ingresar al sistema",
      text: `Abri el navegador y entra a ${APP_URL}\nIngresa tu usuario y contrasena.`,
    },
    {
      title: "2. Ir a Capacitaciones",
      text: "En el menu lateral (sidebar) hace click en 'Capacitaciones'.\nVas a ver la lista de todas las capacitaciones cargadas.\nPodes filtrar por pilar o por estado.",
    },
    {
      title: "3. Entrar a una capacitacion",
      text: "Hace click en la capacitacion que vas a dar.\nAdentro vas a ver los datos, la lista de asistentes y la seccion de preguntas del examen.",
    },
    {
      title: "4. Editar la fecha",
      text: "En el detalle de la capacitacion, podes cambiar la fecha haciendo click en el campo de fecha.",
    },
    {
      title: "5. Generar el examen con IA",
      text: 'En la seccion "Preguntas del Examen", hace click en "Generar con IA".\nSubi el material (PDF o DOCX) de la capacitacion.\nEl sistema va a leer el documento y generar automaticamente 10 preguntas de multiple choice con las respuestas correctas.\nTambien podes agregar preguntas manualmente con el boton "Manual".',
    },
    {
      title: "6. Agregar asistentes",
      text: 'Hace click en "Agregar" en la seccion de Asistentes.\nPodes agregar todos los empleados de una vez o seleccionar algunos.',
    },
    {
      title: "7. Tomar asistencia y cargar notas",
      text: "Marca la casilla de presente para cada empleado que asistio.\nCarga la nota (0-100) en el campo correspondiente.\nEl sistema calcula automaticamente si aprobo (>=60%) o desaprobo.",
    },
    {
      title: "8. Los empleados rinden el examen",
      text: "Cada empleado entra con su usuario (documento) al sistema.\nVe sus capacitaciones pendientes y hace click en 'Realizar examen'.\nResponde las preguntas y el sistema calcula la nota y marca la asistencia automaticamente.",
    },
  ]

  for (const step of steps) {
    // Check if we need a new page
    if (y > 700) {
      doc.addPage()
      y = 50
    }

    doc.fontSize(11).fillColor("#1E3A5F").text(step.title, m + 10, y, { underline: false })
    y += 16
    doc.fontSize(9.5).fillColor("#475569").text(step.text, m + 20, y, { width: pageW - 140, lineGap: 3 })
    y = doc.y + 12
  }

  // ─── Footer ───
  doc.moveTo(m, doc.page.height - 70).lineTo(pageW - m, doc.page.height - 70).lineWidth(1).strokeColor("#CBD5E1").stroke()
  doc.fontSize(8).fillColor("#94A3B8").text(
    "Mercosur Region Pampeana - Sistema DPO - Documento confidencial",
    m, doc.page.height - 55, { align: "center" }
  )

  doc.end()
  console.log(`OK  ${outputPath}`)
}

console.log(`\n${instructores.length} PDFs generados en /root/credenciales-instructores/`)
