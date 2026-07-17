/**
 * PDF de una orden de trabajo programada: hoja imprimible para enviar o
 * entregarle al taller/mecánico con los trabajos mapeados por unidad.
 *
 * GET /api/vehiculos/ot-programada/pdf?id=<uuid>
 */
import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import {
  COLOR_BORDER,
  COLOR_HEADER_BG,
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_TEXT,
  drawFooters,
  drawHeader,
  drawSectionTitle,
  ensureSpace,
  formatFechaLarga,
  type Doc,
} from "../../../rechazos/_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface OtPdfData {
  dominio: string
  fecha_programada: string
  tareas: string[]
  taller: string
  notas: string
  estado: string
  creado_por: string | null
  marca: string | null
  modelo: string | null
  anio: number | null
  odometro: number | null
  odometro_fecha: string | null
}

const ESTADOS: Record<string, string> = {
  planificada: "Planificada",
  enviada: "Enviada al taller",
  en_taller: "En taller",
  realizada: "Realizada",
  cancelada: "Cancelada",
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 })

  const supabase = await createClient()
  const { data: ot, error } = await supabase
    .from("mantenimiento_ot_programadas")
    .select("dominio, fecha_programada, tareas, taller, notas, estado, created_by")
    .eq("id", id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!ot) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 })

  const [fichaRes, perfilRes] = await Promise.all([
    supabase
      .from("vehiculos_ficha")
      .select("marca, modelo, anio, cf_odometro, cf_odometro_fecha")
      .eq("dominio", ot.dominio)
      .maybeSingle(),
    ot.created_by
      ? supabase.from("profiles").select("nombre").eq("id", ot.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const data: OtPdfData = {
    dominio: ot.dominio,
    fecha_programada: ot.fecha_programada,
    tareas: Array.isArray(ot.tareas) ? (ot.tareas as string[]) : [],
    taller: ot.taller ?? "",
    notas: ot.notas ?? "",
    estado: ot.estado,
    creado_por: perfilRes.data?.nombre ?? null,
    marca: fichaRes.data?.marca ?? null,
    modelo: fichaRes.data?.modelo ?? null,
    anio: fichaRes.data?.anio ?? null,
    odometro: fichaRes.data?.cf_odometro != null ? Number(fichaRes.data.cf_odometro) : null,
    odometro_fecha: fichaRes.data?.cf_odometro_fecha ?? null,
  }

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando PDF" },
      { status: 500 },
    )
  }

  return new NextResponse(new Uint8Array(pdfBuf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="OT-${data.dominio}-${data.fecha_programada}.pdf"`,
    },
  })
}

async function renderPDF(data: OtPdfData): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `OT programada ${data.dominio} ${data.fecha_programada}`,
        Author: "Mercosur · dpo-app",
        Subject: "Orden de trabajo programada de flota",
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

function campo(doc: Doc, x: number, y: number, w: number, label: string, valor: string) {
  doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_MUTED).text(label.toUpperCase(), x, y, {
    width: w,
    lineBreak: false,
  })
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_TEXT)
    .text(valor || "—", x, y + 10, { width: w, lineBreak: false })
}

function buildPDF(doc: Doc, data: OtPdfData) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  drawHeader(
    doc,
    "Orden de Trabajo Programada",
    data.dominio,
    formatFechaLarga(data.fecha_programada),
  )
  doc.y = 70

  // ---- Datos de la unidad y de la orden ----
  drawSectionTitle(doc, "Unidad")
  let y = doc.y + 2
  doc
    .rect(margin, y, usable, 44)
    .fillOpacity(1)
    .fill(COLOR_HEADER_BG)
  doc.fillOpacity(1)
  const col = usable / 4
  campo(doc, margin + 8, y + 7, col - 12, "Dominio", data.dominio)
  campo(
    doc,
    margin + 8 + col,
    y + 7,
    col * 1.6 - 12,
    "Marca / Modelo",
    [data.marca, data.modelo, data.anio ? `(${data.anio})` : null].filter(Boolean).join(" "),
  )
  campo(
    doc,
    margin + 8 + col * 2.6,
    y + 7,
    col * 1.4 - 12,
    "Odómetro",
    data.odometro != null
      ? `${new Intl.NumberFormat("es-AR").format(data.odometro)} km`
      : "—",
  )
  doc.y = y + 52

  drawSectionTitle(doc, "Orden")
  y = doc.y + 2
  doc.rect(margin, y, usable, 44).fill(COLOR_HEADER_BG)
  campo(doc, margin + 8, y + 7, col - 12, "Fecha programada", data.fecha_programada)
  campo(doc, margin + 8 + col, y + 7, col - 12, "Estado", ESTADOS[data.estado] ?? data.estado)
  campo(doc, margin + 8 + col * 2, y + 7, col - 12, "Taller", data.taller)
  campo(doc, margin + 8 + col * 3, y + 7, col - 12, "Programada por", data.creado_por ?? "—")
  doc.y = y + 52

  // ---- Trabajos a realizar (checklist para el mecánico) ----
  drawSectionTitle(doc, `Trabajos a realizar (${data.tareas.length})`)
  doc.y += 2
  for (const [i, tarea] of data.tareas.entries()) {
    // Altura real del texto para que las tareas largas no pisen a la siguiente.
    doc.font("Helvetica").fontSize(10)
    const textW = usable - 46
    const h = Math.max(20, doc.heightOfString(tarea, { width: textW }) + 8)
    ensureSpace(doc, h + 4)
    const ty = doc.y
    doc
      .strokeColor(COLOR_BORDER)
      .lineWidth(0.75)
      .rect(margin + 4, ty + 3, 11, 11)
      .stroke()
    doc
      .fillColor(COLOR_MUTED)
      .fontSize(8)
      .text(String(i + 1), margin + 20, ty + 5, { width: 14, lineBreak: false })
    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica")
      .fontSize(10)
      .text(tarea, margin + 38, ty + 3, { width: textW })
    const yFin = ty + h
    doc
      .strokeColor(COLOR_BORDER)
      .lineWidth(0.4)
      .moveTo(margin + 4, yFin)
      .lineTo(margin + usable - 4, yFin)
      .stroke()
    doc.y = yFin + 4
  }

  // ---- Notas ----
  if (data.notas) {
    doc.y += 6
    drawSectionTitle(doc, "Notas")
    doc.font("Helvetica").fontSize(9.5)
    const notasH = doc.heightOfString(data.notas, { width: usable - 16 }) + 14
    ensureSpace(doc, notasH)
    const ny = doc.y
    doc.rect(margin, ny, usable, notasH).fill(COLOR_HEADER_BG)
    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica")
      .fontSize(9.5)
      .text(data.notas, margin + 8, ny + 7, { width: usable - 16 })
    doc.y = ny + notasH + 4
  }

  // ---- Firmas ----
  ensureSpace(doc, 90)
  const fy = doc.y + 46
  const half = usable / 2 - 20
  for (const [i, quien] of ["Supervisor de Flota", "Mecánico / Taller"].entries()) {
    const fx = margin + i * (half + 40)
    doc
      .strokeColor(COLOR_TEXT)
      .lineWidth(0.75)
      .moveTo(fx + 20, fy)
      .lineTo(fx + half - 20, fy)
      .stroke()
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(8.5)
      .text(`Firma y aclaración — ${quien}`, fx, fy + 5, {
        width: half,
        align: "center",
        lineBreak: false,
      })
  }
  doc.y = fy + 24
  doc
    .fillColor(COLOR_PRIMARY)
    .fontSize(7.5)
    .text(
      "Documento generado por dpo-app · Programación de mantenimiento de flota (DPO 2.2 / 2.4)",
      margin,
      doc.y,
      { width: usable, align: "center", lineBreak: false },
    )
}
