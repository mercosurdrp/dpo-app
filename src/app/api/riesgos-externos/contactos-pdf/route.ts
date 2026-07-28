/**
 * PDF del directorio "A quién llamar" de riesgos externos: hoja imprimible
 * para colgar en depósito y para adjuntar como evidencia del punto DPO
 * Planeamiento 2.2 (R2.2.3 / R2.2.4).
 *
 * GET /api/riesgos-externos/contactos-pdf
 */
import { NextResponse } from "next/server"
import PDFDocument from "pdfkit"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import {
  CATEGORIA_CONTACTO_RIESGO_LABELS,
  TIPO_RIESGO_EXTERNO_LABELS,
  type CategoriaContactoRiesgo,
  type RiesgoExternoConfig,
  type RiesgoExternoContacto,
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
  const [{ data, error }, { data: confData }] = await Promise.all([
    supabase
      .from("riesgos_externos_contactos")
      .select("*")
      .eq("activo", true)
      .order("tipo_riesgo")
      .order("orden")
      .order("nombre"),
    supabase.from("riesgos_externos_config").select("*"),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const contactos = (data ?? []) as RiesgoExternoContacto[]
  const config = (confData ?? []) as RiesgoExternoConfig[]

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(contactos, config)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando PDF" },
      { status: 500 },
    )
  }

  return new NextResponse(new Uint8Array(pdfBuf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Riesgos-Externos-A-quien-llamar.pdf"',
    },
  })
}

async function renderPDF(
  contactos: RiesgoExternoContacto[],
  config: RiesgoExternoConfig[],
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: "Riesgos Externos — A quién llamar",
        Author: "Mercosur · dpo-app",
        Subject: "Directorio de contactos por riesgo externo (DPO Planeamiento 2.2)",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      buildPDF(doc, contactos, config)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function buildPDF(
  doc: Doc,
  contactos: RiesgoExternoContacto[],
  config: RiesgoExternoConfig[],
) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2

  drawHeader(
    doc,
    "A quién llamar",
    "Riesgos Externos",
    `Actualizado al ${formatTimestamp(new Date())}`,
  )
  doc.y = 74

  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "Directorio de contactos por riesgo — DPO Planeamiento 2.2. Colgar en depósito y en la oficina de operaciones.",
      margin,
      doc.y,
      { width: usable },
    )
  doc.y += 8

  const prioritarios = new Set(
    config.filter((c) => c.prioritario).map((c) => c.tipo_riesgo),
  )
  const criticidadPorTipo = new Map(
    config.map((c) => [c.tipo_riesgo, c.criticidad]),
  )

  // Los riesgos prioritarios del CD van primero en la hoja.
  const tipos = (
    Object.keys(TIPO_RIESGO_EXTERNO_LABELS) as TipoRiesgoExterno[]
  ).sort(
    (a, b) => Number(prioritarios.has(b)) - Number(prioritarios.has(a)),
  )

  for (const tipo of tipos) {
    const items = contactos.filter((c) => c.tipo_riesgo === tipo)
    if (items.length === 0) continue
    const esPrioritario = prioritarios.has(tipo)
    const criticidad = criticidadPorTipo.get(tipo)

    // Bloque del riesgo: título + una línea por contacto.
    ensureSpace(doc, 22 + items.length * 14 + 8)

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

    if (criticidad) {
      doc
        .fillColor(COLOR_MUTED)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(criticidad.toUpperCase(), margin + usable - 86, yTitle + 6, {
          width: 80,
          align: "right",
          lineBreak: false,
        })
    }
    doc.y = yTitle + 18 + 3

    for (const c of items) {
      ensureSpace(doc, 14)
      const y = doc.y

      const quien = [c.nombre, c.empresa && c.empresa !== c.nombre ? `(${c.empresa})` : null]
        .filter(Boolean)
        .join(" ")
      const cat = CATEGORIA_CONTACTO_RIESGO_LABELS[
        c.categoria as CategoriaContactoRiesgo
      ]

      doc
        .fillColor(COLOR_TEXT)
        .font("Helvetica")
        .fontSize(9)
        .text(quien, margin + 8, y + 2, { width: usable * 0.42, lineBreak: false, ellipsis: true })

      doc
        .fillColor(COLOR_MUTED)
        .font("Helvetica")
        .fontSize(8)
        .text(cat, margin + 8 + usable * 0.42, y + 2.5, {
          width: usable * 0.2,
          lineBreak: false,
        })

      if (c.telefono) {
        doc
          .fillColor(COLOR_TEXT)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(
            c.telefono + (c.telefono_alt ? ` / ${c.telefono_alt}` : ""),
            margin + 8 + usable * 0.62,
            y + 1,
            { width: usable * 0.36, align: "right", lineBreak: false },
          )
      } else {
        doc
          .fillColor(COLOR_ACCENT)
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("FALTA EL TELÉFONO", margin + 8 + usable * 0.62, y + 2, {
            width: usable * 0.36,
            align: "right",
            lineBreak: false,
          })
      }

      doc.save()
      doc
        .strokeColor(COLOR_BORDER)
        .lineWidth(0.3)
        .moveTo(margin + 8, y + 14)
        .lineTo(margin + usable - 8, y + 14)
        .stroke()
      doc.restore()

      doc.y = y + 14
    }

    doc.y += 6
  }
}
