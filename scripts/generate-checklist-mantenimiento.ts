import PDFDocument from "pdfkit"
import fs from "fs"

interface CheckItem {
  numero: string
  pregunta: string
  verificacion: string
  peso: number
}

interface Seccion {
  numero: string
  titulo: string
  categoria: string
  items: CheckItem[]
}

const secciones: Seccion[] = [
  {
    numero: "1", titulo: "GESTION DE AREAS Y EQUIPAMIENTOS CRITICOS", categoria: "FUNDAMENTOS",
    items: [
      { numero: "1.1", pregunta: "Las estructuras del techo estan en buenas condiciones?", verificacion: "Estructura sin anomalias (oxido, colision, danos) que pongan en riesgo", peso: 1 },
      { numero: "1.2", pregunta: "Estan en buen estado las tejas (chapas) y canaletas de los techos?", verificacion: "Tejas y canaletas libres de danos, goteras y obstrucciones", peso: 1 },
      { numero: "1.3", pregunta: "Estan en perfecto funcionamiento los elementos criticos de seguridad?", verificacion: "Funcionalidad de elementos en sitio + entrevista a usuarios", peso: 1 },
      { numero: "1.4", pregunta: "Estan en perfecto funcionamiento los elementos criticos de calidad? (Camara fria, etc)", verificacion: "Funcionalidad de camaras frias, equipos de calidad", peso: 1 },
      { numero: "1.5", pregunta: "Estan en perfecto funcionamiento los elementos de seguridad criticos? (bloqueos, etc)", verificacion: "Funcionalidad de bloqueos, autoelevadores, equipos de seguridad", peso: 1 },
      { numero: "1.6", pregunta: "La unidad cuenta con un plan de contingencia para casos criticos?", verificacion: "Contratos de agua, generadores, cortes de energia", peso: 3 },
      { numero: "1.7", pregunta: "La unidad ejecuta una rutina establecida (recorridas y reuniones) con plan de accion?", verificacion: "Tabla de gestion en Matinal/Diaria actualizada", peso: 3 },
    ],
  },
  {
    numero: "2", titulo: "GESTION DE PLANO DE TRAFICO", categoria: "FUNDAMENTOS",
    items: [
      { numero: "2.1", pregunta: "Las rejas y barandas protectoras estan en buenas condiciones?", verificacion: "Condiciones de segregaciones, barandas y portones", peso: 3 },
      { numero: "2.2", pregunta: "Estan en buen estado las zonas de segregacion de picking, espera de conductores, etc?", verificacion: "Condiciones de las areas, perfectas condiciones de uso", peso: 3 },
      { numero: "2.3", pregunta: "Estan en buen estado la pintura de sendas peatonales, separacion de estibas, senalizacion?", verificacion: "Cronograma de pintura nueva y mantenimiento de senaletica", peso: 1 },
    ],
  },
  {
    numero: "3", titulo: "CONSERVACION CIVIL", categoria: "FUNDAMENTOS",
    items: [
      { numero: "3.1", pregunta: "Las areas de almacenamiento, circulacion y areas administrativas estan en buen estado?", verificacion: "Recorrido por areas verificando estado general", peso: 1 },
      { numero: "3.2", pregunta: "Los techos y revestimientos estan libres de grietas, huecos, desplazamientos?", verificacion: "Verificar en sitio + convocatorias con plan de accion", peso: 1 },
      { numero: "3.3", pregunta: "El muro perimetral esta libre de huecos, grietas y con pintura en buen estado?", verificacion: "Anomalias (huecos, concertinas, iluminacion)", peso: 3 },
      { numero: "3.4", pregunta: "Los revestimientos de paredes de salas y accesos estan libres de huecos, grietas?", verificacion: "Pintura, moho, agujeros, grietas", peso: 3 },
      { numero: "3.5", pregunta: "Estan en perfecto estado las puertas y ventanas de las areas?", verificacion: "Pestillos, cristales, bisagras, marcos", peso: 3 },
    ],
  },
  {
    numero: "4", titulo: "ELECTRICIDAD", categoria: "FUNDAMENTOS",
    items: [
      { numero: "4.1", pregunta: "Se encuentran en buen estado el tablero principal, paneles de energia, infraestructura?", verificacion: "Informe tecnico valido + condiciones de infraestructura", peso: 1 },
      { numero: "4.2", pregunta: "La iluminacion interna y externa esta en perfecto estado de funcionamiento?", verificacion: "Recorrido verificando lamparas, reflectores", peso: 1 },
      { numero: "4.3", pregunta: "Estan en buen estado las instalaciones electricas? (enchufes, redes, ventiladores)", verificacion: "Recorrido verificando equipos electricos", peso: 3 },
    ],
  },
  {
    numero: "5", titulo: "HIDRAULICA, AREAS HUMEDAS", categoria: "FUNDAMENTOS",
    items: [
      { numero: "5.1", pregunta: "Estan en perfecto estado los banos, vestuarios y comedores?", verificacion: "Verificar 6 items: grifos, inodoros, duchas, espejos, azulejos, ventilacion", peso: 1 },
      { numero: "5.2", pregunta: "La unidad cuenta con registro de limpieza y mantenimiento de desagues y rejillas?", verificacion: "Cronograma estandar de limpieza y mantenimiento", peso: 3 },
      { numero: "5.3", pregunta: "El deposito de agua potable se encuentra en perfectas condiciones?", verificacion: "Plan de abastecimiento, informe controlado, registros", peso: 3 },
    ],
  },
  {
    numero: "6", titulo: "MANTENIMIENTO PREVENTIVO", categoria: "GESTION PARA SOSTENER",
    items: [
      { numero: "6.1", pregunta: "La unidad cuenta con un plan de mantenimiento preventivo (frecuencia y actividades)?", verificacion: "Plan de mantenimiento + equipos criticos: generadores, puertas, camaras", peso: 3 },
      { numero: "6.2", pregunta: "La unidad utiliza el aprendizaje del correctivo para actualizar el preventivo?", verificacion: "Listado de correctivo con principales ocurrencias", peso: 3 },
    ],
  },
  {
    numero: "7", titulo: "GESTION DE COSTOS DE MANTENIMIENTO", categoria: "GESTION PARA SOSTENER",
    items: [
      { numero: "7.1", pregunta: "Los mantenimientos recurrentes cuentan con contrato y seguimiento?", verificacion: "Contratos de servicios aprobados y con seguimiento", peso: 3 },
      { numero: "7.2", pregunta: "Existe control y estratificacion de los mayores gastos por area/equipo/servicio?", verificacion: "Control con historial minimo 6 meses + Plan de accion", peso: 3 },
      { numero: "7.3", pregunta: "La unidad cuenta con un paquete de gestion de mantenimiento?", verificacion: "Monitoreo de resultado Real vs Objetivo", peso: 3 },
      { numero: "7.4", pregunta: "La unidad cuenta con areas internas disponibles para terceros? Tiene evidencia?", verificacion: "Contrato de areas para terceros, cobro de gastos", peso: 3 },
      { numero: "7.5", pregunta: "La unidad cuenta con un proceso de adquisicion de equipamientos y repuestos?", verificacion: "Control de contratacion y adquisicion <= 30 dias", peso: 3 },
      { numero: "7.6", pregunta: "La unidad posee un proceso definido para el planeamiento del presupuesto de obras?", verificacion: "Presupuestos estandarizados con cotizacion y prospeccion", peso: 3 },
    ],
  },
  {
    numero: "8", titulo: "GESTION DE ORDENES DE SERVICIO", categoria: "GESTION PARA SOSTENER",
    items: [
      { numero: "8.1", pregunta: "Existe un flujo definido y conocido para la herramienta de apertura de ordenes?", verificacion: "Disponibilidad de herramienta y uso (vision 6 meses)", peso: 3 },
      { numero: "8.2", pregunta: "La unidad garantiza la gestion de las ordenes de servicio (correctivas y preventivas)?", verificacion: "Planilla de seguimiento + reunion con PA", peso: 3 },
      { numero: "8.3", pregunta: "La unidad lleva controles con los proveedores de servicios?", verificacion: "Acta de reunion con desglose de actividades", peso: 1 },
    ],
  },
  {
    numero: "9", titulo: "NIVEL DE SERVICIO", categoria: "GESTION PARA MEJORAR",
    items: [
      { numero: "9.1", pregunta: "La unidad monitorea las encuestas de satisfaccion de mantenimiento?", verificacion: "Herramienta de analisis del nivel de servicio", peso: 1 },
      { numero: "9.2", pregunta: "La unidad garantiza los llamados de mantenimiento cerrados en plazo?", verificacion: "Estratificacion de llamadas + entrevista con clientes", peso: 3 },
      { numero: "9.3", pregunta: "La unidad cuenta con un plan efectivo para comunicar obras y mantenimiento?", verificacion: "Acta de reunion de inicio de actividades", peso: 3 },
      { numero: "9.4", pregunta: "Fue realizado algun benchmark de proceso o mejores practicas con otra operacion?", verificacion: "Proceso de busqueda e intercambio de mejores practicas", peso: 1 },
    ],
  },
]

const doc = new PDFDocument({ size: "A4", margin: 40 })
const outputPath = "/root/fausto/Checklist_Mantenimiento_Mercosur.pdf"
doc.pipe(fs.createWriteStream(outputPath))

const pageW = doc.page.width
const m = 40
const contentW = pageW - m * 2

// ─── PAGE 1: Cover ───
doc.moveTo(m, 60).lineTo(pageW - m, 60).lineWidth(3).strokeColor("#1E3A5F").stroke()
doc.fontSize(13).fillColor("#64748B").text("MERCOSUR REGION PAMPEANA", m, 80, { align: "center" })
doc.fontSize(24).fillColor("#0F172A").text("Checklist Global de Mantenimiento", m, 110, { align: "center" })
doc.fontSize(11).fillColor("#64748B").text("Formulario de Recorrida e Inspeccion", m, 145, { align: "center" })

doc.moveTo(150, 175).lineTo(pageW - 150, 175).lineWidth(1).strokeColor("#CBD5E1").stroke()

// Header fields
let y = 200
const fieldH = 30
const fields = [
  ["Fecha de inspeccion:", ""],
  ["Inspector:", ""],
  ["Unidad / Centro:", ""],
]
for (const [label] of fields) {
  doc.fontSize(10).fillColor("#1E3A5F").text(label, m + 10, y + 8)
  doc.roundedRect(m + 160, y, contentW - 170, fieldH, 4).lineWidth(0.5).strokeColor("#CBD5E1").stroke()
  y += fieldH + 8
}

// Scoring guide
y += 20
doc.fontSize(12).fillColor("#1E3A5F").text("Criterio de Puntuacion", m, y)
y += 20
const scores = [
  { val: "3", desc: "Cumple totalmente - Sin anomalias, cronograma al dia", color: "#10B981" },
  { val: "1", desc: "Cumple parcialmente - Anomalias encontradas pero con plan de accion", color: "#F59E0B" },
  { val: "0", desc: "No cumple - No existe gestion o evidencias insuficientes", color: "#EF4444" },
  { val: "N/A", desc: "No aplica a esta unidad", color: "#94A3B8" },
]
for (const s of scores) {
  doc.roundedRect(m + 10, y, 35, 20, 4).fillColor(s.color).fill()
  doc.fontSize(11).fillColor("#FFFFFF").text(s.val, m + 10, y + 5, { width: 35, align: "center" })
  doc.fontSize(9.5).fillColor("#475569").text(s.desc, m + 55, y + 5)
  y += 28
}

// Summary table
y += 20
doc.fontSize(12).fillColor("#1E3A5F").text("Resumen por Seccion (completar al final)", m, y)
y += 20

// Table header
doc.rect(m, y, contentW, 22).fillColor("#1E3A5F").fill()
doc.fontSize(9).fillColor("#FFFFFF")
doc.text("#", m + 5, y + 6, { width: 25 })
doc.text("Seccion", m + 35, y + 6, { width: 250 })
doc.text("Puntaje", m + 320, y + 6, { width: 60, align: "center" })
doc.text("Max", m + 385, y + 6, { width: 50, align: "center" })
doc.text("%", m + 440, y + 6, { width: 40, align: "center" })
y += 22

for (const sec of secciones) {
  const maxPts = sec.items.reduce((sum, it) => sum + it.peso * 3, 0)
  const bg = y % 44 < 22 ? "#F8FAFC" : "#FFFFFF"
  doc.rect(m, y, contentW, 20).fillColor(bg).fill()
  doc.rect(m, y, contentW, 20).lineWidth(0.3).strokeColor("#E2E8F0").stroke()
  doc.fontSize(8.5).fillColor("#0F172A")
  doc.text(sec.numero, m + 5, y + 5, { width: 25 })
  doc.text(sec.titulo, m + 35, y + 5, { width: 280 })
  // Empty box for score
  doc.roundedRect(m + 330, y + 3, 40, 14, 2).lineWidth(0.5).strokeColor("#CBD5E1").stroke()
  doc.text(String(maxPts), m + 385, y + 5, { width: 50, align: "center" })
  doc.roundedRect(m + 445, y + 3, 30, 14, 2).lineWidth(0.5).strokeColor("#CBD5E1").stroke()
  y += 20
}

// ─── DETAIL PAGES ───
for (const sec of secciones) {
  doc.addPage()
  y = 40

  // Section header
  doc.rect(m, y, contentW, 28).fillColor("#1E3A5F").fill()
  doc.fontSize(12).fillColor("#FFFFFF").text(`${sec.numero}. ${sec.titulo}`, m + 10, y + 7)
  doc.fontSize(8).fillColor("#94A3B8").text(sec.categoria, pageW - m - 120, y + 10, { width: 110, align: "right" })
  y += 36

  for (const item of sec.items) {
    // Check if we need a new page
    if (y > 680) {
      doc.addPage()
      y = 40
      doc.rect(m, y, contentW, 22).fillColor("#F1F5F9").fill()
      doc.fontSize(9).fillColor("#64748B").text(`${sec.numero}. ${sec.titulo} (cont.)`, m + 10, y + 5)
      y += 28
    }

    // Question box
    const boxH = 110
    doc.roundedRect(m, y, contentW, boxH, 6).lineWidth(0.5).strokeColor("#E2E8F0").stroke()

    // Number + weight badge
    doc.roundedRect(m + 8, y + 8, 32, 18, 4).fillColor("#3B82F6").fill()
    doc.fontSize(9).fillColor("#FFFFFF").text(item.numero, m + 8, y + 12, { width: 32, align: "center" })

    // Weight
    doc.fontSize(7).fillColor("#94A3B8").text(`Peso: ${item.peso}`, m + 45, y + 12)

    // Question text
    doc.fontSize(9.5).fillColor("#0F172A").text(item.pregunta, m + 8, y + 32, { width: contentW - 100 })

    // Score boxes on the right
    const scoreBoxes = ["0", "1", "3", "N/A"]
    let sx = pageW - m - 85
    for (const sv of scoreBoxes) {
      doc.roundedRect(sx, y + 8, 18, 18, 3).lineWidth(0.5).strokeColor("#CBD5E1").stroke()
      doc.fontSize(7).fillColor("#94A3B8").text(sv, sx, y + 27, { width: 18, align: "center" })
      sx += 22
    }

    // Verification hint
    doc.fontSize(7.5).fillColor("#94A3B8").text("Verificar: " + item.verificacion, m + 8, y + 55, { width: contentW - 20 })

    // Observations line
    doc.fontSize(7.5).fillColor("#64748B").text("Observaciones:", m + 8, y + 78)
    doc.moveTo(m + 70, y + 86).lineTo(m + contentW - 10, y + 86).lineWidth(0.3).strokeColor("#CBD5E1").stroke()
    doc.fontSize(7.5).fillColor("#64748B").text("Plan de accion:", m + 8, y + 92)
    doc.moveTo(m + 70, y + 100).lineTo(m + contentW - 10, y + 100).lineWidth(0.3).strokeColor("#CBD5E1").stroke()

    y += boxH + 8
  }
}

// Footer on each page
const totalPages = doc.bufferedPageRange()
// Can't easily add footers retroactively in pdfkit, but we have them in the content

doc.end()

console.log(`PDF generado: ${outputPath}`)
console.log(`${secciones.length} secciones, ${secciones.reduce((s, sec) => s + sec.items.length, 0)} items de verificacion`)
