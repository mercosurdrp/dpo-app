import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getRechazosResumenDia,
  type RechazosResumenDia,
} from "@/lib/rechazos/resumen-dia"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COLOR_PRIMARY = "#1e40af"
const COLOR_ACCENT = "#dc2626"
const COLOR_OK = "#059669"
const COLOR_BORDER = "#cbd5e1"
const COLOR_HEADER_BG = "#f1f5f9"
const COLOR_ROW_ALT = "#fafbfc"
const COLOR_TEXT = "#0f172a"
const COLOR_MUTED = "#64748b"
const META_TASA = 1.7

const ROW_H = 16
const HEADER_H = 18

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const fecha = req.nextUrl.searchParams.get("fecha")
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return new NextResponse("Parámetro 'fecha' inválido (esperado YYYY-MM-DD)", {
      status: 400,
    })
  }

  let resumen: RechazosResumenDia
  try {
    const supa = await createClient()
    resumen = await getRechazosResumenDia(supa, fecha)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error generando resumen"
    return new NextResponse(msg, { status: 500 })
  }

  const pdfBuf = await renderPDF(resumen)

  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rechazos_${fecha}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

async function renderPDF(r: RechazosResumenDia): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Detalle de Rechazos ${r.fecha}`,
        Author: "Mercosur Distribuciones",
        Subject: `Rechazos del día ${r.fecha}`,
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    try {
      buildPDF(doc, r)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

type Doc = InstanceType<typeof PDFDocument>

function buildPDF(doc: Doc, r: RechazosResumenDia) {
  drawHeader(doc, r)
  drawKPIs(doc, r)
  drawTablaClientes(doc, r.top_clientes)
  drawTablaMotivos(doc, r.top_motivos)
  drawTablaProductos(doc, r.top_productos)
  drawTablaPatentes(doc, r.por_patente)
}

// ─────────────────────────────────────────────────────────────────────────
// Header (full bleed bar arriba)
// ─────────────────────────────────────────────────────────────────────────
function drawHeader(doc: Doc, r: RechazosResumenDia) {
  const pageWidth = doc.page.width
  const margin = doc.page.margins.left
  const usable = pageWidth - margin * 2
  const barH = 54

  // Barra superior
  doc.save()
  doc.rect(0, 0, pageWidth, barH).fill(COLOR_PRIMARY)
  doc.restore()

  // Lado izquierdo: título + subtítulo
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("Detalle de Rechazos", margin, 14, {
      width: usable / 2,
      lineBreak: false,
    })
  doc
    .fillColor("#dbeafe")
    .font("Helvetica")
    .fontSize(9)
    .text("Mercosur Distribuciones · dpo-app", margin, 34, {
      width: usable / 2,
      lineBreak: false,
    })

  // Lado derecho: fecha + timestamp
  const ahora = new Date()
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(formatFechaLarga(r.fecha), margin + usable / 2, 16, {
      width: usable / 2,
      align: "right",
      lineBreak: false,
    })
  doc
    .fillColor("#dbeafe")
    .font("Helvetica")
    .fontSize(8)
    .text(`Generado el ${formatTimestamp(ahora)}`, margin + usable / 2, 35, {
      width: usable / 2,
      align: "right",
      lineBreak: false,
    })

  doc.y = barH + 12
  doc.x = margin
  doc.fillColor(COLOR_TEXT)
}

// ─────────────────────────────────────────────────────────────────────────
// KPIs en una fila
// ─────────────────────────────────────────────────────────────────────────
function drawKPIs(doc: Doc, r: RechazosResumenDia) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2
  const gap = 6
  const cols = 6
  const cardW = (usable - gap * (cols - 1)) / cols
  const cardH = 50

  const tasaStr = r.kpis.tasa == null ? "—" : `${r.kpis.tasa.toFixed(2)}%`
  const cumple = r.kpis.tasa != null && r.kpis.tasa <= META_TASA
  const tasaColor =
    r.kpis.tasa == null ? COLOR_MUTED : cumple ? COLOR_OK : COLOR_ACCENT
  const tasaSub =
    r.kpis.tasa == null
      ? "sin ventas"
      : cumple
        ? `≤ meta ${META_TASA}%`
        : `> meta ${META_TASA}%`

  const kpis: Array<{ label: string; value: string; sub: string; color?: string }> = [
    { label: "Tasa", value: tasaStr, sub: tasaSub, color: tasaColor },
    {
      label: "Rechazados",
      value: formatInt(r.kpis.bultos_rechazados),
      sub: "bultos",
    },
    {
      label: "Entregados",
      value: formatInt(r.kpis.ventas_total_bultos),
      sub: "bultos",
    },
    { label: "Eventos", value: formatInt(r.kpis.eventos), sub: "rechazos" },
    {
      label: "Patentes",
      value: formatInt(r.kpis.patentes_con_rechazo),
      sub: "con rechazo",
    },
    {
      label: "Monto neto",
      value: formatMoneyShort(r.kpis.monto_neto),
      sub: "perdido",
    },
  ]

  const yRow = doc.y
  for (let i = 0; i < kpis.length; i++) {
    const x = margin + i * (cardW + gap)
    const k = kpis[i]
    doc.save()
    doc
      .lineWidth(0.5)
      .strokeColor(COLOR_BORDER)
      .roundedRect(x, yRow, cardW, cardH, 4)
      .stroke()
    doc.restore()

    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(7)
      .text(k.label.toUpperCase(), x + 6, yRow + 5, {
        width: cardW - 12,
        lineBreak: false,
      })

    doc
      .fillColor(k.color ?? COLOR_TEXT)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(k.value, x + 6, yRow + 17, {
        width: cardW - 12,
        lineBreak: false,
      })

    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(7)
      .text(k.sub, x + 6, yRow + 36, {
        width: cardW - 12,
        lineBreak: false,
      })
  }

  doc.y = yRow + cardH + 14
  doc.x = margin
}

// ─────────────────────────────────────────────────────────────────────────
// Section title
// ─────────────────────────────────────────────────────────────────────────
function drawSectionTitle(doc: Doc, title: string) {
  ensureSpace(doc, 28)
  const margin = doc.page.margins.left
  const yTitle = doc.y

  doc.save()
  doc.rect(margin, yTitle + 2, 3, 12).fill(COLOR_PRIMARY)
  doc.restore()

  doc
    .fillColor(COLOR_TEXT)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(title, margin + 10, yTitle, {
      width: doc.page.width - margin * 2 - 10,
      lineBreak: false,
    })

  doc.y = yTitle + 18
  doc.x = margin
}

// ─────────────────────────────────────────────────────────────────────────
// Table (fila con yRow fijo por celda; sin escalera)
// ─────────────────────────────────────────────────────────────────────────
interface Col<T> {
  header: string
  width: number
  align?: "left" | "right" | "center"
  get: (row: T) => string
}

function drawTable<T>(
  doc: Doc,
  rows: T[],
  cols: Col<T>[],
  emptyMsg = "Sin datos para este día",
) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  // Escalar widths al usable
  const sumW = cols.reduce((a, c) => a + c.width, 0)
  const scale = usable / sumW
  const widths = cols.map((c) => c.width * scale)

  ensureSpace(doc, HEADER_H + ROW_H + 4)

  // Header de tabla
  const yHead = doc.y
  doc.save()
  doc.rect(margin, yHead, usable, HEADER_H).fill(COLOR_HEADER_BG)
  doc.restore()

  let cx = margin
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]
    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(c.header.toUpperCase(), cx + 5, yHead + 5, {
        width: widths[i] - 10,
        align: c.align ?? "left",
        lineBreak: false,
      })
    cx += widths[i]
  }

  doc.y = yHead + HEADER_H

  // Línea bajo header
  doc.save()
  doc
    .strokeColor(COLOR_BORDER)
    .lineWidth(0.5)
    .moveTo(margin, doc.y)
    .lineTo(margin + usable, doc.y)
    .stroke()
  doc.restore()

  if (rows.length === 0) {
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text(emptyMsg, margin + 6, doc.y + 5, {
        width: usable - 12,
        lineBreak: false,
      })
    doc.y = doc.y + ROW_H + 4
    return
  }

  for (let r = 0; r < rows.length; r++) {
    // ⚠ Antes de cada fila, asegurar espacio (puede paginar). Después de
    // paginar, doc.y queda en el top de la nueva página y reanudamos.
    ensureSpace(doc, ROW_H)

    const yRow = doc.y

    // Banda alterna
    if (r % 2 === 1) {
      doc.save()
      doc.rect(margin, yRow, usable, ROW_H).fill(COLOR_ROW_ALT)
      doc.restore()
    }

    cx = margin
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]
      const text = c.get(rows[r])
      doc
        .fillColor(COLOR_TEXT)
        .font("Helvetica")
        .fontSize(8.5)
        .text(text, cx + 5, yRow + 4, {
          width: widths[i] - 10,
          align: c.align ?? "left",
          lineBreak: false,
          ellipsis: true,
        })
      cx += widths[i]
    }

    // Línea separadora sutil
    doc.save()
    doc
      .strokeColor("#e5e7eb")
      .lineWidth(0.3)
      .moveTo(margin, yRow + ROW_H)
      .lineTo(margin + usable, yRow + ROW_H)
      .stroke()
    doc.restore()

    // ⚠ Fijar doc.y al final de la fila (no donde lo dejó pdfkit)
    doc.y = yRow + ROW_H
  }

  doc.y = doc.y + 8
}

// ─────────────────────────────────────────────────────────────────────────
// Tablas concretas
// ─────────────────────────────────────────────────────────────────────────
function drawTablaClientes(doc: Doc, rows: RechazosResumenDia["top_clientes"]) {
  drawSectionTitle(doc, "Top 10 clientes con rechazo")
  drawTable<RechazosResumenDia["top_clientes"][number]>(doc, rows, [
    { header: "#", width: 18, align: "right", get: (r) => String(rows.indexOf(r) + 1) },
    { header: "Cliente", width: 200, get: (r) => r.nombre_cliente },
    {
      header: "Cód.",
      width: 45,
      align: "right",
      get: (r) => (r.id_cliente == null ? "—" : String(r.id_cliente)),
    },
    { header: "Bultos", width: 50, align: "right", get: (r) => formatInt(r.bultos) },
    { header: "Eventos", width: 55, align: "right", get: (r) => formatInt(r.eventos) },
    { header: "Monto neto", width: 80, align: "right", get: (r) => formatMoneyShort(r.monto_neto) },
    {
      header: "Motivo principal",
      width: 165,
      get: (r) => r.motivo_principal ?? "—",
    },
  ])
}

function drawTablaMotivos(doc: Doc, rows: RechazosResumenDia["top_motivos"]) {
  drawSectionTitle(doc, "Top 10 motivos de rechazo")
  drawTable<RechazosResumenDia["top_motivos"][number]>(doc, rows, [
    { header: "#", width: 18, align: "right", get: (r) => String(rows.indexOf(r) + 1) },
    { header: "Motivo", width: 280, get: (r) => r.ds_rechazo },
    { header: "Categoría", width: 130, get: (r) => prettyCategoria(r.categoria) },
    { header: "Bultos", width: 55, align: "right", get: (r) => formatInt(r.bultos) },
    { header: "Eventos", width: 60, align: "right", get: (r) => formatInt(r.eventos) },
  ])
}

function drawTablaProductos(doc: Doc, rows: RechazosResumenDia["top_productos"]) {
  drawSectionTitle(doc, "Top 10 productos rechazados")
  drawTable<RechazosResumenDia["top_productos"][number]>(doc, rows, [
    { header: "#", width: 18, align: "right", get: (r) => String(rows.indexOf(r) + 1) },
    { header: "Producto", width: 310, get: (r) => r.ds_articulo },
    {
      header: "Cód.",
      width: 55,
      align: "right",
      get: (r) => String(r.id_articulo),
    },
    { header: "Bultos", width: 55, align: "right", get: (r) => formatInt(r.bultos) },
    { header: "Monto neto", width: 85, align: "right", get: (r) => formatMoneyShort(r.monto_neto) },
  ])
}

function drawTablaPatentes(doc: Doc, rows: RechazosResumenDia["por_patente"]) {
  drawSectionTitle(doc, "Bultos rechazados por patente")
  drawTable<RechazosResumenDia["por_patente"][number]>(doc, rows, [
    { header: "#", width: 18, align: "right", get: (r) => String(rows.indexOf(r) + 1) },
    { header: "Patente", width: 80, get: (r) => r.patente },
    {
      header: "Chofer",
      width: 230,
      get: (r) => r.chofer_nombre ?? "(sin asignar)",
    },
    { header: "Bultos", width: 55, align: "right", get: (r) => formatInt(r.bultos) },
    { header: "Eventos", width: 60, align: "right", get: (r) => formatInt(r.eventos) },
    { header: "Monto neto", width: 85, align: "right", get: (r) => formatMoneyShort(r.monto_neto) },
  ])
}

// ─────────────────────────────────────────────────────────────────────────
// Footers (paginados, usando bufferPages)
// ─────────────────────────────────────────────────────────────────────────
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
    doc
      .strokeColor(COLOR_BORDER)
      .lineWidth(0.5)
      .moveTo(margin, y - 4)
      .lineTo(pageW - margin, y - 4)
      .stroke()
    doc.restore()

    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(
        "Mercosur Distribuciones · dpo-app · Reporte automático",
        margin,
        y,
        {
          width: pageW - margin * 2,
          align: "left",
          lineBreak: false,
        },
      )

    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(`Página ${i + 1} de ${total}`, margin, y, {
        width: pageW - margin * 2,
        align: "right",
        lineBreak: false,
      })
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────
function ensureSpace(doc: Doc, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom - 30
  if (doc.y + needed > bottom) {
    doc.addPage()
  }
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}

function formatMoneyShort(n: number): string {
  if (!n) return "$0"
  const abs = Math.abs(n)
  if (abs >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`
  }
  if (abs >= 1_000) {
    return `$${(n / 1_000).toFixed(0)}K`
  }
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(n)
}

function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  const diaSem = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ][dt.getUTCDay()]
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ]
  const pretty = `${diaSem} ${d} de ${meses[m - 1]} ${y}`
  return pretty.charAt(0).toUpperCase() + pretty.slice(1)
}

function formatTimestamp(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d)
}

function prettyCategoria(c: string): string {
  return c
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (m) => m.toUpperCase())
}
