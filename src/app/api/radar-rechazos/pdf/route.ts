/**
 * PDF "Radar de Rechazos · Clientes CRÍTICOS" para pasar a Ventas.
 * Clona el patrón de `src/app/api/sueno/rechazo-pdf/route.ts` reusando los
 * helpers de `../../rechazos/_pdf-helpers`.
 *
 * Lista los clientes a entregar pasado mañana con MÁS de `umbral` rechazos por SIN
 * DINERO en el año calendario, agrupados por promotor.
 *
 * GET /api/radar-rechazos/pdf?umbral=7
 */
import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { IS_MISIONES } from "@/lib/empresa"
import { requireAuth } from "@/lib/session"
import {
  getRadarCriticos,
  type RadarCriticoRow,
  type RadarCriticosData,
} from "@/actions/radar-rechazos"
import {
  COLOR_ACCENT,
  COLOR_PRIMARY,
  drawFooters,
  drawHeader,
  drawKPIs,
  drawSectionTitle,
  drawTable,
  formatFechaLarga,
  formatInt,
  formatMoneyFull,
  type Doc,
  type KPICard,
} from "../../rechazos/_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Umbral por defecto de "cliente crítico": más de N sin dinero en el año.
const UMBRAL_DEFAULT = 7

export async function GET(req: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ error: "not-pampeana" }, { status: 404 })
  }
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const umbralRaw = Number(req.nextUrl.searchParams.get("umbral"))
  const umbral =
    Number.isInteger(umbralRaw) && umbralRaw >= 0 ? umbralRaw : UMBRAL_DEFAULT

  const res = await getRadarCriticos(umbral)
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 500 })
  }
  if (!res.data) {
    return NextResponse.json({ error: "sin_foto" }, { status: 404 })
  }

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(res.data)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    )
  }

  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="radar-criticos-${res.data.fecha_entrega}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

function agruparPorPromotor(
  criticos: RadarCriticoRow[],
): { promotor: string; rows: RadarCriticoRow[] }[] {
  const grupos: { promotor: string; rows: RadarCriticoRow[] }[] = []
  for (const c of criticos) {
    const nombre = c.nombre_promotor ?? "(Sin promotor asignado)"
    const last = grupos[grupos.length - 1]
    if (last && last.promotor === nombre) last.rows.push(c)
    else grupos.push({ promotor: nombre, rows: [c] })
  }
  return grupos
}

async function renderPDF(data: RadarCriticosData): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Radar de Rechazos · Críticos · ${data.fecha_entrega}`,
        Author: "Mercosur · dpo-app",
        Subject: "Clientes críticos por sin dinero para Ventas",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    try {
      buildPDF(doc, data)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function buildPDF(doc: Doc, data: RadarCriticosData) {
  const { criticos, anio, umbral } = data
  drawHeader(
    doc,
    "Radar de Rechazos · Críticos",
    formatFechaLarga(data.fecha_entrega),
    "Para Ventas · avisar HOY",
  )

  const totBultos = criticos.reduce((a, c) => a + c.bultos_pedido, 0)
  const totMonto = criticos.reduce((a, c) => a + c.monto_pedido, 0)
  const promotores = agruparPorPromotor(criticos).length

  const cards: KPICard[] = [
    { label: "Clientes críticos", value: formatInt(criticos.length), sub: `de ${formatInt(data.total_en_riesgo)} en riesgo`, color: COLOR_ACCENT },
    { label: "Promotores", value: formatInt(promotores), sub: "a coordinar" },
    { label: "Bultos en juego", value: formatInt(totBultos), sub: "del pedido (en 2 días)" },
    { label: "Monto en juego", value: formatMoneyFull(totMonto), sub: "del pedido (en 2 días)" },
  ]
  drawKPIs(doc, cards)

  doc
    .fillColor("#475569")
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      `Criterio: clientes a entregar pasado mañana con más de ${umbral} rechazos por SIN DINERO en ${anio}. ` +
        `Avisarles hoy para coordinar el pago y evitar el rechazo. ` +
        `Las columnas "S/Dinero" (sin dinero) y "Cerr." (cerrado) cuentan los rechazos del año ${anio}.`,
      doc.page.margins.left,
      doc.y,
      { width: doc.page.width - doc.page.margins.left * 2 },
    )
  doc.y += 6
  doc.x = doc.page.margins.left

  if (criticos.length === 0) {
    drawSectionTitle(doc, "Sin clientes críticos")
    doc
      .fillColor("#64748b")
      .font("Helvetica-Oblique")
      .fontSize(10)
      .text(
        `Ningún cliente de la entrega supera los ${umbral} rechazos por sin dinero en ${anio}.`,
        doc.page.margins.left,
        doc.y,
      )
    return
  }

  // El helper de tabla no corta texto multi-palabra: recortamos a una línea.
  const clip = (s: string, n: number) =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
  const titulo = (s: string) =>
    s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())

  const cols = [
    { header: "Cliente", width: 200, get: (r: RadarCriticoRow) => clip(r.nombre_cliente ?? `Cliente ${r.id_cliente ?? "?"}`, 32) },
    { header: "Localidad", width: 130, get: (r: RadarCriticoRow) => clip(r.localidad ? titulo(r.localidad) : "—", 22) },
    { header: "Bultos", width: 48, align: "right" as const, get: (r: RadarCriticoRow) => formatInt(r.bultos_pedido) },
    { header: "Pedido $", width: 82, align: "right" as const, get: (r: RadarCriticoRow) => (r.monto_pedido ? formatMoneyFull(r.monto_pedido) : "—") },
    { header: "S/Dinero", width: 58, align: "right" as const, get: (r: RadarCriticoRow) => formatInt(r.sin_dinero_calendario) },
    { header: "Cerr.", width: 52, align: "right" as const, get: (r: RadarCriticoRow) => (r.cerrado_calendario ? formatInt(r.cerrado_calendario) : "—") },
  ]

  for (const g of agruparPorPromotor(criticos)) {
    const sdGrupo = g.rows.reduce((a, c) => a + c.sin_dinero_calendario, 0)
    drawSectionTitle(
      doc,
      `${g.promotor}  ·  ${g.rows.length} cliente${g.rows.length === 1 ? "" : "s"}  ·  ${sdGrupo} sin dinero acum.`,
    )
    drawTable(doc, g.rows, cols)
  }

  doc.moveDown(0.5)
  doc
    .fillColor(COLOR_PRIMARY)
    .font("Helvetica-Oblique")
    .fontSize(7.5)
    .text(
      `Foto del radar generada el ${new Date(data.generado_at).toLocaleString("es-AR")}.`,
      doc.page.margins.left,
      doc.y,
      { width: doc.page.width - doc.page.margins.left * 2 },
    )
}
