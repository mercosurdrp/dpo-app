/**
 * PDF del libro de gastos de mantenimiento (pestaña Gastos).
 * Reusa los helpers de `src/app/api/rechazos/_pdf-helpers`.
 *
 * GET /api/vehiculos/gastos/pdf?mes=YYYY-MM&tipo=factura|boleta|caja_chica
 *     &motivo=<motivo>&mantenimiento=preventivo|correctivo|proactivo
 */
import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { requireAuth } from "@/lib/session"
import {
  GASTO_MOTIVO_SIN,
  GASTO_TIPO_LABELS,
  GASTO_TIPO_MANTENIMIENTO_LABELS,
  type MantenimientoGasto,
  type MantenimientoTipo,
} from "@/types/database"
import {
  COLOR_PRIMARY,
  drawFooters,
  drawHeader,
  drawKPIs,
  drawSectionTitle,
  drawTable,
  formatInt,
  formatMoneyFull,
  type Doc,
  type KPICard,
} from "../../../rechazos/_pdf-helpers"
import { fetchGastosExport, MANT_SIN } from "../_shared"

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

const fmtFecha = (f: string | null) => (f ? f.slice(0, 10).split("-").reverse().join("/") : "—")

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const mes = req.nextUrl.searchParams.get("mes")
  const tipo = req.nextUrl.searchParams.get("tipo")
  const motivo = req.nextUrl.searchParams.get("motivo")
  const mantenimiento = req.nextUrl.searchParams.get("mantenimiento")

  let gastos: MantenimientoGasto[]
  try {
    gastos = await fetchGastosExport({ mes, tipo, motivo, mantenimiento })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }

  let pdfBuf: Buffer
  try {
    pdfBuf = await renderPDF(gastos, mes, tipo, motivo, mantenimiento)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }

  const filename = `gastos-mantenimiento${mes ? `-${mes}` : ""}.pdf`
  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

async function renderPDF(
  gastos: MantenimientoGasto[],
  mes: string | null,
  tipo: string | null,
  motivo: string | null,
  mantenimiento: string | null
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Gastos de Mantenimiento${mes ? ` · ${mesLargo(mes)}` : ""}`,
        Author: "Mercosur · dpo-app",
        Subject: "Libro de gastos de mantenimiento de flota",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      buildPDF(doc, gastos, mes, tipo, motivo, mantenimiento)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function buildPDF(
  doc: Doc,
  gastos: MantenimientoGasto[],
  mes: string | null,
  tipo: string | null,
  motivo: string | null,
  mantenimiento: string | null
) {
  const periodo = mes ? mesLargo(mes) : "Todos los meses"
  const filtroTipo = tipo ? GASTO_TIPO_LABELS[tipo as MantenimientoGasto["tipo"]] ?? tipo : "Todos los tipos"
  const filtroMotivo =
    motivo === GASTO_MOTIVO_SIN ? "Sin motivo" : motivo ? motivo : "Todos los motivos"
  const filtroMant =
    mantenimiento === MANT_SIN
      ? "No corresponde"
      : mantenimiento
        ? GASTO_TIPO_MANTENIMIENTO_LABELS[mantenimiento as MantenimientoTipo] ?? mantenimiento
        : null
  drawHeader(
    doc,
    "Gastos de Mantenimiento",
    periodo,
    `Flota · ${filtroTipo} · ${filtroMotivo}${filtroMant ? ` · ${filtroMant}` : ""}`
  )

  const total = gastos.reduce((a, g) => a + Number(g.monto), 0)
  const sinImputar = gastos.filter((g) => g.estado_imputacion === "pendiente").length
  const imputados = gastos.filter((g) => g.estado_imputacion === "imputado").length

  const cards: KPICard[] = [
    { label: "Total", value: formatMoneyFull(total), sub: periodo, color: COLOR_PRIMARY },
    { label: "Comprobantes", value: formatInt(gastos.length), sub: filtroTipo },
    { label: "Sin imputar", value: formatInt(sinImputar), sub: "pendientes" },
    { label: "Imputados", value: formatInt(imputados), sub: "confirmados" },
  ]
  drawKPIs(doc, cards)

  const clip = (s: string | null, n: number) =>
    !s ? "—" : s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

  // Reparto por motivo: es la lectura que pide el R3.2.2 (preventivo, correctivo,
  // daños evitables y multas), y lo primero que mira el auditor.
  if (gastos.length > 0) {
    const acc = new Map<string, { motivo: string; monto: number; n: number }>()
    for (const g of gastos) {
      const k = g.rubro?.trim() || "Sin motivo"
      const cur = acc.get(k) ?? { motivo: k, monto: 0, n: 0 }
      cur.monto += Number(g.monto)
      cur.n += 1
      acc.set(k, cur)
    }
    const filas = Array.from(acc.values()).sort((a, b) => b.monto - a.monto)
    drawSectionTitle(doc, `Gasto por motivo · ${periodo}`)
    drawTable<(typeof filas)[number]>(
      doc,
      filas,
      [
        { header: "Motivo", width: 200, get: (m) => m.motivo },
        { header: "Comprobantes", width: 80, align: "right", get: (m) => formatInt(m.n) },
        { header: "Monto", width: 90, align: "right", get: (m) => formatMoneyFull(m.monto) },
        {
          header: "% del total",
          width: 70,
          align: "right",
          get: (m) => (total > 0 ? `${((100 * m.monto) / total).toFixed(1)}%` : "—"),
        },
      ],
      "Sin gastos cargados para este filtro."
    )
  }

  drawSectionTitle(doc, `Detalle de gastos · ${periodo}`)

  drawTable<MantenimientoGasto>(
    doc,
    gastos,
    [
      { header: "Fecha", width: 50, get: (g) => fmtFecha(g.fecha) },
      { header: "Tipo", width: 52, get: (g) => GASTO_TIPO_LABELS[g.tipo] ?? g.tipo },
      { header: "Proveedor", width: 100, get: (g) => clip(g.proveedor, 22) },
      { header: "Motivo", width: 82, get: (g) => clip(g.rubro, 18) },
      { header: "N° OT", width: 40, get: (g) => g.orden_trabajo ?? "—" },
      { header: "N° comp.", width: 56, get: (g) => clip(g.numero_comprobante, 12) },
      { header: "Unidad", width: 45, get: (g) => g.dominio ?? "—" },
      { header: "Mes imp.", width: 44, get: (g) => g.mes_imputacion },
      { header: "Estado", width: 48, get: (g) => (g.estado_imputacion === "imputado" ? "Imputado" : "Sin imp.") },
      { header: "Monto", width: 55, align: "right", get: (g) => formatMoneyFull(Number(g.monto)) },
    ],
    "Sin gastos cargados para este filtro."
  )
}
