/**
 * Helpers de render para los PDFs del plan de mantenimiento preventivo
 * (`estandar` = plantillas configuradas, `estado` = cómo viene la flota contra
 * ese plan). Cabecera azul marino con el logo de Mercosur, tiles de KPI, tablas
 * con texto que envuelve, chips de estado y bloque de firmas.
 *
 * Solo render/format: sin Supabase ni request. El logo va embebido en base64
 * (`_logo.ts`) para no depender de leer `public/` dentro de la función.
 */
import PDFDocument from "pdfkit"
import { LOGO_MERCOSUR_BLANCO_B64 } from "./_logo"

export type Doc = InstanceType<typeof PDFDocument>

export const COLOR = {
  marino: "#0b1f3a",
  acento: "#2563eb",
  texto: "#0f172a",
  gris: "#64748b",
  grisClaro: "#94a3b8",
  borde: "#cbd5e1",
  lineaFina: "#e2e8f0",
  cabecera: "#f1f5f9",
  zebra: "#f8fafc",
  ok: "#047857",
  okFondo: "#d1fae5",
  proximo: "#b45309",
  proximoFondo: "#fef3c7",
  vencido: "#b91c1c",
  vencidoFondo: "#fee2e2",
  sinDatos: "#475569",
  sinDatosFondo: "#e2e8f0",
} as const

export const MARGEN = 40
const ALTO_CABECERA = 78
const ALTO_CABECERA_SLIM = 26
const ALTO_PIE = 26

const LOGO = Buffer.from(LOGO_MERCOSUR_BLANCO_B64, "base64")

export interface MetaPdf {
  titulo: string
  subtitulo: string
  derechaTop: string
  derechaSub: string
  pie: string
  info: { Title: string; Subject: string }
}

export function anchoUtil(doc: Doc): number {
  return doc.page.width - MARGEN * 2
}

/** Crea el documento, dibuja cabeceras y pies, y resuelve con el PDF armado. */
export function renderPdf(meta: MetaPdf, cuerpo: (doc: Doc) => void): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
      bufferPages: true,
      autoFirstPage: false,
      info: { Title: meta.info.Title, Author: "Mercosur · dpo-app", Subject: meta.info.Subject },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    try {
      doc.addPage()
      drawCabecera(doc, meta)
      // Las páginas siguientes llevan una cabecera angosta con el logo.
      doc.on("pageAdded", () => drawCabeceraSlim(doc, meta.titulo))
      cuerpo(doc)
      drawPies(doc, meta.pie)
      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Cabeceras
// ─────────────────────────────────────────────────────────────────────────
function drawCabecera(doc: Doc, meta: MetaPdf) {
  const W = doc.page.width

  // Columnas: logo | título + subtítulo (envuelven) | pilar + fecha a la derecha.
  // La barra crece con lo que ocupe el título, así nunca se pisa con el subtítulo.
  const logoW = 120
  const logoH = logoW * (196 / 1400)
  const xSep = MARGEN + logoW + 16
  const xT = xSep + 14
  const wDer = 140
  const wT = W - MARGEN - wDer - xT - 10
  const yT = 16
  const tituloH = doc.font("Helvetica-Bold").fontSize(14).heightOfString(meta.titulo, { width: wT })
  const subH = doc
    .font("Helvetica")
    .fontSize(8.5)
    .heightOfString(meta.subtitulo, { width: wT, lineGap: 1 })
  const alto = Math.max(ALTO_CABECERA, yT + tituloH + 4 + subH + 14)

  doc.save()
  doc.rect(0, 0, W, alto).fill(COLOR.marino)
  doc.rect(0, alto, W, 3).fill(COLOR.acento)
  doc.restore()

  doc.image(LOGO, MARGEN, (alto - logoH) / 2, { width: logoW })

  doc.save()
  doc
    .strokeColor("#35507a")
    .lineWidth(0.6)
    .moveTo(xSep, 16)
    .lineTo(xSep, alto - 16)
    .stroke()
  doc.restore()

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(meta.titulo, xT, yT, { width: wT })
  doc
    .fillColor("#b6c6de")
    .font("Helvetica")
    .fontSize(8.5)
    .text(meta.subtitulo, xT, yT + tituloH + 4, { width: wT, lineGap: 1 })

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(meta.derechaTop, W - MARGEN - wDer, yT + 2, { width: wDer, align: "right" })
  doc
    .fillColor("#b6c6de")
    .font("Helvetica")
    .fontSize(7.5)
    .text(meta.derechaSub, W - MARGEN - wDer, yT + 18, { width: wDer, align: "right" })

  doc.y = alto + 20
  doc.x = MARGEN
  doc.fillColor(COLOR.texto)
}

function drawCabeceraSlim(doc: Doc, titulo: string) {
  const W = doc.page.width
  const y0 = doc.y
  doc.save()
  doc.rect(0, 0, W, ALTO_CABECERA_SLIM).fill(COLOR.marino)
  doc.restore()
  const logoW = 76
  const logoH = logoW * (196 / 1400)
  doc.image(LOGO, MARGEN, (ALTO_CABECERA_SLIM - logoH) / 2, { width: logoW })
  doc
    .fillColor("#b6c6de")
    .font("Helvetica")
    .fontSize(7.5)
    .text(titulo, MARGEN + logoW + 10, 9, {
      width: W - MARGEN * 2 - logoW - 10,
      align: "right",
      lineBreak: false,
    })
  doc.y = y0
  doc.x = MARGEN
  doc.fillColor(COLOR.texto)
}

// ─────────────────────────────────────────────────────────────────────────
// Pies (paginados, con bufferPages)
// ─────────────────────────────────────────────────────────────────────────
function drawPies(doc: Doc, texto: string) {
  const range = doc.bufferedPageRange()
  const total = range.count
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i)
    const pageW = doc.page.width
    const y = doc.page.height - 22

    // 🚨 El pie va debajo del margen inferior: con el margen puesto pdfkit lo
    // toma como texto que no entra y encadena páginas en blanco. Se anula
    // mientras se dibuja.
    const bottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0

    doc.save()
    doc
      .strokeColor(COLOR.borde)
      .lineWidth(0.5)
      .moveTo(MARGEN, y - 5)
      .lineTo(pageW - MARGEN, y - 5)
      .stroke()
    doc.restore()

    doc
      .fillColor(COLOR.gris)
      .font("Helvetica")
      .fontSize(7.5)
      .text(texto, MARGEN, y, { width: pageW - MARGEN * 2, align: "left", lineBreak: false })
    doc
      .fillColor(COLOR.gris)
      .font("Helvetica")
      .fontSize(7.5)
      .text(`Página ${i + 1} de ${total}`, MARGEN, y, {
        width: pageW - MARGEN * 2,
        align: "right",
        lineBreak: false,
      })

    doc.page.margins.bottom = bottom
  }
}

/** Salta de página si lo que viene no entra (deja lugar para el pie). */
export function asegurarEspacio(doc: Doc, alto: number) {
  const limite = doc.page.height - doc.page.margins.bottom - ALTO_PIE
  if (doc.y + alto > limite) doc.addPage()
}

// ─────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────
export interface Kpi {
  label: string
  valor: string
  sub: string
  color?: string
}

export function drawKpis(doc: Doc, kpis: Kpi[]) {
  const usable = anchoUtil(doc)
  const gap = 6
  const n = kpis.length
  const w = (usable - gap * (n - 1)) / n
  const h = 50
  asegurarEspacio(doc, h + 14)
  const y = doc.y

  kpis.forEach((k, i) => {
    const x = MARGEN + i * (w + gap)
    doc.save()
    doc.lineWidth(0.5).strokeColor(COLOR.borde).roundedRect(x, y, w, h, 4).stroke()
    doc.rect(x, y, 3, h).fill(k.color ?? COLOR.grisClaro)
    doc.restore()

    // `height` de una línea + ellipsis: lo que no entra se corta, no baja de
    // línea y se pisa con el valor.
    doc
      .fillColor(COLOR.gris)
      .font("Helvetica")
      .fontSize(6.5)
      .text(k.label.toUpperCase(), x + 8, y + 6, { width: w - 14, height: 8, ellipsis: true })
    doc
      .fillColor(k.color ?? COLOR.texto)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(k.valor, x + 8, y + 17, { width: w - 14, height: 18, ellipsis: true })
    doc
      .fillColor(COLOR.gris)
      .font("Helvetica")
      .fontSize(6.8)
      .text(k.sub, x + 8, y + 37, { width: w - 14, height: 8, ellipsis: true })
  })

  doc.y = y + h + 14
  doc.x = MARGEN
}

// ─────────────────────────────────────────────────────────────────────────
// Secciones y párrafos
// ─────────────────────────────────────────────────────────────────────────
export function drawSeccion(doc: Doc, titulo: string, sub?: string) {
  const usable = anchoUtil(doc)
  const subH = sub
    ? doc.font("Helvetica").fontSize(8).heightOfString(sub, { width: usable - 10 }) + 3
    : 0
  asegurarEspacio(doc, 22 + subH + 40)
  const y = doc.y

  doc.save()
  doc.rect(MARGEN, y + 2, 3, 13).fill(COLOR.acento)
  doc.restore()
  doc
    .fillColor(COLOR.texto)
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(titulo, MARGEN + 10, y, { width: usable - 10, lineBreak: false })
  if (sub) {
    doc
      .fillColor(COLOR.gris)
      .font("Helvetica")
      .fontSize(8)
      .text(sub, MARGEN + 10, y + 17, { width: usable - 10 })
  }
  doc.y = y + 19 + subH
  doc.x = MARGEN
}

export function drawParrafo(
  doc: Doc,
  texto: string,
  opts: { size?: number; color?: string; bold?: boolean; vineta?: boolean } = {}
) {
  const usable = anchoUtil(doc)
  const size = opts.size ?? 8.5
  const font = opts.bold ? "Helvetica-Bold" : "Helvetica"
  const x = opts.vineta ? MARGEN + 12 : MARGEN
  const w = usable - (opts.vineta ? 12 : 0)
  const h = doc.font(font).fontSize(size).heightOfString(texto, { width: w, lineGap: 1.5 })
  asegurarEspacio(doc, h + 4)
  const y = doc.y
  if (opts.vineta) {
    doc.save()
    doc.circle(MARGEN + 4, y + size * 0.55, 1.6).fill(COLOR.acento)
    doc.restore()
  }
  doc
    .fillColor(opts.color ?? COLOR.texto)
    .font(font)
    .fontSize(size)
    .text(texto, x, y, { width: w, lineGap: 1.5 })
  doc.y = y + h + 4
  doc.x = MARGEN
}

export function espacio(doc: Doc, alto = 8) {
  doc.y += alto
}

// ─────────────────────────────────────────────────────────────────────────
// Tabla con texto que envuelve, cabecera repetida y chips
// ─────────────────────────────────────────────────────────────────────────
export interface Chip {
  bg: string
  fg: string
}

export interface Col<T> {
  header: string
  width: number
  align?: "left" | "right" | "center"
  bold?: boolean
  get: (row: T, i: number) => string
  /** Si devuelve un chip, la celda se dibuja como píldora de color. */
  chip?: (row: T) => Chip | null
  /** Color del texto de la celda (por fila). */
  color?: (row: T) => string | null
}

const FUENTE_CELDA = 8.2
const PAD_X = 5
const PAD_Y = 4
const ALTO_HEADER = 18
const ALTO_MIN_FILA = 17

export function drawTabla<T>(
  doc: Doc,
  filas: T[],
  cols: Col<T>[],
  opts: { vacio?: string; atenuada?: (row: T) => boolean } = {}
) {
  const usable = anchoUtil(doc)
  const sumW = cols.reduce((a, c) => a + c.width, 0)
  const widths = cols.map((c) => (c.width * usable) / sumW)

  const header = () => {
    const y = doc.y
    doc.save()
    doc.rect(MARGEN, y, usable, ALTO_HEADER).fill(COLOR.cabecera)
    doc.restore()
    let x = MARGEN
    cols.forEach((c, i) => {
      doc
        .fillColor(COLOR.gris)
        .font("Helvetica-Bold")
        .fontSize(7)
        .text(c.header.toUpperCase(), x + PAD_X, y + 6, {
          width: widths[i] - PAD_X * 2,
          align: c.align ?? "left",
          height: 9,
          ellipsis: true,
        })
      x += widths[i]
    })
    doc.save()
    doc
      .strokeColor(COLOR.borde)
      .lineWidth(0.6)
      .moveTo(MARGEN, y + ALTO_HEADER)
      .lineTo(MARGEN + usable, y + ALTO_HEADER)
      .stroke()
    doc.restore()
    doc.y = y + ALTO_HEADER
  }

  asegurarEspacio(doc, ALTO_HEADER + ALTO_MIN_FILA + 4)
  header()

  if (filas.length === 0) {
    doc
      .fillColor(COLOR.gris)
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .text(opts.vacio ?? "Sin datos", MARGEN + PAD_X, doc.y + 5, {
        width: usable - PAD_X * 2,
        lineBreak: false,
      })
    doc.y += ALTO_MIN_FILA + 6
    doc.x = MARGEN
    return
  }

  filas.forEach((fila, r) => {
    const textos = cols.map((c) => c.get(fila, r))
    // Alto de la fila: la celda más alta (las de chip no envuelven).
    let h = ALTO_MIN_FILA
    cols.forEach((c, i) => {
      if (c.chip && c.chip(fila)) return
      const th = doc
        .font(c.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(FUENTE_CELDA)
        .heightOfString(textos[i], { width: widths[i] - PAD_X * 2 })
      h = Math.max(h, th + PAD_Y * 2)
    })

    const limite = doc.page.height - doc.page.margins.bottom - ALTO_PIE
    if (doc.y + h > limite) {
      doc.addPage()
      header()
    }

    const y = doc.y
    if (r % 2 === 1) {
      doc.save()
      doc.rect(MARGEN, y, usable, h).fill(COLOR.zebra)
      doc.restore()
    }

    const atenuada = opts.atenuada?.(fila) ?? false
    let x = MARGEN
    cols.forEach((c, i) => {
      const chip = c.chip?.(fila) ?? null
      if (chip) {
        drawChip(doc, textos[i], x, y, widths[i], h, chip, c.align ?? "center")
      } else {
        doc
          .fillColor(atenuada ? COLOR.grisClaro : (c.color?.(fila) ?? COLOR.texto))
          .font(c.bold && !atenuada ? "Helvetica-Bold" : "Helvetica")
          .fontSize(FUENTE_CELDA)
          .text(textos[i], x + PAD_X, y + PAD_Y, {
            width: widths[i] - PAD_X * 2,
            align: c.align ?? "left",
          })
      }
      x += widths[i]
    })

    doc.save()
    doc
      .strokeColor(COLOR.lineaFina)
      .lineWidth(0.3)
      .moveTo(MARGEN, y + h)
      .lineTo(MARGEN + usable, y + h)
      .stroke()
    doc.restore()

    doc.y = y + h
  })

  doc.y += 10
  doc.x = MARGEN
}

function drawChip(
  doc: Doc,
  texto: string,
  x: number,
  y: number,
  w: number,
  h: number,
  chip: Chip,
  align: "left" | "right" | "center"
) {
  const size = 7
  const tw = doc.font("Helvetica-Bold").fontSize(size).widthOfString(texto)
  const cw = Math.min(w - PAD_X * 2, tw + 12)
  const ch = 12
  const cx =
    align === "left"
      ? x + PAD_X
      : align === "right"
        ? x + w - PAD_X - cw
        : x + (w - cw) / 2
  const cy = y + (h - ch) / 2
  doc.save()
  doc.roundedRect(cx, cy, cw, ch, 6).fill(chip.bg)
  doc.restore()
  doc
    .fillColor(chip.fg)
    .font("Helvetica-Bold")
    .fontSize(size)
    .text(texto, cx, cy + 2.6, { width: cw, align: "center", lineBreak: false })
}

// ─────────────────────────────────────────────────────────────────────────
// Firmas (como en el estándar de fábrica: firma responsable + aclaración)
// ─────────────────────────────────────────────────────────────────────────
export function drawFirmas(doc: Doc, etiquetas = ["Firma responsable de Flota", "Aclaración y fecha"]) {
  const usable = anchoUtil(doc)
  asegurarEspacio(doc, 70)
  const y = doc.y + 34
  const gap = 40
  const w = (usable - gap) / 2
  etiquetas.forEach((et, i) => {
    const x = MARGEN + i * (w + gap)
    doc.save()
    doc.strokeColor(COLOR.gris).lineWidth(0.6).moveTo(x, y).lineTo(x + w, y).stroke()
    doc.restore()
    doc
      .fillColor(COLOR.gris)
      .font("Helvetica")
      .fontSize(7.5)
      .text(et, x, y + 4, { width: w, align: "center", lineBreak: false })
  })
  doc.y = y + 20
  doc.x = MARGEN
}

// ─────────────────────────────────────────────────────────────────────────
// Formato
// ─────────────────────────────────────────────────────────────────────────
export function fmtInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}

/** "dd/mm/aaaa" desde un ISO date o timestamp. */
export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

export function fmtFechaHora(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(",", "")
}

/** Fecha de hoy (ARG) en ISO, para el nombre del archivo. */
export function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** "20.000 km / 6 meses / 250 hs" o "—". */
export function fmtFrecuencia(f: {
  km: number | null
  meses: number | null
  horas: number | null
}): string {
  const partes: string[] = []
  if (f.km != null) partes.push(`${fmtInt(f.km)} km`)
  if (f.meses != null) partes.push(`${f.meses} ${f.meses === 1 ? "mes" : "meses"}`)
  if (f.horas != null) partes.push(`${fmtInt(f.horas)} hs`)
  return partes.length ? partes.join(" / ") : "—"
}

export function pluralUnidades(n: number): string {
  return `${n} ${n === 1 ? "unidad" : "unidades"}`
}

export function pluralTareas(n: number): string {
  return `${n} ${n === 1 ? "tarea" : "tareas"}`
}
