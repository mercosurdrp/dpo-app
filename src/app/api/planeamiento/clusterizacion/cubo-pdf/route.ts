export const maxDuration = 60

import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { getClusterizacion } from "@/actions/clusterizacion"
import { getPlanesCubo } from "@/actions/clusterizacion-planes"
import {
  CUBO_META,
  type CuboId,
  type ClienteClusterizado,
} from "@/actions/clusterizacion-tipos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COLOR_BORDER = "#cbd5e1"
const COLOR_HEADER_BG = "#f1f5f9"
const COLOR_ROW_ALT = "#fafbfc"
const COLOR_TEXT = "#0f172a"
const COLOR_MUTED = "#64748b"
const ROW_H = 16
const HEADER_H = 18

type Doc = InstanceType<typeof PDFDocument>

function isCubo(s: string): s is CuboId {
  return s in CUBO_META
}

export async function GET(req: NextRequest) {
  const cubo = req.nextUrl.searchParams.get("cubo") ?? ""
  if (!isCubo(cubo)) return new NextResponse("Cubo inválido", { status: 400 })

  let res
  try {
    res = await getClusterizacion()
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Error", { status: 500 })
  }
  if ("error" in res) return new NextResponse(res.error, { status: 500 })

  const filas = res.data.clientes
    .filter((c) => c.cubo === cubo)
    .sort(
      (a, b) =>
        (a.supervisor ?? "").localeCompare(b.supervisor ?? "") || b.ingresos_actual - a.ingresos_actual,
    )
  const plan = (await getPlanesCubo()).find((p) => p.cubo === cubo) ?? null

  const buf = await renderPDF(cubo, filas, plan)
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cubo_${cubo}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

interface PlanCubo {
  descripcion: string
  responsable: string | null
  fecha_limite: string | null
  estado: string
}

async function renderPDF(cubo: CuboId, filas: ClienteClusterizado[], plan: PlanCubo | null): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      const meta = CUBO_META[cubo]
      const color = meta.color
      const pageW = doc.page.width
      const margin = doc.page.margins.left
      const usable = pageW - margin * 2

      // Encabezado.
      doc.save(); doc.rect(0, 0, pageW, 52).fill(color); doc.restore()
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(16)
        .text(`Cubo ${meta.label}`, margin, 12, { width: usable / 2, lineBreak: false })
      doc.fillColor("#ffffff").font("Helvetica").fontSize(9)
        .text(`${meta.combo} · ${filas.length} PDV · Clusterización Pampeana`, margin, 33, { width: usable, lineBreak: false })
      doc.fillColor("#ffffff").font("Helvetica").fontSize(8)
        .text(`Generado el ${formatTimestamp(new Date())}`, margin + usable / 2, 33, { width: usable / 2, align: "right", lineBreak: false })
      doc.y = 64; doc.x = margin; doc.fillColor(COLOR_TEXT)

      // Lectura/jugada.
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLOR_MUTED)
        .text(meta.jugada, margin, doc.y, { width: usable })
      doc.y += 6

      // Caja del plan de acción del cubo.
      const boxY = doc.y
      doc.save(); doc.roundedRect(margin, boxY, usable, plan ? 52 : 30, 4).fill("#f8fafc"); doc.restore()
      doc.save(); doc.rect(margin, boxY, 4, plan ? 52 : 30).fill(color); doc.restore()
      if (plan) {
        doc.fillColor(COLOR_TEXT).font("Helvetica-Bold").fontSize(10)
          .text("Plan de acción — TODOS estos clientes requieren:", margin + 12, boxY + 7, { width: usable - 20, lineBreak: false })
        doc.fillColor(COLOR_TEXT).font("Helvetica").fontSize(10)
          .text(plan.descripcion, margin + 12, boxY + 22, { width: usable - 20 })
        const extra = [
          plan.responsable ? `Responsable: ${plan.responsable}` : null,
          plan.fecha_limite ? `Límite: ${plan.fecha_limite}` : null,
          `Estado: ${plan.estado}`,
        ].filter(Boolean).join("   ·   ")
        doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(8)
          .text(extra, margin + 12, boxY + 38, { width: usable - 20, lineBreak: false })
      } else {
        doc.fillColor(COLOR_MUTED).font("Helvetica-Oblique").fontSize(9)
          .text("Sin plan de acción cargado para este cubo.", margin + 12, boxY + 9, { width: usable - 20, lineBreak: false })
      }
      doc.y = boxY + (plan ? 52 : 30) + 12
      doc.x = margin

      drawTabla(doc, filas)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

interface Col {
  header: string
  width: number
  align?: "left" | "right"
  get: (c: ClienteClusterizado, i: number) => string
}

function drawTabla(doc: Doc, filas: ClienteClusterizado[]) {
  const cols: Col[] = [
    { header: "#", width: 22, align: "right", get: (_c, i) => String(i + 1) },
    { header: "Cliente", width: 165, get: (c) => `${c.nombre ?? `Cliente ${c.id_cliente}`} (#${c.id_cliente})` },
    { header: "Localidad", width: 90, get: (c) => c.localidad ?? "—" },
    { header: "Supervisor", width: 95, get: (c) => c.supervisor ?? "—" },
    { header: "Promotor", width: 95, get: (c) => c.promotor ?? "—" },
    { header: "Fact. YTD", width: 70, align: "right", get: (c) => formatMoneyShort(c.ingresos_actual) },
    { header: "$/HL", width: 52, align: "right", get: (c) => (c.costo_x_hl_ytd == null ? "—" : formatMoneyShort(c.costo_x_hl_ytd)) },
    { header: "Crec.", width: 46, align: "right", get: (c) => (c.crecimiento_pct == null ? "nuevo" : `${Math.round(c.crecimiento_pct * 100)}%`) },
    { header: "Rechazo", width: 50, get: (c) => (c.estado === "no_pasa" ? `No pasa (${c.rechazos_culpa})` : "Pasa") },
    { header: "Frío", width: 42, get: (c) => (c.equipos_frio_n > 0 ? `Sí (${c.equipos_frio_n})` : "—") },
  ]

  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2
  const sumW = cols.reduce((a, c) => a + c.width, 0)
  const scale = usable / sumW
  const widths = cols.map((c) => c.width * scale)

  const drawHead = () => {
    if (doc.y + HEADER_H + ROW_H > doc.page.height - doc.page.margins.bottom - 30) doc.addPage()
    const yHead = doc.y
    doc.save(); doc.rect(margin, yHead, usable, HEADER_H).fill(COLOR_HEADER_BG); doc.restore()
    let cx = margin
    for (let i = 0; i < cols.length; i++) {
      doc.fillColor(COLOR_TEXT).font("Helvetica-Bold").fontSize(8)
        .text(cols[i].header.toUpperCase(), cx + 5, yHead + 5, { width: widths[i] - 10, align: cols[i].align ?? "left", lineBreak: false })
      cx += widths[i]
    }
    doc.y = yHead + HEADER_H
  }

  drawHead()
  if (filas.length === 0) {
    doc.fillColor(COLOR_MUTED).font("Helvetica-Oblique").fontSize(9)
      .text("Sin PDV en este cubo.", margin + 6, doc.y + 5, { width: usable - 12, lineBreak: false })
    return
  }
  for (let r = 0; r < filas.length; r++) {
    if (doc.y + ROW_H > doc.page.height - doc.page.margins.bottom - 30) { doc.addPage(); drawHead() }
    const yRow = doc.y
    if (r % 2 === 1) { doc.save(); doc.rect(margin, yRow, usable, ROW_H).fill(COLOR_ROW_ALT); doc.restore() }
    let cx = margin
    for (let i = 0; i < cols.length; i++) {
      doc.fillColor(COLOR_TEXT).font("Helvetica").fontSize(8.5)
        .text(cols[i].get(filas[r], r), cx + 5, yRow + 4, { width: widths[i] - 10, align: cols[i].align ?? "left", lineBreak: false, ellipsis: true })
      cx += widths[i]
    }
    doc.save(); doc.strokeColor("#e5e7eb").lineWidth(0.3).moveTo(margin, yRow + ROW_H).lineTo(margin + usable, yRow + ROW_H).stroke(); doc.restore()
    doc.y = yRow + ROW_H
  }
}

function drawFooters(doc: Doc) {
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    const pageW = doc.page.width
    const margin = doc.page.margins.left
    const y = doc.page.height - 22
    doc.save(); doc.strokeColor(COLOR_BORDER).lineWidth(0.5).moveTo(margin, y - 4).lineTo(pageW - margin, y - 4).stroke(); doc.restore()
    doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(8)
      .text("Mercosur Distribuciones · dpo-app · Diagrama de clusterización", margin, y, { width: pageW - margin * 2, align: "left", lineBreak: false })
    doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(8)
      .text(`Página ${i + 1} de ${range.count}`, margin, y, { width: pageW - margin * 2, align: "right", lineBreak: false })
  }
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
