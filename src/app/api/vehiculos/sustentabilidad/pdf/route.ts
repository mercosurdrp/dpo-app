/**
 * Hoja de evidencia del punto 4.3 "Sustainability Goals" del pilar Flota.
 *
 * Es el respaldo que se adjunta en /evidencia/flota/4-3 para el R4.3.2 —el PI
 * elegido y su serie— y que impreso sirve para la cartelera del R4.3.1, que
 * pide que los choferes conozcan los objetivos.
 *
 * 🚨 Los dos PI, las metas y la tendencia salen de `lib/vehiculos/sustentabilidad`,
 * el mismo módulo que usa la pantalla. Si el PDF recalculara por su cuenta, el
 * auditor terminaría con dos números distintos del mismo indicador y el punto se
 * caería por eso.
 *
 * GET /api/vehiculos/sustentabilidad/pdf
 */
import { NextResponse } from "next/server"
import PDFDocument from "pdfkit"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import {
  agregadoCo2,
  KG_CO2_POR_LITRO_DIESEL,
  META_CO2_100KM,
  META_RECUPERACION,
  recuperacionDelAnio,
  recuperacionPorMes,
  tendencia3Meses,
  type MesRecuperacion,
  type MesSustentabilidad,
  type Tendencia,
  type UnidadSustentabilidad,
} from "@/lib/vehiculos/sustentabilidad"
import {
  COLOR_MUTED,
  COLOR_OK,
  COLOR_ACCENT,
  COLOR_TEXT,
  drawFooters,
  drawHeader,
  drawKPIs,
  drawSectionTitle,
  drawTable,
  formatInt,
  type Doc,
} from "../../../rechazos/_pdf-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
]

const fmtMes = (ym: string) => {
  const [y, m] = ym.split("-")
  return `${MESES[Number(m) - 1] ?? m} ${y.slice(2)}`
}

const num = (n: number | null | undefined, dec = 0) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("es-AR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }).format(n)

interface Datos {
  porMes: MesSustentabilidad[]
  porUnidad: UnidadSustentabilidad[]
  anio: { litros: number; km: number; co2Kg: number; co2Por100Km: number | null }
  recup: MesRecuperacion[]
  recupAnio: { recapadas: number; desechadas: number; pct: number | null }
  parqueConRecapado: number
  parqueTotal: number
}

async function cargar(): Promise<Datos> {
  const supabase = await createClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const anioActual = hoy.slice(0, 4)
  const inicio = `${Number(anioActual) - 1}-${hoy.slice(5, 7)}-01`

  // Combustible: paginado, igual que la action (PostgREST corta en 1000).
  const PAGE = 1000
  const cargas: Array<{
    dominio: string
    fecha: string
    litros: number | null
    km_recorridos: number | null
  }> = []
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabase
      .from("registro_combustible")
      .select("dominio, fecha, litros, km_recorridos")
      .gte("fecha", inicio)
      .order("fecha", { ascending: true })
      .range(off, off + PAGE - 1)
    if (error) throw new Error(error.message)
    const page = (data || []) as typeof cargas
    cargas.push(...page)
    if (page.length < PAGE) break
  }

  const [neuRes, recRes] = await Promise.all([
    supabase
      .from("mantenimiento_neumaticos")
      .select("estado, residuo_id, fecha_baja, vueltas_recapado"),
    supabase
      .from("mantenimiento_recapados")
      .select("fecha_retorno, items:mantenimiento_recapado_items(resultado)"),
  ])
  if (neuRes.error) throw new Error(neuRes.error.message)
  if (recRes.error) throw new Error(recRes.error.message)

  const mesMap = new Map<string, { litros: number; km: number; cargas: number }>()
  const domMap = new Map<string, { litros: number; km: number }>()
  let litrosAnio = 0
  let kmAnio = 0
  for (const c of cargas) {
    const litros = Number(c.litros || 0)
    const km = Number(c.km_recorridos || 0)
    const mes = c.fecha.slice(0, 7)
    if (!mesMap.has(mes)) mesMap.set(mes, { litros: 0, km: 0, cargas: 0 })
    const m = mesMap.get(mes)!
    m.litros += litros
    m.km += km
    m.cargas++
    if (!domMap.has(c.dominio)) domMap.set(c.dominio, { litros: 0, km: 0 })
    const d = domMap.get(c.dominio)!
    d.litros += litros
    d.km += km
    if (c.fecha.slice(0, 4) === anioActual) {
      litrosAnio += litros
      kmAnio += km
    }
  }

  const neumaticos = (neuRes.data || []) as Array<{
    estado: string
    residuo_id: string | null
    fecha_baja: string | null
    vueltas_recapado: number | null
  }>
  const recapados = (recRes.data || []) as Array<{
    fecha_retorno: string | null
    items?: { resultado: string }[]
  }>

  const recup = recuperacionPorMes(neumaticos, recapados)

  return {
    porMes: Array.from(mesMap.entries())
      .map(([mes, v]) => ({ mes, cargas: v.cargas, ...agregadoCo2(v.litros, v.km) }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
    porUnidad: Array.from(domMap.entries())
      .map(([dominio, v]) => ({ dominio, ...agregadoCo2(v.litros, v.km) }))
      .sort((a, b) => b.co2Kg - a.co2Kg),
    anio: agregadoCo2(litrosAnio, kmAnio),
    recup,
    recupAnio: recuperacionDelAnio(recup, anioActual),
    parqueConRecapado: neumaticos.filter((n) => Number(n.vueltas_recapado || 0) > 0).length,
    parqueTotal: neumaticos.length,
  }
}

function textoTendencia(t: Tendencia, unidad: string): string {
  if (t.estado === "sin_datos") return "Sin datos suficientes"
  const señal = t.delta != null && t.delta > 0 ? "+" : ""
  const meses = t.meses.map(fmtMes).join(" → ")
  const etiqueta =
    t.estado === "mejora" ? "MEJORA" : t.estado === "empeora" ? "EMPEORA" : "ESTABLE"
  return `${etiqueta} · ${señal}${num(t.delta, 1)} ${unidad} (${meses})`
}

export async function GET() {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let datos: Datos
  try {
    datos = await cargar()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }

  let buf: Buffer
  try {
    buf = await render(datos)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }

  const anio = new Date().toISOString().slice(0, 4)
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="dpo-flota-4-3-sustentabilidad-${anio}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

async function render(d: Datos): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: "DPO Flota 4.3 · Objetivos de sostenibilidad",
        Author: "Mercosur · dpo-app",
        Subject: "Evidencia del punto 4.3 del pilar Flota (R4.3.2 y R4.3.3)",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      build(doc, d)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function build(doc: Doc, d: Datos) {
  const hoy = new Date()
  const mesActual = hoy.toISOString().slice(0, 7)
  const anio = mesActual.slice(0, 4)

  const tCo2 = tendencia3Meses(
    d.porMes.map((m) => ({ mes: m.mes, valor: m.co2Por100Km })),
    mesActual,
    true
  )
  const tRecup = tendencia3Meses(
    d.recup.map((r) => ({ mes: r.mes, valor: r.pct })),
    mesActual,
    false
  )

  drawHeader(
    doc,
    "Objetivos de sostenibilidad",
    `DPO Flota · punto 4.3`,
    `Año ${anio} · emitido ${hoy.toLocaleDateString("es-AR")}`
  )

  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "El punto 4.3 pide elegir indicadores de sostenibilidad por su impacto (R4.3.2), que muestren " +
        "tendencia positiva sobre los últimos 3 meses, y acciones locales para mejorarlos (R4.3.3). " +
        "Estos son los dos indicadores elegidos por la operación de flota.",
      { width: doc.page.width - doc.page.margins.left * 2 }
    )
  doc.moveDown(0.8)

  // ─────────── PI 1 · emisiones ───────────
  drawSectionTitle(doc, "PI 1 — kg de CO2 cada 100 km")

  drawKPIs(doc, [
    {
      label: `CO2 ${anio}`,
      value: `${num(d.anio.co2Kg / 1000, 1)} t`,
      sub: `${formatInt(d.anio.litros)} L · ${formatInt(d.anio.km)} km`,
    },
    {
      label: "Indicador del año",
      value: `${num(d.anio.co2Por100Km, 1)}`,
      sub: `kg CO2/100 km · meta ${META_CO2_100KM}`,
      color:
        d.anio.co2Por100Km != null && d.anio.co2Por100Km <= META_CO2_100KM
          ? COLOR_OK
          : COLOR_ACCENT,
    },
    {
      label: "Tendencia 3 meses",
      value: tCo2.estado === "mejora" ? "Mejora" : tCo2.estado === "empeora" ? "Empeora" : "—",
      sub: textoTendencia(tCo2, "kg/100 km"),
      color: tCo2.estado === "mejora" ? COLOR_OK : COLOR_ACCENT,
    },
    {
      label: "Factor de emisión",
      value: `${num(KG_CO2_POR_LITRO_DIESEL, 2)}`,
      sub: "kg CO2 por litro de gasoil",
    },
  ])
  doc.moveDown(0.6)

  doc
    .fillColor(COLOR_TEXT)
    .font("Helvetica")
    .fontSize(8)
    .text(
      "Método de cálculo: emisiones de alcance 1 por combustión propia = litros de gasoil consumidos × " +
        `${num(KG_CO2_POR_LITRO_DIESEL, 2)} kg CO2/L (factor de combustión de diésel, DEFRA/IPCC). ` +
        "Los litros y los kilómetros salen de los remitos de combustible cargados por unidad en el " +
        "módulo de flota: el indicador es trazable hasta el comprobante.",
      { width: doc.page.width - doc.page.margins.left * 2 }
    )
  doc.moveDown(0.7)

  drawTable(
    doc,
    d.porMes.filter((m) => m.mes <= mesActual),
    [
      {
        header: "Mes",
        width: 60,
        get: (m) => `${fmtMes(m.mes)}${m.mes === mesActual ? " (en curso)" : ""}`,
      },
      { header: "Litros", width: 55, align: "right", get: (m) => formatInt(m.litros) },
      { header: "Km", width: 55, align: "right", get: (m) => formatInt(m.km) },
      {
        header: "L/100 km",
        width: 55,
        align: "right",
        get: (m) => (m.km > 0 ? num((m.litros / m.km) * 100, 1) : "—"),
      },
      { header: "kg CO2", width: 55, align: "right", get: (m) => formatInt(m.co2Kg) },
      {
        header: "kg CO2/100 km",
        width: 65,
        align: "right",
        get: (m) => num(m.co2Por100Km, 1),
      },
      {
        header: "vs meta",
        width: 50,
        align: "right",
        get: (m) =>
          m.co2Por100Km == null
            ? "—"
            : m.co2Por100Km <= META_CO2_100KM
              ? "cumple"
              : `+${num(m.co2Por100Km - META_CO2_100KM, 1)}`,
      },
    ],
    "Sin cargas de combustible en el período"
  )
  doc.moveDown(0.8)

  drawSectionTitle(doc, "PI 1 — apertura por unidad")
  drawTable(
    doc,
    d.porUnidad,
    [
      { header: "Unidad", width: 70, get: (u) => u.dominio },
      { header: "Litros", width: 55, align: "right", get: (u) => formatInt(u.litros) },
      { header: "Km", width: 55, align: "right", get: (u) => formatInt(u.km) },
      { header: "kg CO2", width: 55, align: "right", get: (u) => formatInt(u.co2Kg) },
      {
        header: "kg CO2/100 km",
        width: 65,
        align: "right",
        get: (u) => num(u.co2Por100Km, 1),
      },
    ],
    "Sin cargas de combustible"
  )
  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      "Los autoelevadores no registran kilómetros: su uso se mide por horómetro, así que el indicador " +
        "por 100 km no les aplica y su CO2 se sigue en valor absoluto.",
      { width: doc.page.width - doc.page.margins.left * 2 }
    )
  doc.moveDown(0.8)

  // ─────────── PI 2 · economía circular ───────────
  doc.addPage()
  drawSectionTitle(doc, "PI 2 — % de cubiertas recuperadas por recapado")

  drawKPIs(doc, [
    {
      label: `Recuperación ${anio}`,
      value: d.recupAnio.pct != null ? `${num(d.recupAnio.pct, 1)} %` : "—",
      sub: `meta ${META_RECUPERACION} %`,
      color:
        d.recupAnio.pct != null && d.recupAnio.pct >= META_RECUPERACION ? COLOR_OK : COLOR_ACCENT,
    },
    {
      label: "Recapadas",
      value: String(d.recupAnio.recapadas),
      sub: "volvieron a rodar",
      color: COLOR_OK,
    },
    {
      label: "A la recicladora",
      value: String(d.recupAnio.desechadas),
      sub: "con certificado de disposición",
    },
    {
      label: "Parque con recapado",
      value: `${d.parqueConRecapado}/${d.parqueTotal}`,
      sub: "cubiertas con al menos una vuelta",
    },
  ])
  doc.moveDown(0.6)

  doc
    .fillColor(COLOR_TEXT)
    .font("Helvetica")
    .fontSize(8)
    .text(
      "Método de cálculo: de las cubiertas que salieron de servicio, porcentaje que volvió a rodar " +
        "recapado en vez de ir a la recicladora. Respaldo: remitos de envío y retorno del recapador y " +
        "certificados de disposición final. No se cuenta como desecho la cubierta transferida a otro " +
        "centro de distribución: salió del parque, pero no se descartó. " +
        `Tendencia 3 meses: ${textoTendencia(tRecup, "puntos")}.`,
      { width: doc.page.width - doc.page.margins.left * 2 }
    )
  doc.moveDown(0.7)

  drawTable(
    doc,
    d.recup.filter((r) => r.mes <= mesActual),
    [
      { header: "Mes", width: 70, get: (r) => fmtMes(r.mes) },
      { header: "Recapadas", width: 60, align: "right", get: (r) => String(r.recapadas || "—") },
      {
        header: "A recicladora",
        width: 60,
        align: "right",
        get: (r) => String(r.desechadas || "—"),
      },
      {
        header: "Recuperación",
        width: 60,
        align: "right",
        get: (r) => (r.pct != null ? `${num(r.pct, 0)} %` : "—"),
      },
      {
        header: "vs meta",
        width: 50,
        align: "right",
        get: (r) =>
          r.pct == null ? "—" : r.pct >= META_RECUPERACION ? "cumple" : `${num(r.pct - META_RECUPERACION, 0)}`,
      },
    ],
    "Sin cubiertas recapadas ni desechadas en el período"
  )
  doc.moveDown(1)

  // ─────────── Requisitos ───────────
  drawSectionTitle(doc, "Qué responde cada requisito del punto 4.3")

  const bloques: Array<[string, string]> = [
    [
      "R4.3.1 — Los empleados de primera línea conocen los objetivos",
      "Charla de sostenibilidad a conductores y operadores, con registro de asistencia, y los dos " +
        "indicadores de esta hoja publicados en la cartelera del sector.",
    ],
    [
      "R4.3.2 — Indicadores elegidos por su impacto",
      "Los dos de esta hoja: emisiones de CO2 por kilómetro (impacto en huella de carbono) y " +
        "recuperación de cubiertas por recapado (impacto en residuos). Serie mensual, meta definida " +
        "y tendencia de 3 meses, calculados sobre datos propios y trazables a comprobante.",
    ],
    [
      "R4.3.3 — Acciones locales definidas y ejecutadas",
      "Recapado de cubiertas en lugar de compra de goma nueva; control de presión y rotación " +
        "programada, que bajan el consumo y alargan la vida de la cubierta; disposición certificada " +
        "de las cubiertas que no se pueden recuperar; y reparación de pérdidas de fluidos detectadas " +
        "por el checklist diario, con la orden de trabajo como cierre.",
    ],
  ]

  for (const [titulo, cuerpo] of bloques) {
    doc.fillColor(COLOR_TEXT).font("Helvetica-Bold").fontSize(8.5).text(titulo)
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(cuerpo, { width: doc.page.width - doc.page.margins.left * 2 })
    doc.moveDown(0.5)
  }
}
