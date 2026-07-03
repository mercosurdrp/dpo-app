/**
 * PDF de UNA orden de trabajo (botón dentro del detalle de la OT).
 * Reusa los helpers de `src/app/api/rechazos/_pdf-helpers`.
 *
 * GET /api/vehiculos/ordenes/[id]/pdf
 */
import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { requireAuth } from "@/lib/session"
import { MANTENIMIENTO_ESTADO_LABELS } from "@/types/database"
import {
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_TEXT,
  drawFooters,
  drawHeader,
  drawKPIs,
  drawSectionTitle,
  drawTable,
  ensureSpace,
  formatMoneyFull,
  type Doc,
  type KPICard,
} from "../../../../rechazos/_pdf-helpers"
import type { OrdenExport } from "../_shared"
import { descTarea, fetchOrdenExport, nombreArchivoOt, subtotalRepuestos, TIPO_OT_LABELS } from "../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const fmtFecha = (f: string | null) => (f ? f.slice(0, 10).split("-").reverse().join("/") : "—")
const fmtFechaHora = (f: string | null) =>
  f
    ? new Date(f).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await ctx.params
  let res: OrdenExport | null
  try {
    res = await fetchOrdenExport(id)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }
  if (!res) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 })

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(res)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }

  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombreArchivoOt(res.orden, "pdf")}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

async function renderPDF(res: OrdenExport): Promise<Buffer> {
  const m = res.orden
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Orden de trabajo${m.numero_ot ? ` N° ${m.numero_ot}` : ""} · ${m.dominio}`,
        Author: "Mercosur · dpo-app",
        Subject: "Orden de trabajo de mantenimiento de flota",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      buildPDF(doc, res)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function buildPDF(doc: Doc, { orden: m, nombresTareas }: OrdenExport) {
  drawHeader(
    doc,
    `Orden de trabajo${m.numero_ot ? ` N° ${m.numero_ot}` : ""}`,
    m.dominio,
    fmtFecha(m.fecha)
  )

  const tareas = m.tareas ?? []
  const repuestos = m.repuestos ?? []
  const subRep = subtotalRepuestos(m)

  const cards: KPICard[] = [
    {
      label: "Costo total",
      value: m.costo != null ? formatMoneyFull(Number(m.costo)) : "—",
      sub: TIPO_OT_LABELS[m.tipo] ?? m.tipo,
      color: COLOR_PRIMARY,
    },
    {
      label: "Mano de obra",
      value: m.costo_mano_obra != null ? formatMoneyFull(Number(m.costo_mano_obra)) : "—",
      sub: m.horas_mano_obra != null ? `${Number(m.horas_mano_obra)} hs` : "",
    },
    {
      label: "Repuestos",
      value: subRep > 0 ? formatMoneyFull(subRep) : "—",
      sub: `${repuestos.length} ítem${repuestos.length === 1 ? "" : "s"}`,
    },
    {
      label: "Estado",
      value: MANTENIMIENTO_ESTADO_LABELS[m.estado] ?? m.estado,
      sub: m.es_service_general ? "Service general" : "",
    },
  ]
  drawKPIs(doc, cards)

  drawSectionTitle(doc, "Datos de la orden")
  const datos: Array<{ k: string; v: string }> = [
    { k: "Unidad", v: m.dominio },
    { k: "Fecha", v: fmtFecha(m.fecha) },
    {
      k: m.odometro != null || m.horometro == null ? "Odómetro" : "Horómetro",
      v:
        m.odometro != null
          ? `${new Intl.NumberFormat("es-AR").format(m.odometro)} km`
          : m.horometro != null
            ? `${new Intl.NumberFormat("es-AR").format(Number(m.horometro))} hs`
            : "—",
    },
    { k: "Taller / proveedor", v: m.taller || "—" },
    { k: "N° de factura", v: m.numero_factura || "—" },
    { k: "Entrada al taller", v: fmtFechaHora(m.entrada_taller) },
    { k: "Salida del taller", v: m.entrada_taller ? fmtFechaHora(m.salida_taller) : "—" },
    {
      k: "Origen",
      v: m.origen === "cloudfleet" ? `Cloudfleet #${m.cloudfleet_number ?? ""}` : "Carga manual",
    },
  ]
  drawTable(
    doc,
    datos,
    [
      { header: "Campo", width: 150, get: (d) => d.k },
      { header: "Valor", width: 280, get: (d) => d.v },
    ],
    "—"
  )

  drawSectionTitle(doc, "Trabajo realizado / mano de obra")
  type Linea = { desc: string; costo: string }
  const lineas: Linea[] = tareas.map((t) => ({
    desc: descTarea(t, nombresTareas),
    costo: t.costo != null ? formatMoneyFull(Number(t.costo)) : "—",
  }))
  if (m.horas_mano_obra != null || m.costo_mano_obra != null) {
    lineas.push({
      desc: `Mano de obra${m.horas_mano_obra != null ? ` (${Number(m.horas_mano_obra)} hs)` : ""}`,
      costo: m.costo_mano_obra != null ? formatMoneyFull(Number(m.costo_mano_obra)) : "—",
    })
  }
  drawTable(
    doc,
    lineas,
    [
      { header: "Descripción", width: 360, get: (l) => l.desc },
      { header: "Costo", width: 70, align: "right", get: (l) => l.costo },
    ],
    "Sin detalle del trabajo cargado."
  )

  drawSectionTitle(doc, "Repuestos")
  drawTable(
    doc,
    repuestos,
    [
      { header: "Descripción", width: 250, get: (r) => r.descripcion },
      { header: "Cant.", width: 40, align: "right", get: (r) => String(Number(r.cantidad)) },
      {
        header: "Costo unit.",
        width: 70,
        align: "right",
        get: (r) => (r.costo_unitario != null ? formatMoneyFull(Number(r.costo_unitario)) : "—"),
      },
      {
        header: "Subtotal",
        width: 70,
        align: "right",
        get: (r) =>
          r.costo_unitario != null
            ? formatMoneyFull(Number(r.cantidad) * Number(r.costo_unitario))
            : "—",
      },
    ],
    "Sin repuestos cargados."
  )

  if (m.observaciones) {
    drawSectionTitle(doc, "Observaciones")
    ensureSpace(doc, 40)
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLOR_TEXT)
      .text(m.observaciones, doc.page.margins.left, doc.y, {
        width: doc.page.width - doc.page.margins.left * 2,
      })
    doc.moveDown(0.5)
  }

  const adjuntos = m.evidencia_urls ?? []
  if (adjuntos.length > 0) {
    drawSectionTitle(doc, "Facturas / adjuntos")
    for (const url of adjuntos) {
      ensureSpace(doc, 14)
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLOR_MUTED)
        .text(url, doc.page.margins.left, doc.y, {
          width: doc.page.width - doc.page.margins.left * 2,
          link: url,
          underline: false,
        })
      doc.moveDown(0.2)
    }
  }
}
