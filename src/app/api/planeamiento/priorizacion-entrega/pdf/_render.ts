/**
 * Render del PDF de clientes reprogramados (VRL del día).
 *
 * Separado del route handler para poder ejercitarlo sin request ni sesión.
 * Solo dibujo: no toca Supabase ni la request.
 */
import PDFDocument from "pdfkit"
import {
  COLOR_MUTED,
  COLOR_TEXT,
  drawFooters,
  drawHeader,
  drawKPIs,
  drawSectionTitle,
  drawTable,
  ensureSpace,
  formatFechaLarga,
  formatHl,
  formatInt,
  formatMoneyFull,
  formatMoneyShort,
  type Col,
  type Doc,
  type KPICard,
} from "@/app/api/rechazos/_pdf-helpers"

export interface FilaPdf {
  id_cliente: number
  nombre: string | null
  localidad: string | null
  bultos: number
  hl: number
  monto: number
  score: number
  comportamiento: number
  rmd_prom: number | null
  rechazos_45d: number
  veces_pospuesto: number
  posicion: number
  motivo: string
}

export interface GrupoPdf {
  ciudad: string
  filas: FilaPdf[]
  bultos: number
  hl: number
  monto: number
}

export interface ReprogramadosPayload {
  fecha: string
  nota: string
  total: { clientes: number; bultos: number; hl: number; monto: number }
  grupos: GrupoPdf[]
}

export async function renderReprogramadosPdf(p: ReprogramadosPayload): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",   // 12 columnas no entran en vertical sin recortar el nombre
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Clientes reprogramados ${p.fecha}`,
        Author: "Mercosur Distribuciones",
        Subject: `Volumen Reprogramado Logístico (VRL) de la entrega del ${p.fecha}`,
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    try {
      buildPDF(doc, p)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/** Anchos relativos de la tabla; `drawTable` los escala al ancho útil de la hoja. */
const W = {
  pos: 22, cliente: 165, localidad: 68, bultos: 38, hl: 38, monto: 52,
  score: 42, comp: 36, rmd: 30, r45: 26, posp: 32, motivo: 130,
}
const SUMA_W = Object.values(W).reduce((a, w) => a + w, 0)

/** Alto de fuente y padding con los que `drawTable` escribe cada celda. */
const CELL_FONT = 8.5
const CELL_PAD = 10

/**
 * Corta el texto a lo que ENTRA en la celda, midiendo con la fuente real.
 * 🚨 `lineBreak: false` de pdfkit no alcanza: el texto largo igual salta de
 * línea y la segunda queda pisada por la fila de abajo. Truncar por cantidad
 * de caracteres tampoco sirve (el ancho depende de las letras).
 */
function fit(doc: Doc, s: string, ancho: number): string {
  doc.font("Helvetica").fontSize(CELL_FONT)
  if (doc.widthOfString(s) <= ancho) return s
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (doc.widthOfString(s.slice(0, mid).trimEnd() + "…") <= ancho) lo = mid
    else hi = mid - 1
  }
  return s.slice(0, lo).trimEnd() + "…"
}

/** Ancho real (en puntos) de la celda de esa columna en la hoja actual. */
function anchoCelda(doc: Doc, w: number): number {
  const usable = doc.page.width - doc.page.margins.left * 2
  return (w * usable) / SUMA_W - CELL_PAD
}

function columnas(doc: Doc): Col<FilaPdf>[] {
  return [
    { header: "#", width: W.pos, align: "right", get: (f) => String(f.posicion) },
    {
      header: "Cliente",
      width: W.cliente,
      get: (f) => fit(doc, `${f.nombre ?? `Cliente ${f.id_cliente}`} (#${f.id_cliente})`, anchoCelda(doc, W.cliente)),
    },
    { header: "Localidad", width: W.localidad, get: (f) => fit(doc, f.localidad ?? "—", anchoCelda(doc, W.localidad)) },
    { header: "Bultos", width: W.bultos, align: "right", get: (f) => formatInt(f.bultos) },
    { header: "HL", width: W.hl, align: "right", get: (f) => formatHl(f.hl) },
    { header: "Monto", width: W.monto, align: "right", get: (f) => formatMoneyShort(f.monto) },
    { header: "Score", width: W.score, align: "right", get: (f) => f.score.toFixed(0) },
    { header: "Comp.", width: W.comp, align: "right", get: (f) => f.comportamiento.toFixed(0) },
    { header: "RMD", width: W.rmd, align: "right", get: (f) => (f.rmd_prom !== null ? f.rmd_prom.toFixed(1) : "—") },
    { header: "45d", width: W.r45, align: "right", get: (f) => String(f.rechazos_45d || "—") },
    { header: "Posp.", width: W.posp, align: "right", get: (f) => String(f.veces_pospuesto || "—") },
    { header: "Motivo", width: W.motivo, get: (f) => fit(doc, f.motivo, anchoCelda(doc, W.motivo)) },
  ]
}

function buildPDF(doc: Doc, p: ReprogramadosPayload) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  drawHeader(doc, "Clientes a reprogramar", "VRL del día", formatFechaLarga(p.fecha))

  const kpis: KPICard[] = [
    { label: "Clientes", value: formatInt(p.total.clientes), sub: "reprogramados", color: "#dc2626" },
    { label: "Bultos", value: formatInt(p.total.bultos), sub: "fuera del ruteo" },
    { label: "HL", value: formatHl(p.total.hl), sub: "volumen reprogramado" },
    { label: "Monto", value: formatMoneyShort(p.total.monto), sub: formatMoneyFull(p.total.monto) },
  ]
  drawKPIs(doc, kpis)

  if (p.nota.trim()) {
    drawSectionTitle(doc, "Comentario del corte")
    // 🚨 Un doc.text() que fluye cerca del pie hace que pdfkit encadene páginas
    // en blanco: se le reserva el alto de antemano y se lo mantiene acotado.
    const nota = p.nota.trim()
    doc.font("Helvetica").fontSize(9)
    const alto = doc.heightOfString(nota, { width: usable })
    ensureSpace(doc, alto + 12)
    doc.fillColor(COLOR_TEXT).text(nota, margin, doc.y, { width: usable })
    doc.y = doc.y + 12
    doc.x = margin
  }

  for (const g of p.grupos) {
    drawSectionTitle(
      doc,
      `${g.ciudad} — ${g.filas.length} clientes · ${formatInt(g.bultos)} bultos · ${formatHl(g.hl)} HL · ${formatMoneyShort(g.monto)}`,
    )
    drawTable(doc, g.filas, columnas(doc), "Sin clientes reprogramados")
  }

  const metodologia =
    "El corte se decide por score (50% comportamiento + 35% importancia del cliente + 15% valor del pedido). " +
    "Comp. = comportamiento (rechazos por causa del cliente en 180 días); los rechazos por falla interna no cuentan. " +
    "45d = rechazos por su culpa en los últimos 45 días. RMD y NPS son banderas: no suman al score."
  doc.font("Helvetica").fontSize(7.5)
  ensureSpace(doc, doc.heightOfString(metodologia, { width: usable }))
  doc.fillColor(COLOR_MUTED).text(metodologia, margin, doc.y, { width: usable })
}
