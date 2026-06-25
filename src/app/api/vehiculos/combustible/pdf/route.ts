/**
 * PDF "Análisis de combustible de la flota" (por camión, mensual).
 * Reusa los helpers de `src/app/api/rechazos/_pdf-helpers`.
 *
 * GET /api/vehiculos/combustible/pdf?mes=YYYY-MM
 */
import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { requireAuth } from "@/lib/session"
import {
  getAnalisisCombustible,
  type AnalisisCombustible,
  type CombustibleCamion,
} from "@/actions/combustible-analisis"
import {
  COLOR_PRIMARY,
  drawFooters,
  drawHeader,
  drawKPIs,
  drawSectionTitle,
  drawTable,
  formatInt,
  type Doc,
  type KPICard,
} from "../../../rechazos/_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function mesLargo(mes: string): string {
  const [y, m] = mes.split("-").map((s) => parseInt(s, 10))
  return `${MESES[m - 1] ?? mes} ${y}`
}

const num = (n: number | null, dec = 2) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n)

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const mes = req.nextUrl.searchParams.get("mes") ?? undefined
  const res = await getAnalisisCombustible(mes)
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 500 })
  }

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(res.data)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    )
  }

  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="combustible-${res.data.mes}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

async function renderPDF(data: AnalisisCombustible): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Combustible · ${mesLargo(data.mes)}`,
        Author: "Mercosur · dpo-app",
        Subject: "Análisis de combustible de la flota",
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

function buildPDF(doc: Doc, data: AnalisisCombustible) {
  drawHeader(doc, "Análisis de Combustible", mesLargo(data.mes), "Flota · por camión")

  const cards: KPICard[] = [
    { label: "Camiones", value: formatInt(data.total_camiones), sub: `${formatInt(data.total_cargas)} cargas` },
    { label: "Litros cargados", value: formatInt(data.total_litros), sub: "en el mes" },
    { label: "Km recorridos", value: formatInt(data.total_km), sub: "con medición" },
    { label: "Rendimiento flota", value: `${num(data.rendimiento_flota)} km/l`, sub: `${num(data.l_100km_flota)} L/100km`, color: COLOR_PRIMARY },
  ]
  drawKPIs(doc, cards)

  drawSectionTitle(doc, `Consumo por camión · ${mesLargo(data.mes)} (peor rendimiento primero)`)

  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
  const camionLabel = (c: CombustibleCamion) =>
    c.modelo || c.descripcion ? `${c.dominio} · ${clip((c.modelo || c.descripcion)!, 18)}` : c.dominio

  drawTable<CombustibleCamion>(
    doc,
    data.camiones,
    [
      { header: "Camión", width: 150, get: (c) => camionLabel(c) },
      { header: "Cargas", width: 50, align: "right", get: (c) => formatInt(c.cargas) },
      { header: "Litros", width: 66, align: "right", get: (c) => formatInt(c.litros) },
      { header: "Km", width: 66, align: "right", get: (c) => formatInt(c.km) },
      { header: "Rend.", width: 60, align: "right", get: (c) => (c.rendimiento != null ? `${num(c.rendimiento)}` : "—") },
      { header: "L/100km", width: 60, align: "right", get: (c) => (c.l_100km != null ? num(c.l_100km) : "—") },
      { header: "vs Flota", width: 56, align: "right", get: (c) => (c.desvio_pct != null ? `${c.desvio_pct > 0 ? "+" : ""}${num(c.desvio_pct, 1)}%` : "—") },
    ],
    "Sin cargas de combustible en el mes.",
  )

  doc.moveDown(0.3)
  doc
    .fillColor("#64748b")
    .font("Helvetica-Oblique")
    .fontSize(7.5)
    .text(
      `Rendimiento = km recorridos ÷ litros (km/l): a mayor número, mejor. "vs Flota" es el desvío respecto al ` +
        `promedio de la flota (${num(data.rendimiento_flota)} km/l): negativo = consume de más. El rendimiento usa solo ` +
        `las cargas con medición de km (la 1ª carga de cada camión no la tiene).`,
      doc.page.margins.left,
      doc.y,
      { width: doc.page.width - doc.page.margins.left * 2 },
    )
}
