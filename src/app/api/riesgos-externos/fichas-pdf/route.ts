/**
 * Fichas de riesgo externo para el pizarrón del CD: UNA HOJA POR RIESGO, con
 * teléfonos, escalamiento con plazos, los tres temas de R2.2.2 y un QR que abre
 * esa misma ficha en la app (así el papel no se desactualiza).
 *
 * La primera hoja es el índice, con un QR grande al listado completo.
 *
 * GET /api/riesgos-externos/fichas-pdf            → las 18 fichas
 * GET /api/riesgos-externos/fichas-pdf?riesgo=X   → sólo esa ficha
 */
import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import {
  TIPO_RIESGO_EXTERNO_LABELS,
  type RiesgoExternoConfig,
  type RiesgoExternoContacto,
  type RiesgoExternoEscalamiento,
  type TipoRiesgoExterno,
} from "@/types/database"
import { renderPDF } from "../_fichas-pdf-render"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const soloRiesgo = request.nextUrl.searchParams.get("riesgo")
  const origin = request.nextUrl.origin

  const supabase = await createClient()
  const [{ data: escData, error }, { data: confData }, { data: contData }] =
    await Promise.all([
      supabase
        .from("riesgos_externos_escalamiento")
        .select("*")
        .eq("activo", true)
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

  const escalamiento = (escData ?? []) as RiesgoExternoEscalamiento[]
  const config = (confData ?? []) as RiesgoExternoConfig[]
  const contactos = (contData ?? []) as RiesgoExternoContacto[]

  const prioritarios = new Set(
    config.filter((c) => c.prioritario).map((c) => c.tipo_riesgo),
  )
  let tipos = (Object.keys(TIPO_RIESGO_EXTERNO_LABELS) as TipoRiesgoExterno[])
    .filter((t) => escalamiento.some((e) => e.tipo_riesgo === t))
    .sort((a, b) => Number(prioritarios.has(b)) - Number(prioritarios.has(a)))

  if (soloRiesgo) {
    tipos = tipos.filter((t) => t === soloRiesgo)
    if (tipos.length === 0) {
      return NextResponse.json({ error: "riesgo desconocido" }, { status: 404 })
    }
  }

  // Los QR se generan antes de abrir el PDF porque pdfkit dibuja en sincrónico.
  const qrPorTipo = new Map<TipoRiesgoExterno, Buffer>()
  for (const tipo of tipos) {
    qrPorTipo.set(
      tipo,
      await QRCode.toBuffer(
        `${origin}/riesgos-externos?tab=plan&riesgo=${tipo}`,
        { width: 400, margin: 0, errorCorrectionLevel: "M" },
      ),
    )
  }
  const qrIndice = await QRCode.toBuffer(`${origin}/riesgos-externos?tab=plan`, {
    width: 600,
    margin: 0,
    errorCorrectionLevel: "M",
  })

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF({
      tipos,
      escalamiento,
      config,
      contactos,
      prioritarios,
      qrPorTipo,
      qrIndice,
      conIndice: !soloRiesgo,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando PDF" },
      { status: 500 },
    )
  }

  const nombre = soloRiesgo
    ? `Ficha-${soloRiesgo}.pdf`
    : "Riesgos-Externos-Fichas-Pizarron.pdf"

  return new NextResponse(new Uint8Array(pdfBuf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
    },
  })
}
