/**
 * Excel del checklist de flota para un período (pestañas Pirámide, Check lists
 * y Análisis de ítems).
 *
 * GET /api/vehiculos/checklist/export?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Cuatro hojas, que son las cuatro preguntas de la auditoría del punto 1.3:
 * qué se detectó, en qué unidad, qué ítem lo detectó y si el checklist está
 * detectando algo.
 */
export const maxDuration = 60

import { NextResponse, type NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { requireAuth } from "@/lib/session"
import { getAnalisisChecklist } from "@/actions/checklist-analisis"
import { getCalidadDeteccion } from "@/actions/checklist-deteccion"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const fmtFecha = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : ""

const redondear = (v: number | null, dec = 2) =>
  v == null ? "" : Number(v.toFixed(dec))

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const desde = req.nextUrl.searchParams.get("desde")
  const hasta = req.nextUrl.searchParams.get("hasta")
  const periodo = { desde, hasta }

  const [analisisRes, deteccionRes] = await Promise.all([
    getAnalisisChecklist(periodo),
    getCalidadDeteccion(periodo),
  ])
  if ("error" in analisisRes) {
    return NextResponse.json({ error: analisisRes.error }, { status: 500 })
  }
  if ("error" in deteccionRes) {
    return NextResponse.json({ error: deteccionRes.error }, { status: 500 })
  }
  const analisis = analisisRes.data
  const deteccion = deteccionRes.data

  const wb = XLSX.utils.book_new()

  // 1. Por unidad: el reparto de la torta, con su denominador al lado.
  const porUnidad = deteccion.porUnidad.map((u) => ({
    Unidad: u.dominio,
    Hallazgos: u.hallazgos,
    Checklists: u.checklists,
    "Cada 10 checklists": redondear(u.cada10, 1),
  }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(porUnidad),
    "Por unidad"
  )

  // 2. Por ítem: qué falla y con qué frecuencia sobre las veces evaluado.
  const porItem = analisis.items
    .filter((i) => i.hallazgos > 0)
    .map((i) => ({
      Ítem: i.nombre,
      Categoría: i.categoria,
      Modal: i.tipoVehiculo,
      Crítico: i.critico ? "Sí" : "No",
      "NO OK": i.noOk,
      Regular: i.regular,
      Hallazgos: i.hallazgos,
      Evaluado: i.evaluado,
      "Tasa %": redondear(i.tasa),
      Unidades: i.unidades.map((u) => `${u.dominio} (${u.veces})`).join(", "),
      Último: fmtFecha(i.ultimaFecha),
      Conclusión: i.observacion ?? "",
    }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(porItem),
    "Por ítem"
  )

  // 3. Crónicos, con la columna que importa: si derivó en taller o no.
  const cronicos = analisis.cronicos.map((c) => ({
    Unidad: c.dominio,
    Ítem: c.item,
    Categoría: c.categoria,
    Crítico: c.critico ? "Sí" : "No",
    Veces: c.veces,
    "NO OK": c.noOk,
    Observaciones: c.regular,
    Desde: fmtFecha(c.primera),
    Última: fmtFecha(c.ultima),
    "Plan de acción": c.conPlan ? "Sí" : "No",
    "Mantenimientos desde": c.mantenimientosDesde,
    "Sin OT ni plan":
      !c.conPlan && c.mantenimientosDesde === 0 ? "SÍ" : "",
  }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(cronicos),
    "Crónicos"
  )

  // 4. Calidad de la detección por chofer.
  const porChofer = deteccion.porChofer.map((c) => ({
    Chofer: c.chofer,
    Checklists: c.checklists,
    "Con hallazgo": c.conHallazgo,
    "Ítems marcados": c.hallazgos,
    "Detección %": redondear(c.pctDeteccion),
    "Nunca detectó":
      c.conHallazgo === 0 && c.checklists >= 20 ? "SÍ" : "",
  }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(porChofer),
    "Detección por chofer"
  )

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const sufijo = desde || hasta ? `_${desde ?? "inicio"}_${hasta ?? "hoy"}` : "_historico"

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="checklist_flota${sufijo}.xlsx"`,
    },
  })
}
