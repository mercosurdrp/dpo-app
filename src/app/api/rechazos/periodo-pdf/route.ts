/**
 * PDF "Resumen de Rechazos del Período" — clonado del patrón de
 * `src/app/api/reuniones/rechazos-dia-pdf/route.ts`, pero para un rango.
 *
 * GET /api/rechazos/periodo-pdf?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *   &motivos=1,2&fleteros=AF028YB&canales=...&supervisores=...
 *
 * Reusa `getRechazosComparado` (comparado.ts) para el cómputo y el parser de
 * search params (search-params.ts) para los filtros.
 */
import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { parseRechazosSearchParams } from "@/lib/rechazos/search-params"
import { getRechazosComparado } from "@/lib/rechazos/comparado"
import type { RechazosComparado } from "@/lib/types/rechazos"
import {
  COLOR_ACCENT,
  COLOR_MUTED,
  COLOR_OK,
  drawFooters,
  drawHeader,
  drawKPIs,
  drawSectionTitle,
  drawTable,
  formatFechaLarga,
  formatHl,
  formatInt,
  formatMoneyFull,
  formatMoneyShort,
  formatPct,
  type Doc,
  type KPICard,
} from "../_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const META_TASA = 1.7

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const desde = req.nextUrl.searchParams.get("desde")
  const hasta = req.nextUrl.searchParams.get("hasta")
  if (!desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !hasta || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json(
      { error: "invalid_params", message: "Parámetros 'desde' y 'hasta' inválidos (esperado YYYY-MM-DD)" },
      { status: 400 },
    )
  }

  const raw: Record<string, string | string[]> = {}
  for (const [k, v] of req.nextUrl.searchParams.entries()) raw[k] = v

  let request
  try {
    request = parseRechazosSearchParams(raw)
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_params", message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }

  let data: RechazosComparado
  try {
    const supa = await createClient()
    const result = await getRechazosComparado(supa, {
      desde: request.desde,
      hasta: request.hasta,
      filters: request.filters,
      mode: request.mode,
    })
    if (!result.ok) {
      return NextResponse.json({ error: "compute_error", message: result.error }, { status: 500 })
    }
    data = result.data
  } catch (err) {
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "Error generando resumen" },
      { status: 500 },
    )
  }

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(request.desde, request.hasta, data)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error renderizando PDF" },
      { status: 500 },
    )
  }

  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rechazos-periodo-${request.desde}_${request.hasta}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

async function renderPDF(desde: string, hasta: string, d: RechazosComparado): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Resumen de Rechazos ${desde} a ${hasta}`,
        Author: "Mercosur Distribuciones",
        Subject: `Rechazos del período ${desde} a ${hasta}`,
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    try {
      buildPDF(doc, desde, hasta, d)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function buildPDF(doc: Doc, desde: string, hasta: string, d: RechazosComparado) {
  drawHeader(
    doc,
    "Resumen de Rechazos del Período",
    `${formatFechaLarga(desde)}`,
    `al ${formatFechaLarga(hasta)}`,
  )

  drawKPIsPeriodo(doc, d)

  drawSectionTitle(doc, "Detalle por día")
  drawTable(doc, d.series.por_dia, [
    { header: "Fecha", width: 110, get: (r) => formatFechaLarga(r.fecha) },
    { header: "Eventos", width: 60, align: "right", get: (r) => formatInt(r.eventos) },
    { header: "Bultos", width: 60, align: "right", get: (r) => formatInt(r.bultos) },
    { header: "HL", width: 60, align: "right", get: (r) => formatHl(r.hl) },
    { header: "Tasa", width: 55, align: "right", get: (r) => formatPct(r.tasa) },
    { header: "Monto neto", width: 90, align: "right", get: (r) => formatMoneyShort(r.monto) },
  ])

  drawSectionTitle(doc, "Top 10 clientes con rechazo")
  drawTable(doc, d.agg.por_cliente.slice(0, 10), [
    { header: "#", width: 18, align: "right", get: (r) => String(d.agg.por_cliente.indexOf(r) + 1) },
    { header: "Cliente", width: 230, get: (r) => r.nombre_cliente },
    { header: "Eventos", width: 60, align: "right", get: (r) => formatInt(r.eventos) },
    { header: "Bultos", width: 60, align: "right", get: (r) => formatInt(r.bultos) },
    { header: "HL", width: 55, align: "right", get: (r) => formatHl(r.hl) },
    { header: "Monto neto", width: 90, align: "right", get: (r) => formatMoneyShort(r.monto) },
  ])

  drawSectionTitle(doc, "Top 10 motivos de rechazo")
  drawTable(doc, d.agg.por_motivo.slice(0, 10), [
    { header: "#", width: 18, align: "right", get: (r) => String(d.agg.por_motivo.indexOf(r) + 1) },
    { header: "Motivo", width: 250, get: (r) => r.ds_rechazo },
    { header: "Eventos", width: 60, align: "right", get: (r) => formatInt(r.eventos) },
    { header: "HL", width: 60, align: "right", get: (r) => formatHl(r.hl) },
    { header: "% total", width: 55, align: "right", get: (r) => formatPct(r.pct_del_total, 1) },
    { header: "Monto neto", width: 90, align: "right", get: (r) => formatMoneyShort(r.monto) },
  ])

  drawSectionTitle(doc, "Top 10 productos rechazados")
  drawTable(doc, d.agg.por_producto.slice(0, 10), [
    { header: "#", width: 18, align: "right", get: (r) => String(d.agg.por_producto.indexOf(r) + 1) },
    { header: "Producto", width: 280, get: (r) => r.ds_articulo },
    { header: "Cód.", width: 50, align: "right", get: (r) => String(r.id_articulo) },
    { header: "Eventos", width: 55, align: "right", get: (r) => formatInt(r.eventos) },
    { header: "HL", width: 55, align: "right", get: (r) => formatHl(r.hl) },
    { header: "Monto neto", width: 85, align: "right", get: (r) => formatMoneyShort(r.monto) },
  ])
}

function drawKPIsPeriodo(doc: Doc, d: RechazosComparado) {
  const k = d.actual
  const cumple = k.tasa <= META_TASA
  const tasaColor = k.total_hl_entregados <= 0 ? COLOR_MUTED : cumple ? COLOR_OK : COLOR_ACCENT
  const tasaSub =
    k.total_hl_entregados <= 0
      ? "sin ventas"
      : cumple
        ? `≤ meta ${META_TASA}%`
        : `> meta ${META_TASA}%`

  const cards: KPICard[] = [
    { label: "Tasa HL", value: formatPct(k.tasa), sub: tasaSub, color: tasaColor },
    { label: "Monto neto", value: formatMoneyShort(k.monto_neto), sub: "perdido" },
    {
      label: "HL entregados",
      value: formatHl(k.total_hl_entregados),
      sub: `${formatInt(k.total_entregados)} bultos`,
    },
    { label: "Eventos", value: formatInt(k.eventos), sub: `${formatInt(k.clientes_afectados)} clientes` },
    { label: "% controlable", value: formatPct(k.pct_controlable, 1), sub: "del HL" },
    { label: "Ticket prom.", value: formatMoneyShort(k.ticket_promedio), sub: "por evento" },
  ]
  drawKPIs(doc, cards)

  // Línea con monto neto completo + período, abajo de los KPIs.
  const margin = doc.page.margins.left
  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text(
      `Monto neto total perdido: ${formatMoneyFull(k.monto_neto)} · ${formatInt(k.bultos)} bultos rechazados · ${formatHl(k.hl)} HL`,
      margin,
      doc.y,
      { width: doc.page.width - margin * 2, lineBreak: false },
    )
  doc.y = doc.y + 14
  doc.x = margin
}
