/**
 * PDF "Radar de Rechazos · Clientes CRÍTICOS" para pasar a Ventas.
 * Clona el patrón de `src/app/api/sueno/rechazo-pdf/route.ts` reusando los
 * helpers de `../../rechazos/_pdf-helpers`.
 *
 * Lista los clientes a entregar pasado mañana que cumplen el criterio compartido
 * de `@/lib/radar-rechazos/criterio` (2+ rechazos en 30 días o más de 1 por mes
 * en el año), agrupados por promotor.
 *
 * GET /api/radar-rechazos/pdf?fecha=YYYY-MM-DD   (sin `fecha`, la foto vigente)
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
  ensureSpace,
  formatFechaLarga,
  formatInt,
  formatMoneyFull,
  type Doc,
  type KPICard,
} from "../../rechazos/_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ error: "not-pampeana" }, { status: 404 })
  }
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // `fecha` (opcional): foto histórica de ese día de entrega en vez de la vigente.
  const fechaRaw = req.nextUrl.searchParams.get("fecha")
  const fecha = fechaRaw && /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw) ? fechaRaw : undefined

  const res = await getRadarCriticos(fecha)
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
  const { criticos, umbral_30d, umbral_anio, es_vigente } = data
  drawHeader(
    doc,
    "Radar de Rechazos · Críticos",
    formatFechaLarga(data.fecha_entrega),
    es_vigente ? "Para Ventas · avisar HOY" : "Foto histórica · solo consulta",
  )

  const totBultos = criticos.reduce((a, c) => a + c.bultos_pedido, 0)
  const totMonto = criticos.reduce((a, c) => a + c.monto_pedido, 0)
  const promotores = agruparPorPromotor(criticos).length

  const cards: KPICard[] = [
    { label: "Clientes críticos", value: formatInt(criticos.length), sub: `de ${formatInt(data.total_en_riesgo)} en riesgo`, color: COLOR_ACCENT },
    { label: "Con rechazo reciente", value: formatInt(criticos.filter((c) => c.por_ultimos_30d).length), sub: "en los últimos 30 días" },
    { label: "Bultos en juego", value: formatInt(totBultos), sub: "del pedido (en 2 días)" },
    { label: "Monto en juego", value: formatMoneyFull(totMonto), sub: "del pedido (en 2 días)" },
  ]
  drawKPIs(doc, cards)

  // ─── Por qué es crítico: el criterio, destacado y en criollo ───────────────
  const margin = doc.page.margins.left
  const anchoUtil = doc.page.width - margin * 2
  const criterio =
    `Un cliente entra en esta lista si tenía entrega programada para el ` +
    `${formatFechaLarga(data.fecha_entrega)} Y cumple CUALQUIERA de estas dos condiciones, ` +
    `sumando los rechazos por SIN DINERO y por CERRADO: ` +
    `(a) ${umbral_30d} o más rechazos en los últimos 30 días — columna "30d"; o ` +
    `(b) más de 1 rechazo por mes en promedio en los últimos 12 meses, es decir más de ` +
    `${umbral_anio} en el año — columna "12m". El * marca la condición que lo hizo entrar.`
  const detalle =
    `Cómo se cuenta: son VECES (cliente × fecha), no artículos — un rechazo de 13 productos cuenta 1. ` +
    `Las ventanas son móviles y se miden desde el día en que se generó la foto. Columnas: "Blt" = bultos ` +
    `del pedido en juego; "S/Din" y "Cerr" desagregan los 12 meses por motivo (sin dinero / cerrado); ` +
    `"Rech" = bultos que el cliente rechazó por esos dos motivos en el año.`

  const hCriterio = doc.font("Helvetica").fontSize(9).heightOfString(criterio, {
    width: anchoUtil - 20,
  })
  const hDetalle = doc.font("Helvetica").fontSize(8).heightOfString(detalle, {
    width: anchoUtil - 20,
  })
  const hCaja = hCriterio + hDetalle + 30

  ensureSpace(doc, hCaja + 6)
  const yCaja = doc.y
  doc.save()
  doc.roundedRect(margin, yCaja, anchoUtil, hCaja, 4).fill("#fffbeb")
  doc.roundedRect(margin, yCaja, anchoUtil, hCaja, 4)
    .lineWidth(0.8)
    .stroke(COLOR_ACCENT)
  doc.restore()

  doc
    .fillColor(COLOR_ACCENT)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("POR QUÉ ESTOS CLIENTES SON CRÍTICOS", margin + 10, yCaja + 8, {
      width: anchoUtil - 20,
    })
  doc
    .fillColor("#334155")
    .font("Helvetica")
    .fontSize(9)
    .text(criterio, margin + 10, doc.y + 2, { width: anchoUtil - 20 })
  doc
    .fillColor("#64748b")
    .font("Helvetica")
    .fontSize(8)
    .text(detalle, margin + 10, doc.y + 3, { width: anchoUtil - 20 })

  doc.y = yCaja + hCaja + 8
  doc.x = margin

  if (criticos.length === 0) {
    drawSectionTitle(doc, "Sin clientes críticos")
    doc
      .fillColor("#64748b")
      .font("Helvetica-Oblique")
      .fontSize(10)
      .text(
        `Ningún cliente de la entrega llega a ${umbral_30d} rechazos en los últimos 30 días ` +
          `ni supera los ${umbral_anio} en el año.`,
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
    { header: "Cliente", width: 165, get: (r: RadarCriticoRow) => clip(r.nombre_cliente ?? `Cliente ${r.id_cliente ?? "?"}`, 28) },
    { header: "Localidad", width: 95, get: (r: RadarCriticoRow) => clip(r.localidad ? titulo(r.localidad) : "—", 15) },
    // 🚨 Los encabezados van SIN espacios: el helper parte el texto en dos
    // líneas y la segunda se pisa con la primera fila de datos.
    { header: "Blt", width: 44, align: "right" as const, get: (r: RadarCriticoRow) => formatInt(r.bultos_pedido) },
    { header: "Pedido$", width: 76, align: "right" as const, get: (r: RadarCriticoRow) => (r.monto_pedido ? formatMoneyFull(r.monto_pedido) : "—") },
    // Las dos columnas del criterio: el * marca la condición que lo hizo entrar.
    // 🚨 Sólo caracteres WinAnsi: la Helvetica de pdfkit no tiene ▲ ni ✓ y los
    // dibuja como basura ("2▲" salía "2%²").
    { header: "30d", width: 42, align: "right" as const, get: (r: RadarCriticoRow) => `${formatInt(r.rechazos_30d)}${r.por_ultimos_30d ? "*" : ""}` },
    { header: "12m", width: 42, align: "right" as const, get: (r: RadarCriticoRow) => `${formatInt(r.rechazos_anio)}${r.por_promedio_anio ? "*" : ""}` },
    { header: "S/Din", width: 46, align: "right" as const, get: (r: RadarCriticoRow) => (r.sin_dinero_anio ? formatInt(r.sin_dinero_anio) : "—") },
    { header: "Cerr", width: 46, align: "right" as const, get: (r: RadarCriticoRow) => (r.cerrado_anio ? formatInt(r.cerrado_anio) : "—") },
    { header: "Rech", width: 52, align: "right" as const, get: (r: RadarCriticoRow) => (r.bultos_rechazados_anio ? formatInt(r.bultos_rechazados_anio) : "—") },
  ]

  for (const g of agruparPorPromotor(criticos)) {
    const en30d = g.rows.filter((c) => c.por_ultimos_30d).length
    drawSectionTitle(
      doc,
      `${g.promotor}  ·  ${g.rows.length} cliente${g.rows.length === 1 ? "" : "s"}` +
        (en30d ? `  ·  ${en30d} con rechazo en los últimos 30 días` : ""),
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
