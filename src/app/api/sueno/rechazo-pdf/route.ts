/**
 * PDF "Detalle de rechazos del Árbol del Sueño" — Sin Dinero / Cerrado.
 * Clona el patrón de `src/app/api/rechazos/periodo-pdf/route.ts` reusando los
 * helpers de `../../rechazos/_pdf-helpers`.
 *
 * GET /api/sueno/rechazo-pdf?kpi=sin_dinero|cerrado&anio=YYYY[&mes=1..12]
 */
import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { requireAuth } from "@/lib/session"
import {
  getSuenoRechazoClientes,
  getSuenoRechazoPct,
} from "@/actions/sueno-rechazo"
import { esRechazoKpi } from "@/lib/sueno/rechazo-tipos"
import type { RechazoClienteRow, RechazoPctData } from "@/lib/sueno/rechazo-tipos"
import {
  COLOR_ACCENT,
  drawFooters,
  drawHeader,
  drawKPIs,
  drawSectionTitle,
  drawTable,
  formatHl,
  formatInt,
  formatPct,
  type Doc,
  type KPICard,
} from "../../rechazos/_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KPI_LABEL: Record<string, string> = {
  sin_dinero: "Sin Dinero",
  cerrado: "Cerrado",
}
const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const kpi = req.nextUrl.searchParams.get("kpi") ?? ""
  const anio = Number(req.nextUrl.searchParams.get("anio"))
  const mesRaw = req.nextUrl.searchParams.get("mes")
  const mes = mesRaw ? Number(mesRaw) : null

  if (!esRechazoKpi(kpi) || !Number.isInteger(anio) || anio < 2000) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 })
  }
  if (mes != null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 })
  }

  const [pctRes, cliRes] = await Promise.all([
    getSuenoRechazoPct(kpi, anio),
    getSuenoRechazoClientes(kpi, anio, mes),
  ])
  if ("error" in pctRes) {
    return NextResponse.json({ error: pctRes.error }, { status: 500 })
  }
  if ("error" in cliRes) {
    return NextResponse.json({ error: cliRes.error }, { status: 500 })
  }

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(kpi, anio, mes, pctRes.data, cliRes.data)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    )
  }

  const mesTag = mes ? `_${String(mes).padStart(2, "0")}` : ""
  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rechazos-${kpi}-${anio}${mesTag}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

async function renderPDF(
  kpi: string,
  anio: number,
  mes: number | null,
  pct: RechazoPctData,
  clientes: RechazoClienteRow[],
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const periodoTxt = mes ? `${MESES_LARGO[mes - 1]} ${anio}` : `Año ${anio}`
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Rechazos ${KPI_LABEL[kpi]} · ${periodoTxt}`,
        Author: "Mercosur · dpo-app",
        Subject: "Detalle de rechazos del Árbol del Sueño",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    try {
      buildPDF(doc, kpi, mes, periodoTxt, pct, clientes)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function buildPDF(
  doc: Doc,
  kpi: string,
  mes: number | null,
  periodoTxt: string,
  pct: RechazoPctData,
  clientes: RechazoClienteRow[],
) {
  drawHeader(doc, `Rechazos · ${KPI_LABEL[kpi]}`, periodoTxt, "Detalle del Árbol del Sueño")

  // Resumen del período (mes puntual o YTD del año).
  const resumen = mes
    ? pct.meses.find((m) => m.mes === mes) ?? {
        cantTipo: 0, cantTotal: 0, pctCant: null, bultosTipo: 0, bultosTotal: 0, pctBultos: null,
      }
    : pct.ytd

  const cards: KPICard[] = [
    { label: "Rechazos", value: formatInt(resumen.cantTipo), sub: `de ${formatInt(resumen.cantTotal)} totales`, color: COLOR_ACCENT },
    { label: "% del total (veces)", value: formatPct(resumen.pctCant, 1), sub: "sobre eventos" },
    { label: "Bultos rech.", value: formatHl(resumen.bultosTipo), sub: `de ${formatHl(resumen.bultosTotal)}` },
    { label: "% del total (bultos)", value: formatPct(resumen.pctBultos, 1), sub: "sobre bultos" },
    { label: "Clientes", value: formatInt(clientes.length), sub: "afectados" },
  ]
  drawKPIs(doc, cards)

  drawSectionTitle(doc, `Clientes que más rechazan · ${periodoTxt}`)
  drawTable(
    doc,
    clientes,
    [
      { header: "#", width: 24, align: "right", get: (r) => String(clientes.indexOf(r) + 1) },
      { header: "Cliente", width: 240, get: (r) => r.nombreCliente },
      { header: "Veces", width: 60, align: "right", get: (r) => formatInt(r.eventos) },
      { header: "Bultos", width: 65, align: "right", get: (r) => formatHl(r.bultos) },
      { header: "HL", width: 60, align: "right", get: (r) => formatHl(r.hl) },
    ],
    "Sin rechazos de este tipo en el período.",
  )
}
