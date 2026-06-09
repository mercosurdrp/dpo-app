/**
 * Helpers compartidos para los PDFs de rechazos (período + plan de acción).
 *
 * Clonado del patrón visual de
 * `src/app/api/reuniones/rechazos-dia-pdf/route.ts`: barra de color en header,
 * KPIs en grid, tablas con bandas alternas, footer paginado.
 *
 * Solo helpers de render/format — sin acceso a Supabase ni a la request.
 */
import PDFDocument from "pdfkit"

export const COLOR_PRIMARY = "#1e40af"
export const COLOR_ACCENT = "#dc2626"
export const COLOR_OK = "#059669"
export const COLOR_BORDER = "#cbd5e1"
export const COLOR_HEADER_BG = "#f1f5f9"
export const COLOR_ROW_ALT = "#fafbfc"
export const COLOR_TEXT = "#0f172a"
export const COLOR_MUTED = "#64748b"

export const ROW_H = 16
export const HEADER_H = 18

export type Doc = InstanceType<typeof PDFDocument>

// ─────────────────────────────────────────────────────────────────────────
// Header (full bleed bar arriba)
// ─────────────────────────────────────────────────────────────────────────
export function drawHeader(doc: Doc, title: string, rightTop: string, rightSub?: string) {
  const pageWidth = doc.page.width
  const margin = doc.page.margins.left
  const usable = pageWidth - margin * 2
  const barH = 54

  doc.save()
  doc.rect(0, 0, pageWidth, barH).fill(COLOR_PRIMARY)
  doc.restore()

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(title, margin, 14, { width: usable / 2, lineBreak: false })
  doc
    .fillColor("#dbeafe")
    .font("Helvetica")
    .fontSize(9)
    .text("Mercosur Distribuciones · dpo-app", margin, 34, {
      width: usable / 2,
      lineBreak: false,
    })

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(rightTop, margin + usable / 2, 16, {
      width: usable / 2,
      align: "right",
      lineBreak: false,
    })
  doc
    .fillColor("#dbeafe")
    .font("Helvetica")
    .fontSize(8)
    .text(rightSub ?? `Generado el ${formatTimestamp(new Date())}`, margin + usable / 2, 35, {
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
export interface KPICard {
  label: string
  value: string
  sub: string
  color?: string
}

export function drawKPIs(doc: Doc, kpis: KPICard[]) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2
  const gap = 6
  const cols = kpis.length
  const cardW = (usable - gap * (cols - 1)) / cols
  const cardH = 50

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
      .text(k.label.toUpperCase(), x + 6, yRow + 5, { width: cardW - 12, lineBreak: false })

    doc
      .fillColor(k.color ?? COLOR_TEXT)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(k.value, x + 6, yRow + 17, { width: cardW - 12, lineBreak: false })

    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(7)
      .text(k.sub, x + 6, yRow + 36, { width: cardW - 12, lineBreak: false })
  }

  doc.y = yRow + cardH + 14
  doc.x = margin
}

// ─────────────────────────────────────────────────────────────────────────
// Section title
// ─────────────────────────────────────────────────────────────────────────
export function drawSectionTitle(doc: Doc, title: string) {
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
export interface Col<T> {
  header: string
  width: number
  align?: "left" | "right" | "center"
  get: (row: T) => string
}

export function drawTable<T>(
  doc: Doc,
  rows: T[],
  cols: Col<T>[],
  emptyMsg = "Sin datos en el período",
) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  const sumW = cols.reduce((a, c) => a + c.width, 0)
  const scale = usable / sumW
  const widths = cols.map((c) => c.width * scale)

  ensureSpace(doc, HEADER_H + ROW_H + 4)

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
      .text(emptyMsg, margin + 6, doc.y + 5, { width: usable - 12, lineBreak: false })
    doc.y = doc.y + ROW_H + 4
    return
  }

  for (let r = 0; r < rows.length; r++) {
    ensureSpace(doc, ROW_H)
    const yRow = doc.y

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

    doc.save()
    doc
      .strokeColor("#e5e7eb")
      .lineWidth(0.3)
      .moveTo(margin, yRow + ROW_H)
      .lineTo(margin + usable, yRow + ROW_H)
      .stroke()
    doc.restore()

    doc.y = yRow + ROW_H
  }

  doc.y = doc.y + 8
}

// ─────────────────────────────────────────────────────────────────────────
// Footers (paginados, usando bufferPages)
// ─────────────────────────────────────────────────────────────────────────
export function drawFooters(doc: Doc) {
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
      .text("Mercosur Distribuciones · dpo-app · Reporte automático", margin, y, {
        width: pageW - margin * 2,
        align: "left",
        lineBreak: false,
      })

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
export function ensureSpace(doc: Doc, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom - 30
  if (doc.y + needed > bottom) {
    doc.addPage()
  }
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}

/** HL sin sufijo (la columna/label ya dice HL). 2 decimales hasta 100, 1 por encima. */
export function formatHl(n: number): string {
  if (!Number.isFinite(n)) return "—"
  const dec = Math.abs(n) >= 100 ? 1 : 2
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n)
}

export function formatMoneyShort(n: number): string {
  if (!n) return "$0"
  const abs = Math.abs(n)
  if (abs >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`
  }
  if (abs >= 1_000) {
    return `$${(n / 1_000).toFixed(0)}K`
  }
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}

/** Monto completo en es-AR con separador de miles, prefijo $. */
export function formatMoneyFull(n: number): string {
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)}`
}

export function formatPct(n: number | null | undefined, dec = 2): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(dec)}%`
}

export function formatFechaLarga(iso: string): string {
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

/** "dd/mm/aaaa" desde un ISO date o timestamp. */
export function formatFechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** "dd/mm/aaaa HH:MM" para timestamps con hora (es-AR). */
export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d)
}

export function formatTimestamp(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d)
}
