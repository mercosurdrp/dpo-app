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
const COLOR_TEXT = "#0f172a"
const COLOR_MUTED = "#64748b"
const META_TASA = 1.7

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
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function buildPDF(doc: InstanceType<typeof PDFDocument>, r: RechazosResumenDia) {
  drawHeader(doc, r)
  drawKPIs(doc, r)
  drawTablaClientes(doc, r.top_clientes)
  drawTablaMotivos(doc, r.top_motivos)
  drawTablaProductos(doc, r.top_productos)
  drawTablaPatentes(doc, r.por_patente)
  drawFooters(doc)
}

// ─────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────
function drawHeader(doc: InstanceType<typeof PDFDocument>, r: RechazosResumenDia) {
  const pageWidth = doc.page.width
  const margin = doc.page.margins.left

  // Barra superior azul (full bleed)
  doc.save()
  doc.rect(0, 0, pageWidth, 56).fill(COLOR_PRIMARY)
  doc.restore()

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("Detalle de Rechazos", margin, 16, { lineBreak: false })

  doc
    .fillColor("#dbeafe")
    .font("Helvetica")
    .fontSize(10)
    .text(`Mercosur Distribuciones · dpo-app`, margin, 38, { lineBreak: false })

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(formatFechaLarga(r.fecha), margin, 18, {
      width: pageWidth - margin * 2,
      align: "right",
      lineBreak: false,
    })

  const ahora = new Date()
  doc
    .fillColor("#dbeafe")
    .font("Helvetica")
    .fontSize(9)
    .text(`Generado el ${formatTimestamp(ahora)}`, margin, 40, {
      width: pageWidth - margin * 2,
      align: "right",
      lineBreak: false,
    })

  doc.y = 72
  doc.x = margin
  doc.fillColor(COLOR_TEXT)
}

// ─────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────
function drawKPIs(doc: InstanceType<typeof PDFDocument>, r: RechazosResumenDia) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2
  const gap = 8
  const cols = 4
  const cardW = (usable - gap * (cols - 1)) / cols
  const cardH = 56

  const tasaStr = r.kpis.tasa == null ? "—" : `${r.kpis.tasa.toFixed(2)}%`
  const cumple = r.kpis.tasa != null && r.kpis.tasa <= META_TASA
  const tasaColor = r.kpis.tasa == null
    ? COLOR_MUTED
    : cumple
      ? COLOR_OK
      : COLOR_ACCENT
  const tasaSub = r.kpis.tasa == null
    ? "sin ventas"
    : cumple
      ? `cumple meta ${META_TASA}%`
      : `supera meta ${META_TASA}%`

  const kpis: Array<{
    label: string
    value: string
    color?: string
    sub?: string
  }> = [
    { label: "Tasa del día", value: tasaStr, color: tasaColor, sub: tasaSub },
    {
      label: "Bultos rechazados",
      value: formatInt(r.kpis.bultos_rechazados),
      sub: `${formatInt(r.kpis.eventos)} eventos`,
    },
    {
      label: "Bultos entregados",
      value: formatInt(r.kpis.ventas_total_bultos),
      sub: "total del día",
    },
    {
      label: "Patentes con rechazo",
      value: formatInt(r.kpis.patentes_con_rechazo),
      sub: "vehículos involucrados",
    },
  ]

  const startY = doc.y
  for (let i = 0; i < kpis.length; i++) {
    const x = margin + i * (cardW + gap)
    const k = kpis[i]
    doc.save()
    doc
      .lineWidth(0.5)
      .strokeColor(COLOR_BORDER)
      .roundedRect(x, startY, cardW, cardH, 4)
      .stroke()
    doc.restore()

    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(k.label.toUpperCase(), x + 8, startY + 6, {
        width: cardW - 16,
        lineBreak: false,
      })

    doc
      .fillColor(k.color ?? COLOR_TEXT)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(k.value, x + 8, startY + 18, {
        width: cardW - 16,
        lineBreak: false,
      })

    if (k.sub) {
      doc
        .fillColor(COLOR_MUTED)
        .font("Helvetica")
        .fontSize(8)
        .text(k.sub, x + 8, startY + 40, {
          width: cardW - 16,
          lineBreak: false,
        })
    }
  }

  doc.y = startY + cardH + 8

  // Segunda fila — montos
  const startY2 = doc.y
  const kpis2: Array<{ label: string; value: string }> = [
    { label: "Monto neto perdido", value: formatMoney(r.kpis.monto_neto) },
    { label: "Monto bruto perdido", value: formatMoney(r.kpis.monto_bruto) },
  ]
  const cardW2 = (usable - gap) / 2
  for (let i = 0; i < kpis2.length; i++) {
    const x = margin + i * (cardW2 + gap)
    const k = kpis2[i]
    doc.save()
    doc
      .lineWidth(0.5)
      .strokeColor(COLOR_BORDER)
      .roundedRect(x, startY2, cardW2, 42, 4)
      .stroke()
    doc.restore()

    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(k.label.toUpperCase(), x + 10, startY2 + 6, {
        width: cardW2 - 20,
        lineBreak: false,
      })

    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(k.value, x + 10, startY2 + 18, {
        width: cardW2 - 20,
        lineBreak: false,
      })
  }
  doc.y = startY2 + 42 + 14
}

// ─────────────────────────────────────────────────────────────────────────
// Tablas
// ─────────────────────────────────────────────────────────────────────────
interface Column {
  header: string
  width: number
  align?: "left" | "right" | "center"
  get: (row: unknown) => string
}

function drawSectionTitle(doc: InstanceType<typeof PDFDocument>, title: string, subtitle?: string) {
  ensureSpace(doc, 56)
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  doc.save()
  doc.rect(margin, doc.y, 3, 14).fill(COLOR_PRIMARY)
  doc.restore()

  doc
    .fillColor(COLOR_TEXT)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(title, margin + 10, doc.y, { width: usable - 10, lineBreak: false })

  if (subtitle) {
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text(subtitle, margin + 10, doc.y + 14, {
        width: usable - 10,
        lineBreak: false,
      })
    doc.y += 28
  } else {
    doc.y += 18
  }
  doc.x = margin
}

function drawTable<T>(
  doc: InstanceType<typeof PDFDocument>,
  rows: T[],
  cols: Array<{
    header: string
    width: number
    align?: "left" | "right" | "center"
    get: (row: T) => string
  }>,
  emptyMsg = "Sin datos para este día",
) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  // Ajustar widths a usable
  const sumW = cols.reduce((a, c) => a + c.width, 0)
  const scale = usable / sumW
  const widths = cols.map((c) => c.width * scale)

  const rowH = 18
  const headerH = 20

  ensureSpace(doc, headerH + rowH + 4)

  // Header
  doc.save()
  doc.rect(margin, doc.y, usable, headerH).fill(COLOR_HEADER_BG)
  doc.restore()

  let cx = margin
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]
    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(c.header, cx + 6, doc.y + 6, {
        width: widths[i] - 12,
        align: c.align ?? "left",
        lineBreak: false,
      })
    cx += widths[i]
  }
  doc.y += headerH

  // Separator under header
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
      .text(emptyMsg, margin + 6, doc.y + 6, {
        width: usable - 12,
        lineBreak: false,
      })
    doc.y += rowH + 4
    return
  }

  for (let r = 0; r < rows.length; r++) {
    ensureSpace(doc, rowH)
    if (r % 2 === 1) {
      doc.save()
      doc.rect(margin, doc.y, usable, rowH).fill("#fafbfc")
      doc.restore()
    }
    cx = margin
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]
      const text = c.get(rows[r])
      doc
        .fillColor(COLOR_TEXT)
        .font("Helvetica")
        .fontSize(9)
        .text(text, cx + 6, doc.y + 5, {
          width: widths[i] - 12,
          align: c.align ?? "left",
          lineBreak: false,
          ellipsis: true,
        })
      cx += widths[i]
    }
    doc.y += rowH
  }
  doc.y += 6
}

function drawTablaClientes(
  doc: InstanceType<typeof PDFDocument>,
  rows: RechazosResumenDia["top_clientes"],
) {
  drawSectionTitle(
    doc,
    "Top 10 clientes con rechazo",
    "Ordenados por bultos rechazados",
  )
  drawTable(doc, rows, [
    { header: "#", width: 22, align: "right", get: (r) => String(rows.indexOf(r) + 1) },
    { header: "Cliente", width: 220, get: (r) => r.nombre_cliente },
    {
      header: "Cód.",
      width: 50,
      align: "right",
      get: (r) => (r.id_cliente == null ? "—" : String(r.id_cliente)),
    },
    { header: "Bultos", width: 60, align: "right", get: (r) => formatInt(r.bultos) },
    { header: "Eventos", width: 50, align: "right", get: (r) => formatInt(r.eventos) },
    { header: "Monto neto", width: 80, align: "right", get: (r) => formatMoney(r.monto_neto) },
    {
      header: "Motivo principal",
      width: 180,
      get: (r) => r.motivo_principal ?? "—",
    },
  ])
}

function drawTablaMotivos(
  doc: InstanceType<typeof PDFDocument>,
  rows: RechazosResumenDia["top_motivos"],
) {
  drawSectionTitle(doc, "Top 10 motivos de rechazo", "Por bultos rechazados")
  drawTable(doc, rows, [
    { header: "#", width: 22, align: "right", get: (r) => String(rows.indexOf(r) + 1) },
    { header: "Motivo", width: 320, get: (r) => r.ds_rechazo },
    { header: "Categoría", width: 120, get: (r) => prettyCategoria(r.categoria) },
    { header: "Bultos", width: 60, align: "right", get: (r) => formatInt(r.bultos) },
    { header: "Eventos", width: 60, align: "right", get: (r) => formatInt(r.eventos) },
  ])
}

function drawTablaProductos(
  doc: InstanceType<typeof PDFDocument>,
  rows: RechazosResumenDia["top_productos"],
) {
  drawSectionTitle(doc, "Top 10 productos rechazados", "Por bultos rechazados")
  drawTable(doc, rows, [
    { header: "#", width: 22, align: "right", get: (r) => String(rows.indexOf(r) + 1) },
    { header: "Producto", width: 340, get: (r) => r.ds_articulo },
    { header: "Cód.", width: 60, align: "right", get: (r) => String(r.id_articulo) },
    { header: "Bultos", width: 60, align: "right", get: (r) => formatInt(r.bultos) },
    { header: "Monto neto", width: 90, align: "right", get: (r) => formatMoney(r.monto_neto) },
  ])
}

function drawTablaPatentes(
  doc: InstanceType<typeof PDFDocument>,
  rows: RechazosResumenDia["por_patente"],
) {
  drawSectionTitle(
    doc,
    "Bultos rechazados por patente",
    "Todas las patentes con rechazo del día",
  )
  drawTable(doc, rows, [
    { header: "#", width: 22, align: "right", get: (r) => String(rows.indexOf(r) + 1) },
    { header: "Patente", width: 90, get: (r) => r.patente },
    {
      header: "Chofer",
      width: 220,
      get: (r) => r.chofer_nombre ?? "(sin asignar)",
    },
    { header: "Bultos", width: 70, align: "right", get: (r) => formatInt(r.bultos) },
    { header: "Eventos", width: 60, align: "right", get: (r) => formatInt(r.eventos) },
    { header: "Monto neto", width: 90, align: "right", get: (r) => formatMoney(r.monto_neto) },
  ])
}

// ─────────────────────────────────────────────────────────────────────────
// Footer (paginación)
// ─────────────────────────────────────────────────────────────────────────
function drawFooters(doc: InstanceType<typeof PDFDocument>) {
  const range = doc.bufferedPageRange()
  const total = range.count
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i)
    const pageW = doc.page.width
    const pageH = doc.page.height
    const margin = doc.page.margins.left
    const y = pageH - 24

    doc.save()
    doc
      .strokeColor(COLOR_BORDER)
      .lineWidth(0.5)
      .moveTo(margin, y - 6)
      .lineTo(pageW - margin, y - 6)
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
        { width: pageW - margin * 2, align: "left", lineBreak: false },
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
function ensureSpace(doc: InstanceType<typeof PDFDocument>, needed: number) {
  const pageH = doc.page.height
  const bottom = pageH - doc.page.margins.bottom - 30 // 30 reservado para footer
  if (doc.y + needed > bottom) {
    doc.addPage()
  }
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}

function formatMoney(n: number): string {
  if (!n) return "$0"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
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
