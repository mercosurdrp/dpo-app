/**
 * PDF "Plan de Acción — Rechazos" — clonado del patrón visual de
 * `src/app/api/reuniones/rechazos-dia-pdf/route.ts`.
 *
 * GET /api/rechazos/plan-pdf?id={uuid}
 *
 * Consulta directa a `rechazos_planes` + `rechazos_planes_avances` (no usa las
 * server actions de `src/actions/rechazos-planes.ts` porque son "use server").
 */
import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  COLOR_BORDER,
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_TEXT,
  drawFooters,
  drawHeader,
  drawSectionTitle,
  ensureSpace,
  formatFechaCorta,
  formatFechaHora,
  formatTimestamp,
  type Doc,
} from "../_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface PlanRow {
  id: string
  titulo: string
  descripcion: string | null
  foco_motivo_id: number | null
  foco_motivo_ds: string | null
  foco_cliente_id: number | null
  foco_cliente_nombre: string | null
  prioridad: string
  estado: string
  fecha_objetivo: string | null
  created_at: string
  responsable_nombre: string | null
  created_by_nombre: string | null
}

interface AvanceRow {
  id: string
  comentario: string | null
  archivo_nombre: string | null
  estado_resultante: string | null
  created_at: string
  autor_nombre: string | null
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}
const PRIORIDAD_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get("id")
  if (!id || !id.trim()) {
    return NextResponse.json(
      { error: "invalid_params", message: "Parámetro 'id' obligatorio" },
      { status: 400 },
    )
  }

  let plan: PlanRow
  let avances: AvanceRow[]
  try {
    const supa = await createClient()

    const { data: planData, error: planErr } = await supa
      .from("rechazos_planes")
      .select(
        "id, titulo, descripcion, foco_motivo_id, foco_motivo_ds, foco_cliente_id, foco_cliente_nombre, prioridad, estado, fecha_objetivo, created_at, responsable:profiles!rechazos_planes_responsable_id_fkey(nombre), autor:profiles!rechazos_planes_created_by_fkey(nombre)",
      )
      .eq("id", id)
      .maybeSingle()

    if (planErr) {
      return NextResponse.json({ error: "query_error", message: planErr.message }, { status: 500 })
    }
    if (!planData) {
      return NextResponse.json({ error: "not_found", message: "Plan no encontrado" }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = planData as any
    plan = {
      id: p.id,
      titulo: p.titulo,
      descripcion: p.descripcion ?? null,
      foco_motivo_id: p.foco_motivo_id ?? null,
      foco_motivo_ds: p.foco_motivo_ds ?? null,
      foco_cliente_id: p.foco_cliente_id ?? null,
      foco_cliente_nombre: p.foco_cliente_nombre ?? null,
      prioridad: p.prioridad ?? "media",
      estado: p.estado ?? "pendiente",
      fecha_objetivo: p.fecha_objetivo ?? null,
      created_at: p.created_at,
      responsable_nombre: p.responsable?.nombre ?? null,
      created_by_nombre: p.autor?.nombre ?? null,
    }

    const { data: avData, error: avErr } = await supa
      .from("rechazos_planes_avances")
      .select(
        "id, comentario, archivo_nombre, estado_resultante, created_at, autor:profiles!rechazos_planes_avances_autor_id_fkey(nombre)",
      )
      .eq("plan_id", id)
      .order("created_at", { ascending: true })

    if (avErr) {
      return NextResponse.json({ error: "query_error", message: avErr.message }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    avances = ((avData ?? []) as any[]).map((a) => ({
      id: a.id,
      comentario: a.comentario ?? null,
      archivo_nombre: a.archivo_nombre ?? null,
      estado_resultante: a.estado_resultante ?? null,
      created_at: a.created_at,
      autor_nombre: a.autor?.nombre ?? null,
    }))
  } catch (err) {
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "Error generando plan" },
      { status: 500 },
    )
  }

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(plan, avances)
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
      "Content-Disposition": `inline; filename="plan-rechazos-${plan.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

async function renderPDF(plan: PlanRow, avances: AvanceRow[]): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Plan de Acción — Rechazos · ${plan.titulo}`,
        Author: "Mercosur Distribuciones",
        Subject: "Plan de acción de rechazos",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    try {
      buildPDF(doc, plan, avances)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function buildPDF(doc: Doc, plan: PlanRow, avances: AvanceRow[]) {
  drawHeader(
    doc,
    "Plan de Acción — Rechazos",
    "Plan de acción",
    `Generado el ${formatTimestamp(new Date())}`,
  )

  // Título del plan
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2
  doc
    .fillColor(COLOR_TEXT)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(plan.titulo, margin, doc.y, { width: usable })
  doc.y = doc.y + 8
  doc.x = margin

  drawMetadatos(doc, plan)

  if (plan.descripcion) {
    drawSectionTitle(doc, "Descripción")
    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica")
      .fontSize(9.5)
      .text(plan.descripcion, margin, doc.y, { width: usable, align: "left" })
    doc.y = doc.y + 10
    doc.x = margin
  }

  drawSectionTitle(doc, `Seguimiento / Avances (${avances.length})`)
  if (avances.length === 0) {
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text("Aún no se registraron avances para este plan.", margin, doc.y, {
        width: usable,
        lineBreak: false,
      })
    doc.y = doc.y + 16
    doc.x = margin
    return
  }

  for (let i = 0; i < avances.length; i++) {
    drawAvance(doc, avances[i], i + 1)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Bloque de metadatos (key/value en dos columnas)
// ─────────────────────────────────────────────────────────────────────────
function drawMetadatos(doc: Doc, plan: PlanRow) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  const focoParts: string[] = []
  if (plan.foco_motivo_ds) focoParts.push(`Motivo: ${plan.foco_motivo_ds}`)
  if (plan.foco_cliente_nombre) focoParts.push(`Cliente: ${plan.foco_cliente_nombre}`)
  const foco = focoParts.length ? focoParts.join(" · ") : "General (sin foco específico)"

  const items: Array<[string, string]> = [
    ["Estado", ESTADO_LABEL[plan.estado] ?? plan.estado],
    ["Prioridad", PRIORIDAD_LABEL[plan.prioridad] ?? plan.prioridad],
    ["Foco", foco],
    ["Responsable", plan.responsable_nombre ?? "(sin asignar)"],
    ["Fecha objetivo", formatFechaCorta(plan.fecha_objetivo)],
    ["Creado por", plan.created_by_nombre ?? "—"],
    ["Fecha de creación", formatFechaHora(plan.created_at)],
  ]

  const colGap = 16
  const colW = (usable - colGap) / 2
  const lineH = 26
  // Layout en 2 columnas, llenando por filas
  const rows = Math.ceil(items.length / 2)
  ensureSpace(doc, rows * lineH + 8)
  const y0 = doc.y

  for (let i = 0; i < items.length; i++) {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = margin + col * (colW + colGap)
    const y = y0 + row * lineH
    const [label, value] = items[i]

    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(label.toUpperCase(), x, y, { width: colW, lineBreak: false })
    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica")
      .fontSize(10)
      .text(value, x, y + 9, { width: colW, lineBreak: false, ellipsis: true })
  }

  doc.y = y0 + rows * lineH + 6
  doc.x = margin

  // Separador
  doc.save()
  doc
    .strokeColor(COLOR_BORDER)
    .lineWidth(0.5)
    .moveTo(margin, doc.y)
    .lineTo(margin + usable, doc.y)
    .stroke()
  doc.restore()
  doc.y = doc.y + 6
}

// ─────────────────────────────────────────────────────────────────────────
// Bloque de un avance
// ─────────────────────────────────────────────────────────────────────────
function drawAvance(doc: Doc, av: AvanceRow, n: number) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  ensureSpace(doc, 40)
  const y0 = doc.y

  // Barra de color a la izquierda del bloque
  doc.save()
  doc.rect(margin, y0 + 1, 3, 11).fill(COLOR_PRIMARY)
  doc.restore()

  // Encabezado del avance: fecha + autor
  const autor = av.autor_nombre ?? "(autor desconocido)"
  doc
    .fillColor(COLOR_TEXT)
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(`#${n} · ${formatFechaHora(av.created_at)} · ${autor}`, margin + 10, y0, {
      width: usable - 10,
      lineBreak: false,
    })
  doc.y = y0 + 14
  doc.x = margin

  // Cambio de estado
  if (av.estado_resultante) {
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .text(
        `Cambió el estado a: ${ESTADO_LABEL[av.estado_resultante] ?? av.estado_resultante}`,
        margin + 10,
        doc.y,
        { width: usable - 10, lineBreak: false },
      )
    doc.y = doc.y + 12
    doc.x = margin
  }

  // Comentario
  if (av.comentario) {
    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica")
      .fontSize(9)
      .text(av.comentario, margin + 10, doc.y, { width: usable - 10, align: "left" })
    doc.y = doc.y + 4
    doc.x = margin
  }

  // Evidencia adjunta
  if (av.archivo_nombre) {
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(`Evidencia adjunta: ${av.archivo_nombre}`, margin + 10, doc.y, {
        width: usable - 10,
        lineBreak: false,
        ellipsis: true,
      })
    doc.y = doc.y + 12
    doc.x = margin
  }

  // Separador entre avances
  doc.y = doc.y + 4
  doc.save()
  doc
    .strokeColor("#e5e7eb")
    .lineWidth(0.3)
    .moveTo(margin, doc.y)
    .lineTo(margin + usable, doc.y)
    .stroke()
  doc.restore()
  doc.y = doc.y + 8
  doc.x = margin
}
