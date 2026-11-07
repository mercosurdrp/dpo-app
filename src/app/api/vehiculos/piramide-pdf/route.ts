// PDF «Pirámide de mantenimiento y resultados» (DPO Flota 4.2 · R4.2.1–R4.2.3)
// para la carpeta de evidencia: pirámide del año con su balance, KPIs,
// evolución mes a mes, análisis aperturado por sistema, unidad y taller,
// planes con herramienta, lecturas mensuales y rechazos por rotura a revisar.
// Mismos datos que la solapa (`getPiramideFlota`).
//
// 🚨 Helvetica de pdfkit sólo trae WinAnsi: tildes y ñ sí, pero nada de ≥ ≤ → ÷.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getPiramideFlota } from "@/actions/piramide-flota"
import { calcularBalance, type FilaApertura, type FilaTaller, type MesPiramide, type NivelPiramide } from "@/lib/flota/piramide-flota"
import { labelFocoKpi, slaDeTaller } from "@/lib/flota/piramide-planes"
import {
  COLOR,
  MARGEN,
  anchoUtil,
  asegurarEspacio,
  drawFirmas,
  drawKpis,
  drawParrafo,
  drawSeccion,
  drawTabla,
  espacio,
  fmtFecha,
  fmtFechaHora,
  fmtInt,
  hoyISO,
  renderPdf,
  type Doc,
} from "../plan-pdf/_comun"

const fmtMoney = (v: number) => `$ ${fmtInt(Math.round(v))}`
const fmt1 = (v: number | null) => (v == null ? "-" : v.toLocaleString("es-AR", { maximumFractionDigits: 1 }))
const fmtPct = (v: number | null) => (v == null ? "-" : `${Math.round(v)} %`)
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const labelYm = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`

const NIVEL_PDF: Array<{ key: NivelPiramide; titulo: string; detalle: string; color: string }> = [
  { key: "rotura", titulo: "Roturas", detalle: "Auxilio en ruta, unidad parada 1 día o más, o rechazo por rotura con OT", color: "#b91c1c" },
  { key: "correctivo", titulo: "Correctivo", detalle: "Reparación no planificada sin dejar la unidad parada", color: "#ea580c" },
  { key: "deteccion", titulo: "Detección checklist / CIL", detalle: "Focos de checklist y hallazgos de aceite del CIL", color: "#ca8a04" },
  { key: "preventivo", titulo: "Preventivo", detalle: "OT preventivas y proactivas realizadas", color: "#047857" },
]

const NOMBRE: Record<NivelPiramide, string> = {
  rotura: "roturas",
  correctivo: "correctivo",
  deteccion: "detección",
  preventivo: "preventivo",
}

const HERR: Record<string, string> = { cinco_porques: "5 Porqués", causa_efecto: "Causa-Efecto", pdca: "PDCA" }

function drawPiramide(doc: Doc, conteo: Record<NivelPiramide, number>, costos: Record<NivelPiramide, number | null>) {
  const usable = anchoUtil(doc)
  const alto = 26
  const gap = 4
  const colLabel = 150
  const colDer = 110
  const anchoBarra = usable - colLabel - colDer
  asegurarEspacio(doc, NIVEL_PDF.length * (alto + gap) + 10)
  const max = Math.max(1, ...NIVEL_PDF.map((n) => conteo[n.key]))
  let y = doc.y
  NIVEL_PDF.forEach((n, i) => {
    const v = conteo[n.key]
    const w = Math.max(24, (v / max) * anchoBarra)
    const x = MARGEN + colLabel + (anchoBarra - w) / 2
    doc.save()
    doc.rect(x, y, w, alto).fill(n.color)
    doc.restore()
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11).text(fmtInt(v), x, y + 8, { width: w, align: "center" })
    doc.fillColor(n.color).font("Helvetica-Bold").fontSize(9).text(n.titulo, MARGEN, y + 3, { width: colLabel - 6 })
    doc.fillColor(COLOR.gris).font("Helvetica").fontSize(6.5).text(n.detalle, MARGEN, y + 14, { width: colLabel - 6 })
    const abajo = NIVEL_PDF[i + 1]
    const ratio = abajo && v > 0 && conteo[abajo.key] > 0 ? `1 cada ${fmt1(conteo[abajo.key] / v)}` : ""
    const costo = costos[n.key]
    doc
      .fillColor(COLOR.texto)
      .font("Helvetica")
      .fontSize(8)
      .text([costo != null ? fmtMoney(costo) : "", ratio].filter(Boolean).join("  ·  "), MARGEN + colLabel + anchoBarra + 6, y + 9, {
        width: colDer - 6,
        align: "right",
      })
    y += alto + gap
  })
  doc.y = y + 4
  doc.x = MARGEN
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (IS_MISIONES) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const anioQ = Number(req.nextUrl.searchParams.get("anio"))
  const r = await getPiramideFlota(Number.isFinite(anioQ) && anioQ > 2000 ? anioQ : undefined)
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 })
  const { piramide: p, planes, revisiones, slas, anio, cumplimientoPlan } = r.data
  const ahora = new Date()
  const balance = calcularBalance(p.niveles)
  const k = p.kpis

  const colsApertura = (titulo: string) => [
    { header: titulo, width: 112, bold: true, get: (f: FilaApertura) => f.label },
    { header: "Prev.", width: 36, align: "right" as const, get: (f: FilaApertura) => String(f.preventivo) },
    { header: "Detecc.", width: 42, align: "right" as const, get: (f: FilaApertura) => String(f.deteccion) },
    { header: "Correct.", width: 52, align: "right" as const, get: (f: FilaApertura) => String(f.correctivo) },
    {
      header: "Roturas",
      width: 48,
      align: "right" as const,
      get: (f: FilaApertura) => String(f.rotura),
      color: (f: FilaApertura) => (f.rotura > 0 ? COLOR.vencido : null),
    },
    { header: "Días par.", width: 48, align: "right" as const, get: (f: FilaApertura) => String(f.diasParado) },
    { header: "$ fallas", width: 74, align: "right" as const, get: (f: FilaApertura) => fmtMoney(f.costoCorrectivo + f.costoRotura) },
    { header: "% fallas", width: 50, align: "right" as const, get: (f: FilaApertura) => `${Math.round(f.pctFallas)} %` },
    { header: "% acum.", width: 50, align: "right" as const, get: (f: FilaApertura) => `${Math.round(f.pctAcumFallas)} %` },
  ]

  const pdf = await renderPdf(
    {
      titulo: "Pirámide de mantenimiento y resultados",
      subtitulo: `Flota del ${fmtFecha(p.desde)} al ${fmtFecha(p.hasta)}: pirámide (roturas, correctivo, detección, preventivo), evolución mensual, análisis aperturado por sistema, unidad y taller, planes y lecturas mensuales.`,
      derechaTop: "Pilar Flota · Punto 4.2",
      derechaSub: `Situación al ${fmtFechaHora(ahora)}`,
      pie: "Mercosur · DPO · Pirámide de mantenimiento · Evidencia pilar Flota 4.2 (R4.2.1 a R4.2.3)",
      info: { Title: "Pirámide de mantenimiento y resultados", Subject: "DPO Flota 4.2" },
    },
    (doc: Doc) => {
      drawSeccion(doc, `Pirámide de flota ${anio}`, "Cada evento cuenta una sola vez, en su nivel más alto. El ancho de la barra es proporcional a la cantidad.")
      drawPiramide(
        doc,
        { rotura: p.niveles.rotura, correctivo: p.niveles.correctivo, deteccion: p.niveles.deteccion, preventivo: p.niveles.preventivo },
        { rotura: p.niveles.costoRotura, correctivo: p.niveles.costoCorrectivo, deteccion: null, preventivo: p.niveles.costoPreventivo }
      )
      drawParrafo(
        doc,
        balance.balanceada
          ? "Pirámide BALANCEADA: cada escalón es más angosto que el de abajo."
          : `Pirámide DESBALANCEADA: ${balance.inversiones
              .map((i) => `hay más ${NOMBRE[i.arriba]} (${i.nArriba}) que ${NOMBRE[i.abajo]} (${i.nAbajo})`)
              .join("; ")}.`,
        { bold: true, color: balance.balanceada ? COLOR.ok : COLOR.vencido }
      )
      drawParrafo(
        doc,
        `Roturas: ${p.detalleRotura.parada} por parada de 1 día o más, ${p.detalleRotura.auxilio} auxilios en ruta, ${p.detalleRotura.rechazo} validadas por rechazo. Detección: ${p.detalleDeteccion.checklist} focos de checklist (${p.detalleDeteccion.criticos} críticos) y ${p.detalleDeteccion.cil} hallazgos del CIL. El checklist digital arrancó en abril y el control de aceite del CIL en agosto de 2026: antes de abril el balance compara el preventivo directo con el correctivo.`,
        { size: 8, color: COLOR.gris }
      )
      espacio(doc, 4)

      drawKpis(doc, [
        { label: "% preventivo (OT)", valor: fmtPct(k.pctPreventivoCant), sub: "meta 70 %", color: (k.pctPreventivoCant ?? 0) >= 70 ? COLOR.ok : COLOR.proximo },
        { label: "% preventivo ($)", valor: fmtPct(k.pctPreventivoCosto), sub: "sobre el costo" },
        { label: "MTBF", valor: k.mtbfDias == null ? "-" : `${Math.round(k.mtbfDias)} d`, sub: `días-unidad · ${p.unidades} unid.` },
        {
          label: "MTTR",
          valor: k.mttrMedianaHoras == null ? "-" : `${Math.round(k.mttrMedianaHoras)} h`,
          sub: `mediana · ${k.mttrN} OT`,
        },
        { label: "Roturas / mes", valor: fmt1(k.roturasPorMes), sub: "meta 1 por mes", color: k.roturasPorMes <= 1 ? COLOR.ok : COLOR.vencido },
        { label: "Fallas con aviso", valor: fmtPct(k.pctConAviso), sub: "aviso en 15 días" },
      ])
      espacio(doc, 6)

      drawSeccion(doc, "Evolución mes a mes", "Seguimiento de la pirámide en el tiempo (R4.2.3). Plan MP = cumplimiento del plan preventivo (foto mensual, desde julio).")
      drawTabla(doc, p.porMes, [
        { header: "Mes", width: 50, bold: true, get: (m: MesPiramide) => labelYm(m.ym) },
        { header: "Prev.", width: 40, align: "right" as const, get: (m: MesPiramide) => String(m.preventivo) },
        { header: "Detecc.", width: 44, align: "right" as const, get: (m: MesPiramide) => String(m.deteccion) },
        { header: "Correct.", width: 46, align: "right" as const, get: (m: MesPiramide) => String(m.correctivo) },
        { header: "Roturas", width: 44, align: "right" as const, get: (m: MesPiramide) => String(m.rotura), color: (m: MesPiramide) => (m.rotura > 1 ? COLOR.vencido : null) },
        {
          header: "% planif.",
          width: 50,
          align: "right" as const,
          get: (m: MesPiramide) => fmtPct(m.pctPreventivoCant),
          color: (m: MesPiramide) => (m.pctPreventivoCant != null && m.pctPreventivoCant < 70 ? COLOR.proximo : null),
        },
        { header: "Balance", width: 54, get: (m: MesPiramide) => (calcularBalance(m).balanceada ? "ok" : "invertida") },
        { header: "$ prev.", width: 70, align: "right" as const, get: (m: MesPiramide) => fmtMoney(m.costoPreventivo) },
        { header: "$ fallas", width: 70, align: "right" as const, get: (m: MesPiramide) => fmtMoney(m.costoCorrectivo + m.costoRotura) },
        {
          header: "Plan MP",
          width: 44,
          align: "right" as const,
          get: (m: MesPiramide) => {
            const v = cumplimientoPlan.find((c) => c.ym === m.ym)?.valor
            return v == null ? "-" : `${Math.round(v)} %`
          },
        },
      ])
      espacio(doc, 6)

      drawSeccion(doc, "Análisis aperturado por sistema", "Pareto de fallas (correctivo + rotura) y su costo, contra el preventivo y la detección del mismo sistema (R4.2.2).")
      drawTabla(doc, p.porSistema, colsApertura("Sistema"))
      espacio(doc, 4)
      drawSeccion(doc, "Análisis aperturado por unidad", "Qué unidad concentra las fallas.")
      drawTabla(doc, p.porUnidad, colsApertura("Unidad"))
      espacio(doc, 4)
      drawSeccion(doc, "Talleres y ANS", "Días parado y horas de taller por reparación (entre paréntesis, cuántas OT tienen entrada y salida cargadas), y retrabajo: misma unidad y sistema de vuelta en 90 días o menos.")
      drawTabla(
        doc,
        p.talleres.filter((t) => t.correctivas > 0),
        [
          { header: "Taller", width: 140, bold: true, get: (t: FilaTaller) => t.taller },
          {
            header: "ANS",
            width: 52,
            get: (t: FilaTaller) => (t.interna ? "interno" : (slaDeTaller(slas, t.taller)?.estado ?? "sin ANS")),
          },
          { header: "OT", width: 30, align: "right" as const, get: (t: FilaTaller) => String(t.ots) },
          { header: "Correct.", width: 44, align: "right" as const, get: (t: FilaTaller) => String(t.correctivas) },
          { header: "Roturas", width: 42, align: "right" as const, get: (t: FilaTaller) => String(t.roturas) },
          { header: "Días par.", width: 50, align: "right" as const, get: (t: FilaTaller) => fmt1(t.diasParadoProm) },
          {
            header: "Hs taller",
            width: 56,
            align: "right" as const,
            get: (t: FilaTaller) => (t.horasTallerProm == null ? "-" : `${Math.round(t.horasTallerProm)} (${t.conHoras})`),
          },
          {
            header: "Retrabajo",
            width: 52,
            align: "right" as const,
            get: (t: FilaTaller) => `${t.retrabajos}${t.pctRetrabajo == null ? "" : ` (${Math.round(t.pctRetrabajo)}%)`}`,
          },
        ]
      )
      espacio(doc, 6)

      drawSeccion(doc, "Planes sobre la pirámide", "Foco atacado, problema, herramienta de gestión aplicada, avance y resultado (R4.2.2 / R4.2.3).")
      if (planes.length === 0) drawParrafo(doc, "Sin planes abiertos todavía.", { color: COLOR.gris })
      else
        drawTabla(doc, planes, [
          { header: "Foco", width: 110, bold: true, get: (pl) => labelFocoKpi(pl.kpi).replace("Pirámide · ", "") },
          { header: "Problema / causa", width: 175, get: (pl) => pl.causaRaiz },
          { header: "Herramienta", width: 62, get: (pl) => pl.herramientas.map((h) => HERR[h] ?? h).join(" + ") || "pendiente" },
          {
            header: "Acciones",
            width: 50,
            align: "right" as const,
            get: (pl) => `${pl.items.filter((i) => i.estado === "completado").length}/${pl.items.length}`,
          },
          { header: "Estado / resultado", width: 118, get: (pl) => (pl.estado === "cerrado" ? `Cerrado: ${pl.resultadoCierre ?? ""}` : pl.estado.replace("_", " ")) },
        ])
      espacio(doc, 6)

      drawSeccion(doc, "Lecturas mensuales", "Lectura de la pirámide al cierre de cada mes y la decisión tomada (SOP 4.2, 7.1).")
      if (revisiones.length === 0) drawParrafo(doc, "Sin lecturas registradas todavía.", { color: COLOR.gris })
      for (const rv of revisiones) {
        drawParrafo(doc, `${MESES_LARGO[rv.mes - 1]} ${rv.anio} · ${rv.revisadoPor ?? "-"} · ${fmtFecha(rv.revisadoAt)}`, { bold: true })
        drawParrafo(doc, rv.lectura)
        if (rv.decision) drawParrafo(doc, `Decisión: ${rv.decision}`, { color: COLOR.gris })
        espacio(doc, 2)
      }
      espacio(doc, 4)

      drawParrafo(
        doc,
        "Fuente: Órdenes de Trabajo de la app (sistema de gestión de flota, R4.2.1), sin canceladas; focos de checklist (un problema reportado varios días cuenta una vez); control de aceite del CIL; rechazos de Chess. Rotura = OT correctiva con auxilio en ruta o con la unidad fuera de servicio 1 día o más, o con rechazo por rotura de la unidad 3 días antes o después. Costo = el mayor entre la cabecera y el desglose de la OT. MTBF = unidades activas por días del período sobre fallas. MTTR = mediana de horas entre entrada y salida de taller.",
        { size: 7.5, color: COLOR.gris }
      )
      drawFirmas(doc, ["Firma Gestor de Flota", "Firma Jefe de Distribución"])
    }
  )

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Mercosur-Piramide-Mantenimiento-${anio}-${hoyISO()}.pdf"`,
    },
  })
}
