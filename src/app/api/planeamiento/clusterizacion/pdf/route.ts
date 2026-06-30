import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { getClusterizacion } from "@/actions/clusterizacion"
import {
  CLUSTER_LABELS,
  CUADRANTE_LABELS,
  type CuadranteId,
  type ClienteClusterizado,
} from "@/actions/clusterizacion-tipos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COLOR_PRIMARY = "#4338ca"
const COLOR_BORDER = "#cbd5e1"
const COLOR_HEADER_BG = "#f1f5f9"
const COLOR_ROW_ALT = "#fafbfc"
const COLOR_TEXT = "#0f172a"
const COLOR_MUTED = "#64748b"

const CUAD_COLOR: Record<CuadranteId, string> = {
  proteger: "#059669",
  optimizar: "#d97706",
  mantener: "#2563eb",
  revisar: "#dc2626",
}

const ROW_H = 16
const HEADER_H = 18
const MAX_FILAS = 1000

type Doc = InstanceType<typeof PDFDocument>

interface ResumenCuad {
  id: CuadranteId
  n: number
  fact: number
}

export async function GET(req: NextRequest) {
  let res
  try {
    res = await getClusterizacion()
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Error", { status: 500 })
  }
  if ("error" in res) return new NextResponse(res.error, { status: 500 })

  const { clientes, umbral_ingresos, umbral_costo } = res.data
  const conCuadrante = clientes.filter((c) => c.cuadrante != null)

  // Resumen (siempre sobre la matriz completa, sin filtros).
  const orden: CuadranteId[] = ["proteger", "optimizar", "mantener", "revisar"]
  const resumen: ResumenCuad[] = orden.map((id) => {
    const grupo = conCuadrante.filter((c) => c.cuadrante === id)
    return { id, n: grupo.length, fact: grupo.reduce((s, c) => s + c.ingresos_actual, 0) }
  })

  // Filtros (mismos criterios que la solapa).
  const sp = req.nextUrl.searchParams
  const cuad = sp.get("cuad")
  const fLoc = sp.get("localidad")
  const fProm = sp.get("promotor")
  const fSup = sp.get("supervisor")
  const fEstado = sp.get("estado")
  const fFrio = sp.get("frio")
  const q = (sp.get("q") ?? "").trim().toLowerCase()

  const lista = conCuadrante
    .filter((c) => !cuad || cuad === "todos" || c.cuadrante === cuad)
    .filter((c) => !fLoc || c.localidad === fLoc)
    .filter((c) => !fProm || c.promotor === fProm)
    .filter((c) => !fSup || c.supervisor === fSup)
    .filter((c) => !fEstado || c.estado === fEstado)
    .filter((c) => !fFrio || (fFrio === "con" ? c.equipos_frio_n > 0 : c.equipos_frio_n === 0))
    .filter(
      (c) =>
        q === "" ||
        (c.nombre ?? "").toLowerCase().includes(q) ||
        String(c.id_cliente).includes(q) ||
        (c.localidad ?? "").toLowerCase().includes(q) ||
        (c.promotor ?? "").toLowerCase().includes(q) ||
        (c.supervisor ?? "").toLowerCase().includes(q),
    )
    .sort(
      (a, b) =>
        (a.supervisor ?? "").localeCompare(b.supervisor ?? "") ||
        b.ingresos_actual - a.ingresos_actual,
    )

  const total = lista.length
  const filas = lista.slice(0, MAX_FILAS)

  // Texto de filtros activos.
  const filtros: string[] = []
  if (cuad && cuad !== "todos" && isCuad(cuad)) filtros.push(`Cuadrante: ${CUADRANTE_LABELS[cuad]}`)
  if (fLoc) filtros.push(`Localidad: ${fLoc}`)
  if (fProm) filtros.push(`Promotor: ${fProm}`)
  if (fSup) filtros.push(`Supervisor: ${fSup}`)
  if (fEstado === "no_pasa") filtros.push("Rechazo: solo No pasa")
  if (fEstado === "pasa") filtros.push("Rechazo: solo Pasa")
  if (fFrio === "con") filtros.push("Equipo de frío: con")
  if (fFrio === "sin") filtros.push("Equipo de frío: sin")
  if (q) filtros.push(`Búsqueda: "${q}"`)

  const pdfBuf = await renderPDF({
    resumen,
    filas,
    total,
    truncado: total > MAX_FILAS,
    filtros,
    umbral_ingresos,
    umbral_costo,
  })

  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="clusterizacion_valor_costo.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

function isCuad(s: string): s is CuadranteId {
  return s === "proteger" || s === "optimizar" || s === "mantener" || s === "revisar"
}

interface RenderInput {
  resumen: ResumenCuad[]
  filas: ClienteClusterizado[]
  total: number
  truncado: boolean
  filtros: string[]
  umbral_ingresos: number
  umbral_costo: number
}

async function renderPDF(input: RenderInput): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 36,
      bufferPages: true,
      info: {
        Title: "Análisis Valor × Costo",
        Author: "Mercosur Distribuciones",
        Subject: "Clusterización — matriz Valor × Costo",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      drawHeader(doc)
      drawResumen(doc, input.resumen)
      drawContexto(doc, input)
      drawTabla(doc, input.filas)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function drawHeader(doc: Doc) {
  const pageWidth = doc.page.width
  const margin = doc.page.margins.left
  const usable = pageWidth - margin * 2
  const barH = 50

  doc.save()
  doc.rect(0, 0, pageWidth, barH).fill(COLOR_PRIMARY)
  doc.restore()

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("Análisis Valor × Costo", margin, 13, { width: usable / 2, lineBreak: false })
  doc
    .fillColor("#e0e7ff")
    .font("Helvetica")
    .fontSize(9)
    .text("Clusterización de Clientes (4.2) · Mercosur Pampeana", margin, 33, {
      width: usable / 2,
      lineBreak: false,
    })

  doc
    .fillColor("#e0e7ff")
    .font("Helvetica")
    .fontSize(8)
    .text(`Generado el ${formatTimestamp(new Date())}`, margin + usable / 2, 33, {
      width: usable / 2,
      align: "right",
      lineBreak: false,
    })

  doc.y = barH + 12
  doc.x = margin
  doc.fillColor(COLOR_TEXT)
}

function drawResumen(doc: Doc, resumen: ResumenCuad[]) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2
  const gap = 8
  const cols = 4
  const cardW = (usable - gap * (cols - 1)) / cols
  const cardH = 48
  const yRow = doc.y

  for (let i = 0; i < resumen.length; i++) {
    const r = resumen[i]
    const x = margin + i * (cardW + gap)
    const color = CUAD_COLOR[r.id]

    doc.save()
    doc.lineWidth(0.5).strokeColor(COLOR_BORDER).roundedRect(x, yRow, cardW, cardH, 4).stroke()
    doc.rect(x, yRow, 3, cardH).fill(color)
    doc.restore()

    doc
      .fillColor(color)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(CUADRANTE_LABELS[r.id].toUpperCase(), x + 9, yRow + 6, { width: cardW - 14, lineBreak: false })
    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(`${formatInt(r.n)} PDV`, x + 9, yRow + 18, { width: cardW - 14, lineBreak: false })
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(`Facturación ${formatMoneyShort(r.fact)}`, x + 9, yRow + 35, {
        width: cardW - 14,
        lineBreak: false,
      })
  }

  doc.y = yRow + cardH + 12
  doc.x = margin
}

function drawContexto(doc: Doc, input: RenderInput) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2
  const partes = [
    `Corte facturación (mediana): ${formatMoneyShort(input.umbral_ingresos)}`,
    `Corte $/HL (mediana): ${formatMoneyShort(input.umbral_costo)}`,
  ]
  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text(partes.join("   ·   "), margin, doc.y, { width: usable, lineBreak: false })
  doc.y += 12

  const filtroStr = input.filtros.length ? input.filtros.join("   ·   ") : "Sin filtros (todos los cuadrantes)"
  doc
    .fillColor(COLOR_TEXT)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`Listado (${formatInt(input.total)} PDV)`, margin, doc.y, { width: usable, lineBreak: false })
  doc.y += 12
  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text(filtroStr, margin, doc.y, { width: usable, lineBreak: false })
  doc.y += 14
  doc.x = margin

  if (input.truncado) {
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text(`Mostrando los primeros ${formatInt(MAX_FILAS)} (de ${formatInt(input.total)}). Refiná con los filtros.`, margin, doc.y, {
        width: usable,
        lineBreak: false,
      })
    doc.y += 12
  }
}

interface Col {
  header: string
  width: number
  align?: "left" | "right"
  get: (c: ClienteClusterizado, idx: number) => string
}

function drawTabla(doc: Doc, filas: ClienteClusterizado[]) {
  const cols: Col[] = [
    { header: "#", width: 22, align: "right", get: (_c, i) => String(i + 1) },
    { header: "Cliente", width: 150, get: (c) => `${c.nombre ?? `Cliente ${c.id_cliente}`} (#${c.id_cliente})` },
    { header: "Localidad", width: 85, get: (c) => c.localidad ?? "—" },
    { header: "Supervisor", width: 88, get: (c) => c.supervisor ?? "—" },
    { header: "Cluster", width: 72, get: (c) => CLUSTER_LABELS[c.cluster] },
    { header: "Fact. YTD", width: 68, align: "right", get: (c) => formatMoneyShort(c.ingresos_actual) },
    { header: "$/HL año", width: 56, align: "right", get: (c) => (c.costo_x_hl_ytd == null ? "—" : formatMoneyShort(c.costo_x_hl_ytd)) },
    { header: "Rechazo", width: 50, get: (c) => (c.estado === "no_pasa" ? `No pasa (${c.rechazos_culpa})` : "Pasa") },
    { header: "Frío", width: 48, get: (c) => (c.equipos_frio_n > 0 ? `Sí (${c.equipos_frio_n})` : "—") },
    { header: "Acción recomendada", width: 128, get: (c) => (c.cuadrante ? CUADRANTE_LABELS[c.cuadrante] : "—") },
  ]

  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2
  const sumW = cols.reduce((a, c) => a + c.width, 0)
  const scale = usable / sumW
  const widths = cols.map((c) => c.width * scale)

  const drawHead = () => {
    ensureSpace(doc, HEADER_H + ROW_H)
    const yHead = doc.y
    doc.save()
    doc.rect(margin, yHead, usable, HEADER_H).fill(COLOR_HEADER_BG)
    doc.restore()
    let cx = margin
    for (let i = 0; i < cols.length; i++) {
      doc
        .fillColor(COLOR_TEXT)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(cols[i].header.toUpperCase(), cx + 5, yHead + 5, {
          width: widths[i] - 10,
          align: cols[i].align ?? "left",
          lineBreak: false,
        })
      cx += widths[i]
    }
    doc.y = yHead + HEADER_H
  }

  drawHead()

  if (filas.length === 0) {
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text("Sin PDV para los filtros aplicados.", margin + 6, doc.y + 5, { width: usable - 12, lineBreak: false })
    return
  }

  for (let r = 0; r < filas.length; r++) {
    if (doc.y + ROW_H > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage()
      drawHead()
    }
    const yRow = doc.y
    if (r % 2 === 1) {
      doc.save()
      doc.rect(margin, yRow, usable, ROW_H).fill(COLOR_ROW_ALT)
      doc.restore()
    }
    let cx = margin
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]
      const esAccion = c.header === "Acción recomendada"
      const cuadFila = filas[r].cuadrante
      const color = esAccion && cuadFila ? CUAD_COLOR[cuadFila] : COLOR_TEXT
      doc
        .fillColor(color)
        .font("Helvetica")
        .fontSize(8.5)
        .text(c.get(filas[r], r), cx + 5, yRow + 4, {
          width: widths[i] - 10,
          align: c.align ?? "left",
          lineBreak: false,
          ellipsis: true,
        })
      cx += widths[i]
    }
    doc.save()
    doc.strokeColor("#e5e7eb").lineWidth(0.3).moveTo(margin, yRow + ROW_H).lineTo(margin + usable, yRow + ROW_H).stroke()
    doc.restore()
    doc.y = yRow + ROW_H
  }
}

function drawFooters(doc: Doc) {
  const range = doc.bufferedPageRange()
  const total = range.count
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i)
    const pageW = doc.page.width
    const pageH = doc.page.height
    const margin = doc.page.margins.left
    const y = pageH - 22
    doc.save()
    doc.strokeColor(COLOR_BORDER).lineWidth(0.5).moveTo(margin, y - 4).lineTo(pageW - margin, y - 4).stroke()
    doc.restore()
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text("Mercosur Distribuciones · dpo-app · Análisis Valor × Costo", margin, y, {
        width: pageW - margin * 2,
        align: "left",
        lineBreak: false,
      })
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(`Página ${i + 1} de ${total}`, margin, y, { width: pageW - margin * 2, align: "right", lineBreak: false })
  }
}

function ensureSpace(doc: Doc, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom - 30
  if (doc.y + needed > bottom) doc.addPage()
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}

function formatMoneyShort(n: number): string {
  if (!n) return "$0"
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)}`
}

function formatTimestamp(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(d)
}
