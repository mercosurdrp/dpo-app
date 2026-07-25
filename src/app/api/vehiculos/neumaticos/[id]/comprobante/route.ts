/**
 * Comprobante en PDF de un movimiento de cubierta (montaje / desmontaje / baja).
 *
 * GET /api/vehiculos/neumaticos/[id]/comprobante           → último movimiento de esa cubierta
 * GET /api/vehiculos/neumaticos/[id]/comprobante?mov=<uuid> → ese movimiento puntual
 *
 * Si la cubierta no tiene movimientos registrados (montada antes de que se
 * registraran), el comprobante se arma con los datos actuales de la cubierta.
 */
import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_TEXT,
  drawFooters,
  drawHeader,
  drawSectionTitle,
  type Doc,
} from "../../../../rechazos/_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TIPO_LABEL: Record<string, string> = {
  montaje: "Montaje de cubierta",
  desmontaje: "Desmontaje de cubierta",
  baja: "Baja de cubierta",
}

const fmtFecha = (f: string | null) => (f ? f.slice(0, 10).split("-").reverse().join("/") : "—")
const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR").format(Number(n))

interface Movimiento {
  id: string
  tipo: string
  dominio: string | null
  posicion: string | null
  eje: string | null
  fecha: string
  km: number | null
  medida: string | null
  numero: string | null
  factura_urls: string[] | null
  observaciones: string | null
  created_at: string
}

interface Cubierta {
  id: string
  numero: string | null
  marca: string | null
  medida: string | null
  tipo: string
  estado: string
  dominio: string | null
  posicion: string | null
  fecha_instalacion: string | null
  km_instalacion: number | null
  profundidad_inicial_mm: number | null
  profundidad_actual_mm: number | null
  vida_util_km: number | null
  factura_urls: string[] | null
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await ctx.params
  const movId = req.nextUrl.searchParams.get("mov")

  const supabase = await createClient()
  const { data: cubierta, error } = await supabase
    .from("mantenimiento_neumaticos")
    .select(
      "id, numero, marca, medida, tipo, estado, dominio, posicion, fecha_instalacion, km_instalacion, profundidad_inicial_mm, profundidad_actual_mm, vida_util_km, factura_urls"
    )
    .eq("id", id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!cubierta) return NextResponse.json({ error: "Cubierta no encontrada" }, { status: 404 })

  // Tipo de la unidad: define si la lectura es odómetro (km) u horómetro (hs).
  const dominioUnidad = cubierta.dominio ?? null
  let tipoUnidad: string | null = null
  if (dominioUnidad) {
    const { data: veh } = await supabase
      .from("catalogo_vehiculos")
      .select("tipo")
      .eq("dominio", dominioUnidad)
      .maybeSingle()
    tipoUnidad = veh?.tipo ?? null
  }

  // El movimiento pedido, o el último registrado. Query tolerante: si falla, el
  // comprobante sale con los datos de la cubierta.
  let mov: Movimiento | null = null
  try {
    const q = supabase
      .from("mantenimiento_neumatico_movimientos")
      .select("*")
      .eq("neumatico_id", id)
    const { data } = movId
      ? await q.eq("id", movId).maybeSingle()
      : await q.order("fecha", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
    mov = (data as Movimiento) ?? null
  } catch {
    mov = null
  }

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(cubierta as Cubierta, mov, tipoUnidad)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }

  const nombre = `comprobante-${(mov?.tipo ?? "cubierta")}-${
    cubierta.numero || cubierta.id.slice(0, 8)
  }.pdf`
  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

async function renderPDF(
  c: Cubierta,
  mov: Movimiento | null,
  tipoUnidad: string | null
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `${TIPO_LABEL[mov?.tipo ?? ""] ?? "Comprobante de cubierta"} · ${
          mov?.dominio ?? c.dominio ?? ""
        }`,
        Author: "Mercosur · dpo-app",
        Subject: "Comprobante de movimiento de neumático",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (ch: Buffer) => chunks.push(ch))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      buildPDF(doc, c, mov, tipoUnidad)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function buildPDF(
  doc: Doc,
  c: Cubierta,
  mov: Movimiento | null,
  tipoUnidad: string | null
) {
  const dominio = mov?.dominio ?? c.dominio ?? "—"
  const fecha = mov?.fecha ?? c.fecha_instalacion
  drawHeader(
    doc,
    TIPO_LABEL[mov?.tipo ?? ""] ?? "Comprobante de cubierta",
    dominio,
    fmtFecha(fecha ?? null)
  )

  const esHoras = tipoUnidad === "autoelevador"

  drawSectionTitle(doc, "Datos de la operación")
  filas(doc, [
    ["Unidad", dominio],
    ["Posición", mov?.posicion ?? c.posicion ?? "—"],
    ["Eje", mov?.eje ?? "—"],
    ["Fecha", fmtFecha(fecha ?? null)],
    [
      esHoras ? "Horómetro (hs)" : "Odómetro (km)",
      mov?.km != null
        ? fmtNum(mov.km)
        : c.km_instalacion != null
          ? fmtNum(c.km_instalacion)
          : "—",
    ],
  ])

  drawSectionTitle(doc, "Cubierta")
  filas(doc, [
    ["Código / N°", mov?.numero ?? c.numero ?? "—"],
    ["Medida", mov?.medida ?? c.medida ?? "—"],
    ["Marca", c.marca ?? "—"],
    ["Estado", c.tipo === "recapado" ? "Recapado" : "Nuevo"],
    [
      "Profundidad",
      c.profundidad_actual_mm != null
        ? `${c.profundidad_actual_mm} mm${
            c.profundidad_inicial_mm != null ? ` (inicial ${c.profundidad_inicial_mm} mm)` : ""
          }`
        : "—",
    ],
    ["Vida útil objetivo", c.vida_util_km != null ? `${fmtNum(c.vida_util_km)} km` : "—"],
  ])

  if (mov?.observaciones) {
    drawSectionTitle(doc, "Observaciones")
    doc.font("Helvetica").fontSize(9).fillColor(COLOR_TEXT)
    doc.text(mov.observaciones, { width: doc.page.width - 72 })
    doc.moveDown(0.5)
  }

  const facturas = mov?.factura_urls ?? c.factura_urls ?? []
  if (facturas.length > 0) {
    drawSectionTitle(doc, "Factura de compra")
    doc.font("Helvetica").fontSize(8).fillColor(COLOR_PRIMARY)
    for (const url of facturas) {
      doc.text(url, { width: doc.page.width - 72, link: url, underline: true })
    }
    doc.moveDown(0.5)
  }

  if (!mov) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(COLOR_MUTED)
    doc.text(
      "Este comprobante se armó con los datos actuales de la cubierta: el movimiento es anterior al registro de movimientos.",
      { width: doc.page.width - 72 }
    )
  }
}

// Dos columnas clave/valor, alineadas y con separador tenue.
function filas(doc: Doc, items: Array<[string, string]>) {
  const x = doc.page.margins.left
  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right
  for (const [label, valor] of items) {
    const y = doc.y
    doc.font("Helvetica").fontSize(9).fillColor(COLOR_MUTED)
    doc.text(label, x, y, { width: ancho * 0.35 })
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_TEXT)
    doc.text(valor, x + ancho * 0.35, y, { width: ancho * 0.65 })
    doc.moveDown(0.35)
  }
  doc.moveDown(0.5)
}
