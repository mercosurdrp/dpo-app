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
import { fetchLecturas, kmActualPorDominio } from "@/lib/vehiculos/lecturas"
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
  /** N° de la orden de trabajo, cuando ya está creada. */
  numero_ot: string | null
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
    .select("dominio, fecha_programada, tareas, taller, notas, estado, created_by, realizado_id")
    .eq("id", id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!ot) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 })

  // El N° de OT es como se habla de la orden en el taller: va en el PDF.
  const numeroOt = ot.realizado_id
    ? (
        await supabase
          .from("mantenimiento_realizados")
          .select("numero_ot")
          .eq("id", ot.realizado_id)
          .maybeSingle()
      ).data?.numero_ot ?? null
    : null

  const [fichaRes, perfilRes, lecturas] = await Promise.all([
    supabase
      .from("vehiculos_ficha")
      .select("marca, modelo, anio")
      .eq("dominio", ot.dominio)
      .maybeSingle(),
    ot.created_by
      ? supabase.from("profiles").select("nombre").eq("id", ot.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    // 🚨 El odómetro del PDF sale de las lecturas REALES (checklist, registros,
    // combustible, OT cerradas), no de `vehiculos_ficha.cf_odometro`: esa columna
    // es una foto de Cloudfleet que sólo se refresca sincronizando la ficha a
    // mano, y quedó congelada en mayo. El 24/08/2026 el PDF imprimía 52.000 km
    // del AF664NY (real 58.853) y 127.179 del AE908DH (real 143.098): el taller
    // planificaba el trabajo con quince mil kilómetros de menos.
    fetchLecturas({ dominio: ot.dominio }, supabase),
  ])

  const ultimaLectura = kmActualPorDominio(lecturas).get(ot.dominio) ?? null

  const data: OtPdfData = {
    dominio: ot.dominio,
    numero_ot: numeroOt,
    fecha_programada: ot.fecha_programada,
    tareas: Array.isArray(ot.tareas) ? (ot.tareas as string[]) : [],
    taller: ot.taller ?? "",
    notas: ot.notas ?? "",
    estado: ot.estado,
    creado_por: perfilRes.data?.nombre ?? null,
    marca: fichaRes.data?.marca ?? null,
    modelo: fichaRes.data?.modelo ?? null,
    anio: fichaRes.data?.anio ?? null,
    odometro: ultimaLectura?.odometro ?? null,
    odometro_fecha: ultimaLectura?.fecha ?? null,
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

/**
 * Achica el cuerpo hasta que el texto entre en el ancho de su columna, y si ni
 * en el tamaño más chico entra, lo corta con "…".
 *
 * 🚨 `lineBreak: false` NO recorta: pdfkit dibuja la línea completa y el texto
 * se sale del recuadro y pisa la columna de al lado. Un taller como "GOMERIA
 * POZZI ARNALDO JOSE" se comía el campo siguiente.
 */
function textoQueEntra(
  doc: Doc,
  valor: string,
  w: number,
  fuente: string,
  max: number,
  min: number,
): { texto: string; size: number } {
  for (let size = max; size >= min; size -= 0.5) {
    doc.font(fuente).fontSize(size)
    if (doc.widthOfString(valor) <= w) return { texto: valor, size }
  }
  doc.font(fuente).fontSize(min)
  let texto = valor
  while (texto.length > 1 && doc.widthOfString(`${texto}…`) > w) {
    texto = texto.slice(0, -1)
  }
  return { texto: `${texto.trimEnd()}…`, size: min }
}

function campo(doc: Doc, x: number, y: number, w: number, label: string, valor: string) {
  const lab = textoQueEntra(doc, label.toUpperCase(), w, "Helvetica", 7.5, 5.5)
  doc
    .font("Helvetica")
    .fontSize(lab.size)
    .fillColor(COLOR_MUTED)
    .text(lab.texto, x, y, { width: w, lineBreak: false })
  const val = textoQueEntra(doc, valor || "—", w, "Helvetica-Bold", 11, 6.5)
  doc
    .font("Helvetica-Bold")
    .fontSize(val.size)
    .fillColor(COLOR_TEXT)
    .text(val.texto, x, y + 10, { width: w, lineBreak: false })
}

function buildPDF(doc: Doc, data: OtPdfData) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  drawHeader(
    doc,
    data.numero_ot ? `Orden de Trabajo N° ${data.numero_ot}` : "Orden de Trabajo Programada",
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
    // La fecha va al lado del número: una lectura de hace una semana no es lo
    // mismo que la de ayer, y el mecánico tiene que poder ver cuál está mirando.
    "Odómetro",
    data.odometro != null
      ? `${new Intl.NumberFormat("es-AR").format(data.odometro)} km${
          data.odometro_fecha ? ` (${data.odometro_fecha.slice(8, 10)}/${data.odometro_fecha.slice(5, 7)})` : ""
        }`
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
