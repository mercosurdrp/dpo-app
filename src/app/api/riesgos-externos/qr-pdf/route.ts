/**
 * Cartel de UNA HOJA con el QR general de riesgos externos, para pegar en el
 * pizarrón del CD: quien lo escanea entra al plan de respuesta y elige el
 * riesgo que necesita (DPO Planeamiento 2.2, R2.2.4 — difusión y cartelería).
 *
 * GET /api/riesgos-externos/qr-pdf
 */
import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import {
  TIPO_RIESGO_EXTERNO_LABELS,
  type RiesgoExternoConfig,
  type TipoRiesgoExterno,
} from "@/types/database"
import { renderAfiche } from "../_fichas-pdf-render"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const supabase = await createClient()
  const [{ data: confData }, { data: escData }] = await Promise.all([
    supabase.from("riesgos_externos_config").select("*"),
    supabase
      .from("riesgos_externos_escalamiento")
      .select("tipo_riesgo")
      .eq("activo", true),
  ])

  const config = (confData ?? []) as RiesgoExternoConfig[]
  const conPlan = new Set((escData ?? []).map((e) => e.tipo_riesgo as string))
  const prioritarios = new Set(
    config.filter((c) => c.prioritario).map((c) => c.tipo_riesgo),
  )

  const tipos = (Object.keys(TIPO_RIESGO_EXTERNO_LABELS) as TipoRiesgoExterno[])
    .filter((t) => conPlan.has(t))
    .sort((a, b) => Number(prioritarios.has(b)) - Number(prioritarios.has(a)))

  const qrIndice = await QRCode.toBuffer(
    `${request.nextUrl.origin}/riesgos-externos?tab=plan`,
    { width: 800, margin: 0, errorCorrectionLevel: "M" },
  )

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderAfiche({ tipos, prioritarios, qrIndice })
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
        'inline; filename="Riesgos-Externos-QR-Pizarron.pdf"',
    },
  })
}
