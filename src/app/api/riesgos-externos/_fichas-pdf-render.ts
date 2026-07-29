/**
 * Dibujo del PDF de fichas de riesgo externo (una hoja por riesgo).
 * Vive fuera de route.ts para poder ejercitarlo sin levantar el server.
 */
import PDFDocument from "pdfkit"
import {
  CRITICIDAD_RIESGO_EXTERNO_LABELS,
  TIPO_RIESGO_EXTERNO_LABELS,
  formatMinutosDisparo,
  type CriticidadRiesgoExterno,
  type RiesgoExternoConfig,
  type RiesgoExternoContacto,
  type RiesgoExternoEscalamiento,
  type TipoRiesgoExterno,
} from "@/types/database"
import { formatTimestamp, type Doc } from "../rechazos/_pdf-helpers"

const MARGIN = 32

// Color de la banda según criticidad del riesgo.
const COLOR_CRITICIDAD: Record<CriticidadRiesgoExterno, string> = {
  critico: "#b91c1c",
  alto: "#c2410c",
  medio: "#a16207",
  bajo: "#0f766e",
}
const COLOR_NEUTRO = "#334155"
const TEXTO = "#0f172a"
const GRIS = "#64748b"
const LINEA = "#e2e8f0"
const FONDO_SUAVE = "#f8fafc"

export interface Args {
  tipos: TipoRiesgoExterno[]
  escalamiento: RiesgoExternoEscalamiento[]
  config: RiesgoExternoConfig[]
  contactos: RiesgoExternoContacto[]
  prioritarios: Set<string>
  qrPorTipo: Map<TipoRiesgoExterno, Buffer>
  qrIndice: Buffer
  conIndice: boolean
}

export async function renderPDF(args: Args): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      autoFirstPage: false,
      info: {
        Title: "Riesgos Externos — Fichas para el pizarrón",
        Author: "Mercosur · dpo-app",
        Subject: "Una ficha por riesgo con escalamiento y QR (DPO Planeamiento 2.2)",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      build(doc, args)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Nombre para el listado en columnas del cartel: los dos de emergencia médica
 * no entran en el ancho de columna y se pisan con la línea de abajo.
 */
const NOMBRE_CORTO: Partial<Record<TipoRiesgoExterno, string>> = {
  emergencia_medica_interna: "Emergencia médica (interna)",
  emergencia_medica_externa: "Emergencia médica (externa)",
  corte_de_ruta_o_acceso: "Corte de ruta o acceso",
}

function nombreCorto(tipo: TipoRiesgoExterno): string {
  return NOMBRE_CORTO[tipo] ?? TIPO_RIESGO_EXTERNO_LABELS[tipo]
}

/**
 * Cartel de una sola hoja con el QR general, para pegar en el pizarrón: quien
 * lo escanea entra al listado y elige el riesgo que necesita.
 */
export async function renderAfiche(args: {
  tipos: TipoRiesgoExterno[]
  prioritarios: Set<string>
  qrIndice: Buffer
}): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      info: {
        Title: "Riesgos Externos — QR del pizarrón",
        Author: "Mercosur · dpo-app",
        Subject: "Cartel con el QR al plan de respuesta (DPO Planeamiento 2.2)",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      dibujarAfiche(doc, args)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function dibujarAfiche(
  doc: Doc,
  {
    tipos,
    prioritarios,
    qrIndice,
  }: { tipos: TipoRiesgoExterno[]; prioritarios: Set<string>; qrIndice: Buffer },
) {
  const ancho = doc.page.width - MARGIN * 2

  doc.save().rect(0, 0, doc.page.width, 118).fill("#0f172a").restore()
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(34)
    .text("RIESGOS EXTERNOS", MARGIN, 30, { width: ancho, align: "center" })
  doc
    .fillColor("#cbd5e1")
    .font("Helvetica")
    .fontSize(13)
    .text("¿Qué hago si pasa algo?", MARGIN, 76, {
      width: ancho,
      align: "center",
    })

  doc
    .fillColor(TEXTO)
    .font("Helvetica-Bold")
    .fontSize(19)
    .text("Escaneá y elegí el riesgo", MARGIN, 146, {
      width: ancho,
      align: "center",
    })
  doc
    .fillColor(GRIS)
    .font("Helvetica")
    .fontSize(11.5)
    .text(
      "Vas a ver a quién llamar, qué hacer y en cuánto tiempo escalar.",
      MARGIN,
      doc.y + 6,
      { width: ancho, align: "center" },
    )

  const qrSize = 320
  doc.image(qrIndice, (doc.page.width - qrSize) / 2, doc.y + 16, {
    width: qrSize,
    height: qrSize,
  })
  let y = doc.y + 16 + qrSize + 26

  // Los prioritarios, bien visibles: son los que el equipo debe saber de memoria.
  const prio = tipos.filter((t) => prioritarios.has(t))
  if (prio.length > 0) {
    const alto = 30 + prio.length * 17
    doc.save().rect(MARGIN, y, ancho, alto).fill("#fef2f2").restore()
    doc
      .save()
      .lineWidth(1.5)
      .strokeColor("#b91c1c")
      .rect(MARGIN, y, ancho, alto)
      .stroke()
      .restore()
    doc
      .fillColor("#b91c1c")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("RIESGOS PRIORITARIOS DEL CD", MARGIN, y + 9, {
        width: ancho,
        align: "center",
      })
    let yy = y + 28
    for (const t of prio) {
      doc
        .fillColor(TEXTO)
        .font("Helvetica-Bold")
        .fontSize(11.5)
        .text(TIPO_RIESGO_EXTERNO_LABELS[t], MARGIN, yy, {
          width: ancho,
          align: "center",
        })
      yy += 17
    }
    y += alto + 18
  }

  // Los riesgos que va a encontrar, en tres columnas: quien mira el cartel sabe
  // si lo que le pasó está contemplado antes de sacar el celular.
  doc
    .fillColor(GRIS)
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(`LOS ${tipos.length} RIESGOS DEL PLAN`, MARGIN, y, {
      width: ancho,
      align: "center",
    })
  y += 16

  const columnas = 3
  const colW = ancho / columnas
  const porColumna = Math.ceil(tipos.length / columnas)
  tipos.forEach((t, i) => {
    const col = Math.floor(i / porColumna)
    const fila = i % porColumna
    doc
      .fillColor(TEXTO)
      .font("Helvetica")
      .fontSize(9.5)
      .text(`·  ${nombreCorto(t)}`, MARGIN + col * colW + 10, y + fila * 14, {
        width: colW - 14,
        lineBreak: false,
      })
  })
  y += porColumna * 14 + 14

  doc
    .fillColor(GRIS)
    .font("Helvetica")
    .fontSize(9)
    .text(
      "dpo-app › Riesgos Externos › Plan de respuesta",
      MARGIN,
      y,
      { width: ancho, align: "center" },
    )
  doc
    .fillColor("#94a3b8")
    .fontSize(8.5)
    .text(
      `DPO Planeamiento 2.2 · impreso el ${formatTimestamp(new Date())}`,
      MARGIN,
      doc.page.height - MARGIN - 12,
      { width: ancho, align: "center" },
    )
}

/** Recorta un texto largo para que la ficha entre en una sola hoja. */
function recortar(texto: string, max: number): string {
  const t = texto.trim()
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…"
}

function build(doc: Doc, args: Args) {
  const { tipos, escalamiento, config, contactos, prioritarios } = args
  const confPorTipo = new Map(config.map((c) => [c.tipo_riesgo, c]))

  if (args.conIndice) {
    dibujarIndice(doc, args)
  }

  for (const tipo of tipos) {
    doc.addPage()
    dibujarFicha(doc, {
      tipo,
      conf: confPorTipo.get(tipo) ?? null,
      niveles: escalamiento
        .filter((e) => e.tipo_riesgo === tipo)
        .sort((a, b) => a.nivel - b.nivel),
      contactos: contactos.filter((c) => c.tipo_riesgo === tipo),
      prioritario: prioritarios.has(tipo),
      qr: args.qrPorTipo.get(tipo)!,
    })
  }
}

/** Hoja 1: qué es esto, los prioritarios y un QR grande al listado completo. */
function dibujarIndice(doc: Doc, args: Args) {
  doc.addPage()
  const ancho = doc.page.width - MARGIN * 2

  doc.save().rect(0, 0, doc.page.width, 108).fill("#0f172a").restore()
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(26)
    .text("RIESGOS EXTERNOS", MARGIN, 30, { width: ancho })
  doc
    .fillColor("#cbd5e1")
    .font("Helvetica")
    .fontSize(11)
    .text(
      "Plan de respuesta del Centro de Distribución · DPO Planeamiento 2.2",
      MARGIN,
      64,
      { width: ancho },
    )
  doc
    .fillColor("#94a3b8")
    .fontSize(9)
    .text(`Impreso el ${formatTimestamp(new Date())}`, MARGIN, 84, {
      width: ancho,
    })

  doc.y = 132

  const prioritarios = args.tipos.filter((t) => args.prioritarios.has(t))
  if (prioritarios.length > 0) {
    const alto = 34 + prioritarios.length * 15
    doc.save().rect(MARGIN, doc.y, ancho, alto).fill("#fef2f2").restore()
    doc
      .save()
      .lineWidth(1.5)
      .strokeColor("#b91c1c")
      .rect(MARGIN, doc.y, ancho, alto)
      .stroke()
      .restore()

    doc
      .fillColor("#b91c1c")
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("RIESGOS PRIORITARIOS DEL CD", MARGIN + 12, doc.y + 10, {
        width: ancho - 24,
      })
    let y = doc.y + 6
    for (const t of prioritarios) {
      doc
        .fillColor(TEXTO)
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .text(`•  ${TIPO_RIESGO_EXTERNO_LABELS[t]}`, MARGIN + 16, y, {
          width: ancho - 32,
        })
      y += 15
    }
    doc.y = y + 14
  }

  doc
    .fillColor(TEXTO)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Escaneá para ver todas las fichas actualizadas", MARGIN, doc.y, {
      width: ancho,
      align: "center",
    })
  doc
    .fillColor(GRIS)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      "Los teléfonos y los planes se actualizan en la app: el papel puede quedar viejo, el QR no.",
      MARGIN,
      doc.y + 4,
      { width: ancho, align: "center" },
    )

  const qrSize = 210
  doc.image(args.qrIndice, (doc.page.width - qrSize) / 2, doc.y + 16, {
    width: qrSize,
    height: qrSize,
  })
  doc.y = doc.y + 16 + qrSize + 14

  doc
    .fillColor(GRIS)
    .font("Helvetica")
    .fontSize(9)
    .text(
      "Cada ficha de las hojas siguientes tiene su propio QR: abre ese riesgo directamente.",
      MARGIN,
      doc.y,
      { width: ancho, align: "center" },
    )
}

interface FichaArgs {
  tipo: TipoRiesgoExterno
  conf: RiesgoExternoConfig | null
  niveles: RiesgoExternoEscalamiento[]
  contactos: RiesgoExternoContacto[]
  prioritario: boolean
  qr: Buffer
}

function dibujarFicha(doc: Doc, f: FichaArgs) {
  const ancho = doc.page.width - MARGIN * 2
  const color = f.conf?.criticidad
    ? COLOR_CRITICIDAD[f.conf.criticidad]
    : COLOR_NEUTRO

  // ===== Banda superior =====
  const bandaH = 84
  doc.save().rect(0, 0, doc.page.width, bandaH).fill(color).restore()

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(23)
    .text(TIPO_RIESGO_EXTERNO_LABELS[f.tipo].toUpperCase(), MARGIN, 24, {
      width: ancho - 130,
      lineBreak: false,
      ellipsis: true,
    })

  const etiquetas = [
    f.conf?.criticidad
      ? `CRITICIDAD ${CRITICIDAD_RIESGO_EXTERNO_LABELS[f.conf.criticidad].toUpperCase()}`
      : null,
    f.prioritario ? "RIESGO PRIORITARIO DEL CD" : null,
  ].filter(Boolean)
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .opacity(0.92)
    .text(etiquetas.join("   ·   "), MARGIN, 56, { width: ancho - 130 })
  doc.opacity(1)

  doc
    .fillColor("#ffffff")
    .font("Helvetica")
    .fontSize(8.5)
    .opacity(0.85)
    .text("DPO PLANEAMIENTO 2.2", doc.page.width - MARGIN - 120, 30, {
      width: 120,
      align: "right",
    })
    .text("Plan de respuesta", doc.page.width - MARGIN - 120, 42, {
      width: 120,
      align: "right",
    })
  doc.opacity(1)

  doc.y = bandaH + 16

  // ===== A quién llamar =====
  const tels = f.contactos.filter((c) => c.telefono).slice(0, 6)
  if (tels.length > 0) {
    const filas = Math.ceil(tels.length / 2)
    const alto = 24 + filas * 26
    doc.save().rect(MARGIN, doc.y, ancho, alto).fill(FONDO_SUAVE).restore()
    doc
      .save()
      .lineWidth(0.8)
      .strokeColor(LINEA)
      .rect(MARGIN, doc.y, ancho, alto)
      .stroke()
      .restore()

    doc
      .fillColor(GRIS)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text("A QUIÉN LLAMAR", MARGIN + 12, doc.y + 8, { width: ancho - 24 })

    const colW = (ancho - 32) / 2
    const y0 = doc.y + 6
    tels.forEach((c, i) => {
      const x = MARGIN + 14 + (i % 2) * colW
      const y = y0 + Math.floor(i / 2) * 26
      // La empresa sólo suma si dice algo distinto del nombre del contacto
      // ("EDEN · EDEN — distribuidora eléctrica" no aporta nada).
      const empresa =
        c.empresa && !c.empresa.toLowerCase().startsWith(c.nombre.toLowerCase())
          ? c.empresa
          : null
      doc
        .fillColor(TEXTO)
        .font("Helvetica-Bold")
        .fontSize(15)
        .text(c.telefono!, x, y, { width: colW - 10, lineBreak: false })
      doc
        .fillColor(GRIS)
        .font("Helvetica")
        .fontSize(9)
        .text(recortar([c.nombre, empresa].filter(Boolean).join(" · "), 46), x, y + 16, {
          width: colW - 10,
          lineBreak: false,
        })
    })
    doc.y = y0 + filas * 26 + 14
  }

  // ===== Escalamiento =====
  doc
    .fillColor(color)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("QUÉ HACER — ESCALAMIENTO", MARGIN, doc.y, { width: ancho })
  doc.y += 4

  for (const n of f.niveles) {
    const yFila = doc.y + 6
    const xTexto = MARGIN + 34
    const anchoTexto = ancho - 34 - 62

    // Círculo del nivel
    doc.save().circle(MARGIN + 14, yFila + 9, 10).fill(color).restore()
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(`N${n.nivel}`, MARGIN + 4, yFila + 5.5, {
        width: 20,
        align: "center",
        lineBreak: false,
      })

    // Rol + suplente
    doc
      .fillColor(TEXTO)
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .text(n.rol, xTexto, yFila, { width: anchoTexto })
    if (n.suplente) {
      doc
        .fillColor(GRIS)
        .font("Helvetica")
        .fontSize(8.5)
        .text(`suplente: ${n.suplente}`, xTexto, doc.y, { width: anchoTexto })
    }

    // El plazo va a la derecha, a la altura del rol. Se dibuja con `y` propio,
    // así que hay que preservar el avance de la columna de texto: si no, la
    // línea siguiente vuelve a la altura del rol y se pisa con el suplente.
    const yTrasRol = doc.y
    doc
      .fillColor(color)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(
        formatMinutosDisparo(n.minutos_disparo),
        MARGIN + ancho - 62,
        yFila + 1,
        { width: 62, align: "right", lineBreak: false },
      )
    doc.y = yTrasRol

    doc
      .fillColor(TEXTO)
      .font("Helvetica-Oblique")
      .fontSize(10)
      .text(n.disparador, xTexto, doc.y + 3, { width: anchoTexto })

    if (n.acciones) {
      doc
        .fillColor("#334155")
        .font("Helvetica")
        .fontSize(9.5)
        .text(recortar(n.acciones, 320), xTexto, doc.y + 3, {
          width: anchoTexto,
        })
    }

    doc.y += 8
    doc
      .save()
      .strokeColor(LINEA)
      .lineWidth(0.6)
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + ancho, doc.y)
      .stroke()
      .restore()
  }

  doc.y += 12

  // ===== Los tres temas de R2.2.2 =====
  const bloques: [string, string | null][] = [
    ["NIVEL DE SERVICIO", f.conf?.plan_nivel_servicio ?? null],
    ["MANO DE OBRA", f.conf?.plan_mano_obra ?? null],
    ["AJUSTE DE PRONÓSTICO", f.conf?.plan_ajuste_pronostico ?? null],
  ]

  for (const [titulo, texto] of bloques) {
    const contenido = texto ? recortar(texto, 300) : "Sin definir."
    const anchoTexto = ancho - 24
    const altoTexto = doc
      .font("Helvetica")
      .fontSize(9)
      .heightOfString(contenido, { width: anchoTexto })
    const alto = altoTexto + 26

    doc.save().rect(MARGIN, doc.y, ancho, alto).fill(FONDO_SUAVE).restore()
    doc
      .save()
      .lineWidth(2)
      .strokeColor(color)
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN, doc.y + alto)
      .stroke()
      .restore()

    doc
      .fillColor(GRIS)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(titulo, MARGIN + 12, doc.y + 7, { width: anchoTexto })
    doc
      .fillColor(texto ? TEXTO : "#b91c1c")
      .font(texto ? "Helvetica" : "Helvetica-Bold")
      .fontSize(9)
      .text(contenido, MARGIN + 12, doc.y + 2, { width: anchoTexto })

    doc.y += 12
  }

  // ===== Pie con QR =====
  const qrSize = 74
  const yPie = doc.page.height - MARGIN - qrSize
  doc
    .save()
    .strokeColor(LINEA)
    .lineWidth(0.8)
    .moveTo(MARGIN, yPie - 12)
    .lineTo(MARGIN + ancho, yPie - 12)
    .stroke()
    .restore()

  doc.image(f.qr, MARGIN, yPie, { width: qrSize, height: qrSize })

  doc
    .fillColor(TEXTO)
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text("Escaneá para ver esta ficha actualizada", MARGIN + qrSize + 14, yPie + 10, {
      width: ancho - qrSize - 14,
    })
  doc
    .fillColor(GRIS)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "Los teléfonos y el plan se mantienen en dpo-app › Riesgos Externos › Plan de respuesta. Si algo cambió, vale lo que muestra la app.",
      MARGIN + qrSize + 14,
      doc.y + 2,
      { width: ancho - qrSize - 14 },
    )
  doc
    .fillColor("#94a3b8")
    .font("Helvetica")
    .fontSize(8)
    .text(
      `Impreso el ${formatTimestamp(new Date())}`,
      MARGIN + qrSize + 14,
      yPie + qrSize - 10,
      { width: ancho - qrSize - 14 },
    )
}
