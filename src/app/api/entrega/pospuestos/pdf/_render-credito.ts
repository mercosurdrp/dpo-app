/**
 * PDF de los pedidos retenidos por crédito de un día (volumen reprogramado
 * comercial). Mismo diseño que «Clientes a reprogramar» (VRL), para que Ventas
 * reciba las dos listas con el mismo formato y avise a esos clientes.
 */
import PDFDocument from "pdfkit"
import {
  COLOR_MUTED,
  drawFooters,
  drawHeader,
  drawKPIs,
  drawSectionTitle,
  drawTable,
  ensureSpace,
  formatFechaCorta,
  formatFechaLarga,
  formatHl,
  formatInt,
  formatMoneyFull,
  formatMoneyShort,
  type Col,
  type Doc,
  type KPICard,
} from "@/app/api/rechazos/_pdf-helpers"
import type { PospuestoDia, PospuestoFila } from "@/lib/comunicacion-cliente/pospuestos"

export async function renderRetenidosCreditoPdf(d: PospuestoDia): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Pedidos retenidos por crédito ${d.fecha}`,
        Author: "Mercosur Distribuciones",
        Subject: `Volumen reprogramado comercial (crédito) de la entrega del ${d.fecha}`,
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      build(doc, d)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

const W = { cliente: 230, cod: 50, bultos: 45, hl: 45, monto: 65, motivo: 140, nueva: 70 }
const SUMA_W = Object.values(W).reduce((a, w) => a + w, 0)
const CELL_FONT = 8.5
const CELL_PAD = 10

function fit(doc: Doc, s: string, w: number): string {
  const ancho = (w * (doc.page.width - doc.page.margins.left * 2)) / SUMA_W - CELL_PAD
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

function build(doc: Doc, d: PospuestoDia) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  drawHeader(doc, "Pedidos retenidos por crédito", "Aviso a Ventas", formatFechaLarga(d.fecha))
  const kpis: KPICard[] = [
    { label: "Clientes", value: formatInt(d.clientes), sub: `${formatInt(d.pedidos)} pedidos`, color: "#dc2626" },
    { label: "Bultos", value: formatInt(d.bultos), sub: "no salen el día pactado" },
    { label: "HL", value: formatHl(d.hl), sub: "volumen reprogramado comercial" },
    { label: "Monto", value: formatMoneyShort(d.monto), sub: formatMoneyFull(d.monto) },
  ]
  drawKPIs(doc, kpis)

  const cols: Col<PospuestoFila>[] = [
    { header: "Cliente", width: W.cliente, get: (f) => fit(doc, f.cliente, W.cliente) },
    { header: "Cód.", width: W.cod, align: "right", get: (f) => f.idCliente || "—" },
    { header: "Bultos", width: W.bultos, align: "right", get: (f) => formatInt(f.bultos) },
    { header: "HL", width: W.hl, align: "right", get: (f) => formatHl(f.hl) },
    { header: "Monto", width: W.monto, align: "right", get: (f) => formatMoneyShort(f.monto) },
    { header: "Motivo", width: W.motivo, get: (f) => fit(doc, f.motivo, W.motivo) },
    { header: "Nueva fecha", width: W.nueva, get: (f) => (f.fechaNueva ? formatFechaCorta(f.fechaNueva) : "sin fecha") },
  ]
  drawSectionTitle(doc, `Clientes a avisar — entrega pactada ${formatFechaLarga(d.fecha)}`)
  drawTable(doc, d.filas, cols, "Sin pedidos retenidos")

  const nota =
    "Pedidos frenados por deuda vencida antes de cargarse: el vendedor avisa a cada cliente que el pedido no sale el día pactado " +
    "y, si regulariza el pago, coordina la nueva fecha (SOP 4.2 Comunicación al cliente, mensaje C)." +
    (d.registradoPor ? ` Registrado por: ${d.registradoPor}.` : "")
  doc.font("Helvetica").fontSize(7.5)
  ensureSpace(doc, doc.heightOfString(nota, { width: usable }) + 6)
  doc.fillColor(COLOR_MUTED).text(nota, margin, doc.y + 6, { width: usable })
}
