/**
 * Hoja de evidencia del punto 4.3 "Sustainability Goals" del pilar Flota.
 *
 * Dos salidas distintas, porque son dos públicos distintos:
 *
 *   GET /api/vehiculos/sustentabilidad/pdf
 *     La hoja de evidencia para el auditor: la serie mensual de cada PI, la
 *     apertura por unidad, el método de cálculo y las acciones registradas.
 *     Es el respaldo del R4.3.2 y del R4.3.3.
 *
 *   GET /api/vehiculos/sustentabilidad/pdf?formato=cartelera
 *     Una sola hoja para el pizarrón del sector, en letra grande y con cuatro
 *     números. Es lo que pide el R4.3.1: que el chofer conozca los objetivos.
 *     La hoja del auditor NO sirve para eso —tres páginas de tablas en cuerpo 8
 *     no las lee nadie de pie frente a una cartelera—, y al revés tampoco.
 *
 * 🚨 Los dos PI, las metas y la tendencia salen de `lib/vehiculos/sustentabilidad`,
 * el mismo módulo que usa la pantalla. Si el PDF recalculara por su cuenta, el
 * auditor terminaría con dos números distintos del mismo indicador y el punto se
 * caería por eso.
 */
import { NextResponse, type NextRequest } from "next/server"
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

/** Una acción del R4.3.3 tal como quedó registrada en el sistema. */
interface Accion {
  fecha: string
  que: string
  detalle: string
  respaldo: string
}

interface Datos {
  porMes: MesSustentabilidad[]
  porUnidad: UnidadSustentabilidad[]
  anio: { litros: number; km: number; co2Kg: number; co2Por100Km: number | null }
  recup: MesRecuperacion[]
  recupAnio: { recapadas: number; desechadas: number; pct: number | null }
  parqueConRecapado: number
  parqueTotal: number
  acciones: Accion[]
}

/**
 * Las acciones del R4.3.3 NO se escriben a mano en el PDF: se leen del sistema.
 * El requisito pide acciones "definidas y ejecutadas", así que lo que vale es lo
 * que tiene registro —la OT, el remito, el certificado—, no una lista declarada.
 */
async function cargarAcciones(
  supabase: Awaited<ReturnType<typeof createClient>>,
  desde: string
): Promise<Accion[]> {
  const acciones: Accion[] = []

  // 1) OT que corrigieron pérdidas de fluidos: derrame evitado = suelo no contaminado.
  const { data: ot } = await supabase
    .from("mantenimiento_realizados")
    .select(
      "numero_ot, dominio, fecha, taller, observaciones, tareas:mantenimiento_realizado_tareas(descripcion)"
    )
    .neq("estado", "cancelado")
    .gte("fecha", desde)
    .order("fecha", { ascending: false })
  const RE_FLUIDOS = /p[eé]rdida|fuga|derrame|gotea|hidr[aá]ulic/i
  for (const o of (ot || []) as Array<{
    numero_ot: string | null
    dominio: string
    fecha: string
    taller: string | null
    observaciones: string | null
    tareas: { descripcion: string | null }[]
  }>) {
    const tareas = (o.tareas || []).map((t) => t.descripcion ?? "").filter(Boolean)
    if (!RE_FLUIDOS.test([o.observaciones ?? "", ...tareas].join(" · "))) continue
    acciones.push({
      fecha: o.fecha,
      que: "Reparación de pérdida de fluidos",
      detalle: `${o.dominio} — ${tareas.join("; ") || "ver observaciones de la OT"}`,
      respaldo: o.numero_ot ? `OT ${o.numero_ot}${o.taller ? ` · ${o.taller}` : " · personal propio"}` : "OT sin número",
    })
  }

  // 2) Recapados: goma que vuelve a rodar en vez de comprar cubierta nueva.
  const { data: rec } = await supabase
    .from("mantenimiento_recapados")
    .select("numero_remito, proveedor, fecha_retorno, items:mantenimiento_recapado_items(resultado)")
    .not("fecha_retorno", "is", null)
    .gte("fecha_retorno", desde)
  for (const r of (rec || []) as Array<{
    numero_remito: string | null
    proveedor: string
    fecha_retorno: string
    items: { resultado: string }[]
  }>) {
    const n = (r.items || []).filter((i) => i.resultado === "recapada").length
    if (n === 0) continue
    acciones.push({
      fecha: r.fecha_retorno,
      que: "Recapado en lugar de compra de goma nueva",
      detalle: `${n} ${n === 1 ? "cubierta recuperada" : "cubiertas recuperadas"} — ${r.proveedor}`,
      respaldo: r.numero_remito ? `Remito ${r.numero_remito}` : "Remito de recapado",
    })
  }

  // 3) Disposición final con certificado de la goma que ya no se puede recuperar.
  const { data: res } = await supabase
    .from("mantenimiento_residuos")
    .select("fecha, material, descripcion, cantidad, unidad, proveedor, certificado_url")
    .gte("fecha", desde)
  for (const x of (res || []) as Array<{
    fecha: string
    material: string
    descripcion: string | null
    cantidad: number | null
    unidad: string | null
    proveedor: string | null
    certificado_url: string | null
  }>) {
    acciones.push({
      fecha: x.fecha,
      que: "Disposición final con operador habilitado",
      detalle: `${x.cantidad ?? "?"} ${x.unidad ?? "un"} de ${x.material}${x.descripcion ? ` (${x.descripcion})` : ""} — ${x.proveedor ?? "s/proveedor"}`,
      respaldo: x.certificado_url ? "Certificado de disposición final" : "SIN certificado cargado",
    })
  }

  return acciones.sort((a, b) => b.fecha.localeCompare(a.fecha))
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
    acciones: await cargarAcciones(supabase, `${anioActual}-01-01`),
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

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const cartelera = req.nextUrl.searchParams.get("formato") === "cartelera"

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
    buf = await render(datos, cartelera)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    )
  }

  const anio = new Date().toISOString().slice(0, 4)
  const nombre = cartelera
    ? `cartelera-sostenibilidad-flota-${anio}.pdf`
    : `dpo-flota-4-3-sustentabilidad-${anio}.pdf`
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

async function render(d: Datos, cartelera: boolean): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: cartelera ? 48 : 36,
      bufferPages: true,
      info: {
        Title: cartelera
          ? "Objetivos de sostenibilidad de flota"
          : "DPO Flota 4.3 · Objetivos de sostenibilidad",
        Author: "Mercosur · dpo-app",
        Subject: cartelera
          ? "Cartelera de sostenibilidad para el personal de flota (R4.3.1)"
          : "Evidencia del punto 4.3 del pilar Flota (R4.3.2 y R4.3.3)",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      if (cartelera) {
        buildCartelera(doc, d)
      } else {
        build(doc, d)
        drawFooters(doc)
      }
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Una hoja para el pizarrón. Sin tablas y con dos números grandes: el que pasa
 * caminando tiene que entender qué se mide, cómo vamos y qué puede hacer él.
 * La hoja del auditor no sirve para esto —tres páginas en cuerpo 8 no las lee
 * nadie de pie— y al revés tampoco.
 */
function buildCartelera(doc: Doc, d: Datos) {
  const margin = doc.page.margins.left
  const usable = doc.page.width - margin * 2
  const mesActual = new Date().toISOString().slice(0, 7)
  const anio = mesActual.slice(0, 4)

  const tCo2 = tendencia3Meses(
    d.porMes.map((m) => ({ mes: m.mes, valor: m.co2Por100Km })),
    mesActual,
    true
  )
  const mesCerrado = [...d.porMes].reverse().find((m) => m.mes < mesActual) ?? null

  doc.save()
  doc.rect(0, 0, doc.page.width, 104).fill("#065f46")
  doc.restore()
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(28)
    .text("Cuidamos lo que usamos", margin, 28, { width: usable })
  doc
    .fillColor("#a7f3d0")
    .font("Helvetica")
    .fontSize(12.5)
    .text("Objetivos de sostenibilidad de la flota · qué medimos y cómo vamos", margin, 66, {
      width: usable,
    })

  doc.x = margin
  doc.y = 124
  doc
    .fillColor(COLOR_TEXT)
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      "AB InBev se propuso bajar sus emisiones y sus residuos. Nuestra parte, en flota, se mide con " +
        "dos números, y los dos dependen de cómo manejamos y de cómo cuidamos las unidades.",
      { width: usable }
    )
  doc.moveDown(1)

  const tarjeta = (
    titulo: string,
    valor: string,
    unidad: string,
    meta: string,
    pie: string,
    ok: boolean
  ) => {
    const y = doc.y
    const h = 112
    doc.save()
    doc.lineWidth(1).roundedRect(margin, y, usable, h, 8).fillAndStroke("#f0fdf4", "#86efac")
    doc.restore()
    doc
      .fillColor("#065f46")
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(titulo, margin + 18, y + 13, { width: usable - 36 })
    doc
      .fillColor(ok ? "#047857" : "#b45309")
      .font("Helvetica-Bold")
      .fontSize(40)
      .text(valor, margin + 18, y + 36, { width: usable * 0.42, lineBreak: false })
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(10)
      .text(unidad, margin + 18, y + 84, { width: usable * 0.42, lineBreak: false })
    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(meta, margin + usable * 0.46, y + 38, { width: usable * 0.54 - 18 })
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text(pie, margin + usable * 0.46, y + 57, { width: usable * 0.54 - 18 })
    doc.x = margin
    doc.y = y + h + 12
  }

  tarjeta(
    "1 · Cuánto CO2 emitimos por kilómetro",
    num(mesCerrado?.co2Por100Km ?? d.anio.co2Por100Km, 1),
    "kg de CO2 cada 100 km",
    `Meta: ${META_CO2_100KM} kg`,
    `En ${anio} llevamos ${num(d.anio.co2Kg / 1000, 1)} toneladas de CO2. ` +
      (tCo2.estado === "mejora"
        ? "Veníamos mejorando: hay que sostenerlo."
        : "Veníamos para arriba: hay que bajarlo.") +
      " Sale del gasoil que carga cada unidad.",
    tCo2.estado === "mejora"
  )

  tarjeta(
    "2 · Cuánta goma recuperamos en vez de tirarla",
    d.recupAnio.pct != null ? `${num(d.recupAnio.pct, 0)}%` : "—",
    `${d.recupAnio.recapadas} cubiertas recapadas en ${anio}`,
    `Meta: ${META_RECUPERACION}%`,
    `De cada 10 cubiertas que salen de servicio, ${
      d.recupAnio.pct != null ? Math.round(d.recupAnio.pct / 10) : "—"
    } vuelven a rodar recapadas. Las que no se pueden recuperar se retiran con certificado.`,
    d.recupAnio.pct != null && d.recupAnio.pct >= META_RECUPERACION
  )

  doc.moveDown(0.3)
  doc
    .fillColor("#065f46")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Qué podés hacer vos", { width: usable })
  doc.moveDown(0.3)
  const tips = [
    "Avisá cualquier pérdida de aceite o gasoil en el checklist. Una mancha en el piso es combustible tirado y suelo contaminado.",
    "Controlá la presión de los neumáticos: inflados de menos gastan más gasoil y arruinan la cubierta antes de tiempo.",
    "Evitá el ralentí innecesario y las aceleradas bruscas: ahí se va el gasoil que después aparece en este número.",
    "No tires aceite, filtros ni cubiertas con los residuos comunes. Todo eso se retira con certificado.",
  ]
  for (const t of tips) {
    const y = doc.y
    doc.save()
    doc.circle(margin + 4, y + 5, 2.5).fill("#047857")
    doc.restore()
    doc
      .fillColor(COLOR_TEXT)
      .font("Helvetica")
      .fontSize(10.5)
      .text(t, margin + 16, y, { width: usable - 16 })
    doc.x = margin
    doc.moveDown(0.4)
  }

  const bottom = doc.page.margins.bottom
  doc.page.margins.bottom = 0
  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      `Datos al ${new Date().toLocaleDateString("es-AR")} · DPO Flota, punto 4.3 "Sustainability Goals". ` +
        `CO2 = litros de gasoil × ${num(KG_CO2_POR_LITRO_DIESEL, 2)} kg CO2/L (factor de combustión de ` +
        "diésel, DEFRA/IPCC). Se actualiza desde el módulo de Mantenimiento de flota.",
      margin,
      doc.page.height - 44,
      { width: usable }
    )
  doc.page.margins.bottom = bottom
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
        "por el checklist diario, con la orden de trabajo como cierre. El detalle de lo ejecutado, " +
        "con su respaldo documental, está en el cuadro siguiente.",
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

  // Las acciones NO se declaran, se listan desde el sistema: el requisito pide
  // acciones "ejecutadas", así que lo que vale es lo que tiene registro.
  doc.moveDown(0.3)
  drawSectionTitle(doc, `Acciones ejecutadas y registradas en ${anio} (R4.3.3)`)
  drawTable(
    doc,
    d.acciones,
    [
      { header: "Fecha", width: 48, get: (a) => a.fecha.slice(0, 10).split("-").reverse().join("/") },
      { header: "Acción", width: 110, get: (a) => a.que },
      { header: "Detalle", width: 160, get: (a) => a.detalle },
      { header: "Respaldo", width: 95, get: (a) => a.respaldo },
    ],
    "Sin acciones registradas en el año"
  )
  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      "Cada fila es un registro del sistema —orden de trabajo, remito de recapado o retiro de " +
        "residuos— y se puede abrir en el módulo de Mantenimiento de flota con el número indicado.",
      { width: doc.page.width - doc.page.margins.left * 2 }
    )
}
