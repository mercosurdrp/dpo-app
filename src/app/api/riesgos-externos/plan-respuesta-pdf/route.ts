/**
 * PDF del Plan de Respuesta a Riesgos Externos (DPO Planeamiento 2.2, R2.2.2):
 * una ficha por riesgo con la matriz de escalamiento, los tres temas que exige
 * el requisito (nivel de servicio, mano de obra, ajuste de pronóstico) y los
 * teléfonos a los que se llama. Pensado para el pizarrón del CD y para
 * adjuntar como evidencia del punto.
 *
 * GET /api/riesgos-externos/plan-respuesta-pdf
 */
import { NextResponse } from "next/server"
import PDFDocument from "pdfkit"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import {
  CRITICIDAD_RIESGO_EXTERNO_LABELS,
  TIPO_RIESGO_EXTERNO_LABELS,
  formatMinutosDisparo,
  type RiesgoExternoConfig,
  type RiesgoExternoContacto,
  type RiesgoExternoEscalamiento,
  type TipoRiesgoExterno,
} from "@/types/database"
import {
  COLOR_ACCENT,
  COLOR_BORDER,
  COLOR_HEADER_BG,
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_TEXT,
  drawFooters,
  drawHeader,
  ensureSpace,
  formatTimestamp,
  type Doc,
} from "../../rechazos/_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const supabase = await createClient()
  const [{ data: escData, error }, { data: confData }, { data: contData }] =
    await Promise.all([
      supabase
        .from("riesgos_externos_escalamiento")
        .select("*")
        .eq("activo", true)
        .order("tipo_riesgo")
        .order("nivel"),
      supabase.from("riesgos_externos_config").select("*"),
      supabase
        .from("riesgos_externos_contactos")
        .select("*")
        .eq("activo", true)
        .order("orden"),
    ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(
      (escData ?? []) as RiesgoExternoEscalamiento[],
      (confData ?? []) as RiesgoExternoConfig[],
      (contData ?? []) as RiesgoExternoContacto[],
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando PDF" },
      { status: 500 },
    )
  }

  return new NextResponse(new Uint8Array(pdfBuf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'inline; filename="Riesgos-Externos-Plan-de-Respuesta.pdf"',
    },
  })
}

async function renderPDF(
  escalamiento: RiesgoExternoEscalamiento[],
  config: RiesgoExternoConfig[],
  contactos: RiesgoExternoContacto[],
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: "Riesgos Externos — Plan de Respuesta",
        Author: "Mercosur · dpo-app",
        Subject:
          "Matriz de escalamiento, nivel de servicio, mano de obra y ajuste de pronóstico (DPO Planeamiento 2.2, R2.2.2)",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      buildPDF(doc, escalamiento, config, contactos)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/** Bloque "Nivel de servicio / Mano de obra / Ajuste de pronóstico". */
function drawBloque(
  doc: Doc,
  margin: number,
  usable: number,
  titulo: string,
  texto: string | null,
) {
  const contenido = texto ?? "SIN DEFINIR"
  const alto =
    doc.font("Helvetica").fontSize(8.5).heightOfString(contenido, {
      width: usable - 100,
    }) + 4

  ensureSpace(doc, alto + 4)
  const y = doc.y

  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(titulo.toUpperCase(), margin + 8, y + 1, {
      width: 92,
      lineBreak: false,
    })

  doc
    .fillColor(texto ? COLOR_TEXT : COLOR_ACCENT)
    .font(texto ? "Helvetica" : "Helvetica-Bold")
    .fontSize(8.5)
    .text(contenido, margin + 100, y, { width: usable - 108 })

  doc.y = Math.max(doc.y, y + alto)
}

function buildPDF(
  doc: Doc,
  escalamiento: RiesgoExternoEscalamiento[],
  config: RiesgoExternoConfig[],
  contactos: RiesgoExternoContacto[],
) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  drawHeader(
    doc,
    "Plan de Respuesta",
    "Riesgos Externos",
    `Actualizado al ${formatTimestamp(new Date())}`,
  )
  doc.y = 74

  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "DPO Planeamiento 2.2 · R2.2.2 — Matriz de escalamiento con contactos responsables, nivel de servicio, mano de obra y ajuste de pronóstico. Colgar en el pizarrón del CD junto a la matriz de riesgos.",
      margin,
      doc.y,
      { width: usable },
    )
  doc.y += 10

  const confPorTipo = new Map(config.map((c) => [c.tipo_riesgo, c]))
  const prioritarios = new Set(
    config.filter((c) => c.prioritario).map((c) => c.tipo_riesgo),
  )

  const tipos = (Object.keys(TIPO_RIESGO_EXTERNO_LABELS) as TipoRiesgoExterno[])
    .filter(
      (t) =>
        escalamiento.some((e) => e.tipo_riesgo === t) || confPorTipo.has(t),
    )
    .sort((a, b) => Number(prioritarios.has(b)) - Number(prioritarios.has(a)))

  for (const tipo of tipos) {
    const niveles = escalamiento.filter((e) => e.tipo_riesgo === tipo)
    const conf = confPorTipo.get(tipo)
    const esPrioritario = prioritarios.has(tipo)

    ensureSpace(doc, 90)

    // Título del riesgo
    const yTitle = doc.y
    doc.save()
    doc
      .rect(margin, yTitle, usable, 18)
      .fill(esPrioritario ? "#fee2e2" : COLOR_HEADER_BG)
    doc.restore()

    const titulo = esPrioritario
      ? `★ ${TIPO_RIESGO_EXTERNO_LABELS[tipo].toUpperCase()}  ·  RIESGO PRIORITARIO`
      : TIPO_RIESGO_EXTERNO_LABELS[tipo].toUpperCase()
    doc
      .fillColor(esPrioritario ? COLOR_ACCENT : COLOR_PRIMARY)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(titulo, margin + 6, yTitle + 5, {
        width: usable - 90,
        lineBreak: false,
      })

    if (conf?.criticidad) {
      doc
        .fillColor(COLOR_MUTED)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(
          CRITICIDAD_RIESGO_EXTERNO_LABELS[conf.criticidad].toUpperCase(),
          margin + usable - 86,
          yTitle + 6,
          { width: 80, align: "right", lineBreak: false },
        )
    }
    doc.y = yTitle + 18 + 4

    // Escalamiento
    if (niveles.length === 0) {
      doc
        .fillColor(COLOR_ACCENT)
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text("SIN ESCALAMIENTO DEFINIDO", margin + 8, doc.y, {
          width: usable - 16,
        })
      doc.y += 4
    }

    for (const n of niveles) {
      const encabezado = `N${n.nivel} · ${n.rol}`
      const cuerpo = [n.disparador, n.acciones].filter(Boolean).join(" — ")
      const altoCuerpo = doc
        .font("Helvetica")
        .fontSize(8.5)
        .heightOfString(cuerpo, { width: usable - 130 })

      ensureSpace(doc, altoCuerpo + 16)
      const y = doc.y

      doc
        .fillColor(COLOR_TEXT)
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text(encabezado, margin + 8, y, { width: 118 })

      if (n.suplente) {
        doc
          .fillColor(COLOR_MUTED)
          .font("Helvetica")
          .fontSize(7.5)
          .text(`supl. ${n.suplente}`, margin + 8, doc.y, { width: 118 })
      }

      doc
        .fillColor(COLOR_TEXT)
        .font("Helvetica")
        .fontSize(8.5)
        .text(cuerpo, margin + 130, y, { width: usable - 200 })

      doc
        .fillColor(esPrioritario ? COLOR_ACCENT : COLOR_PRIMARY)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(formatMinutosDisparo(n.minutos_disparo), margin + usable - 68, y, {
          width: 60,
          align: "right",
          lineBreak: false,
        })

      const yFin = Math.max(doc.y, y + altoCuerpo) + 3
      doc.save()
      doc
        .strokeColor(COLOR_BORDER)
        .lineWidth(0.3)
        .moveTo(margin + 8, yFin)
        .lineTo(margin + usable - 8, yFin)
        .stroke()
      doc.restore()
      doc.y = yFin + 3
    }

    doc.y += 2
    drawBloque(doc, margin, usable, "Nivel de servicio", conf?.plan_nivel_servicio ?? null)
    drawBloque(doc, margin, usable, "Mano de obra", conf?.plan_mano_obra ?? null)
    drawBloque(
      doc,
      margin,
      usable,
      "Ajuste de pronóstico",
      conf?.plan_ajuste_pronostico ?? null,
    )

    // Teléfonos del riesgo
    const tels = contactos.filter((c) => c.tipo_riesgo === tipo && c.telefono)
    if (tels.length > 0) {
      const linea = tels.map((c) => `${c.nombre} ${c.telefono}`).join("   ·   ")
      const alto = doc
        .font("Helvetica")
        .fontSize(8)
        .heightOfString(linea, { width: usable - 108 })
      ensureSpace(doc, alto + 6)
      const y = doc.y
      doc
        .fillColor(COLOR_MUTED)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("A QUIÉN LLAMAR", margin + 8, y + 1, {
          width: 92,
          lineBreak: false,
        })
      doc
        .fillColor(COLOR_TEXT)
        .font("Helvetica")
        .fontSize(8)
        .text(linea, margin + 100, y, { width: usable - 108 })
      doc.y = Math.max(doc.y, y + alto)
    }

    doc.y += 10
  }
}
