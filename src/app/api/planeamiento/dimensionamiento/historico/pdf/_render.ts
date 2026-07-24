/**
 * Render del PDF "Cómo fue enero–junio" del dimensionamiento, por sector.
 * Solo dibujo: recibe el payload ya calculado en `_data.ts`.
 */
import PDFDocument from "pdfkit"
import {
  COLOR_ACCENT,
  COLOR_MUTED,
  COLOR_OK,
  COLOR_TEXT,
  drawFooters,
  drawHeader,
  drawKPIs,
  drawSectionTitle,
  drawTable,
  ensureSpace,
  formatInt,
  type Col,
  type Doc,
  type KPICard,
} from "@/app/api/rechazos/_pdf-helpers"
import type { FilaAlmacenHist, FilaFlotaHist, HistoricoPayload } from "./_data"

const MES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

const fmtH = (x: number): string => {
  const r = Math.round(x * 10) / 10
  return (r % 1 === 0 ? formatInt(r) : r.toFixed(1).replace(".", ",")) + " h"
}
const fmtDelta = (dim: number, ppto: number): string => {
  if (ppto <= 0) return "—"
  const d = Math.round((dim - ppto) * 10) / 10
  const s = (d > 0 ? "+" : "") + (d % 1 === 0 ? formatInt(d) : d.toFixed(1).replace(".", ","))
  return s + " h"
}

export async function renderHistoricoPdf(p: HistoricoPayload): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Dimensionamiento ene-jun ${p.anio} — ${p.sector === "flota" ? "Flota/Entrega" : "Almacén"}`,
        Author: "Mercosur Distribuciones",
        Subject: "Histórico enero–junio del dimensionamiento (volumen presupuestado)",
      },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      if (p.sector === "flota") buildFlota(doc, p)
      else buildAlmacen(doc, p)
      drawFooters(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function nota(doc: Doc, texto: string) {
  ensureSpace(doc, 16)
  doc
    .fillColor(COLOR_MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text(texto, doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left * 2,
    })
  doc.y += 4
}

// ─── FLOTA / ENTREGA ───
function buildFlota(doc: Doc, p: HistoricoPayload) {
  const rows = p.filasFlota
  drawHeader(doc, "Dimensionamiento · Flota / Entrega", `Enero–Junio ${p.anio}`, "Cómo fue vs. presupuesto")

  const sumDim = rows.reduce((s, r) => s + r.hhExtraDim, 0)
  const sumPpto = rows.reduce((s, r) => s + r.hhExtraPpto, 0)
  const exceso = rows.filter((r) => r.hhExtraPpto > 0 && r.hhExtraDim > r.hhExtraPpto).length
  const seg = rows.filter((r) => r.segundaVuelta).length
  const kpis: KPICard[] = [
    { label: "HHEE dim. entrega (H1)", value: fmtH(sumDim), sub: "según el volumen presupuestado" },
    { label: "HHEE ppto. entrega (H1)", value: fmtH(sumPpto), sub: "EERR · Q Horas Extras" },
    { label: "Meses c/ exceso vs ppto", value: `${exceso} / 6`, sub: "dimensionadas > presupuestadas", color: exceso > 0 ? COLOR_ACCENT : COLOR_OK },
    { label: "Meses c/ 2ª vuelta", value: `${seg} / 6`, sub: "el pico supera la flota disponible", color: seg > 0 ? COLOR_ACCENT : COLOR_OK },
  ]
  drawKPIs(doc, kpis)

  drawSectionTitle(doc, "Estructura de reparto necesaria vs. disponible, por mes (día pico)")
  const cols: Col<FilaFlotaHist>[] = [
    { header: "Mes", width: 60, get: (r) => MES[r.mes] },
    { header: "HL ppto", width: 52, align: "right", get: (r) => formatInt(r.hlPresupuesto) },
    { header: "CEq/día", width: 48, align: "right", get: (r) => formatInt(r.ceqDiaProm) },
    { header: "Camiones n/d", width: 66, align: "center", get: (r) => `${r.camionesNecPico} / ${p.camionesDisp}` },
    { header: "Choferes n/d", width: 62, align: "center", get: (r) => `${r.choferesNecPico} / ${p.choferesDisp}` },
    { header: "Ayudantes n/d", width: 66, align: "center", get: (r) => `${r.ayudantesNecPico} / ${p.ayudantesDisp}` },
    { header: "Días refuerzo", width: 52, align: "right", get: (r) => String(r.diasRefuerzo) },
    { header: "2ª vuelta", width: 44, align: "center", get: (r) => (r.segundaVuelta ? "Sí" : "—") },
    { header: "HHEE dim", width: 52, align: "right", get: (r) => fmtH(r.hhExtraDim) },
    { header: "HHEE ppto", width: 52, align: "right", get: (r) => (r.hhExtraPpto > 0 ? fmtH(r.hhExtraPpto) : "—") },
    { header: "Dif. vs ppto", width: 54, align: "right", get: (r) => fmtDelta(r.hhExtraDim, r.hhExtraPpto) },
  ]
  drawTable(doc, rows, cols)

  nota(doc, `n/d = necesario en el día pico / disponible. Volumen PRESUPUESTADO de cada mes (presupuesto anual ${p.anio}), escalado sobre la estructura actual: flota ${p.camionesDisp} camiones disponibles (${formatInt(p.capCamionViaje)} CEq/día por camión), ${p.choferesDisp} choferes y ${p.ayudantesDisp} ayudantes. "Necesario" es el del día más cargado del mes según los pesos por día de semana. HHEE de entrega = personas faltantes en los días de refuerzo × horas por vuelta extra. HHEE presupuestadas: EERR (fila «Q Horas Extras», bloque Entrega).`)
  for (const a of p.advertencias) nota(doc, `Nota: ${a}`)
}

// ─── ALMACÉN ───
function buildAlmacen(doc: Doc, p: HistoricoPayload) {
  const rows = p.filasAlmacen
  drawHeader(doc, "Dimensionamiento · Almacén", `Enero–Junio ${p.anio}`, "Cómo fue vs. presupuesto")

  const sumDim = rows.reduce((s, r) => s + r.hhExtraDim, 0)
  const sumPpto = rows.reduce((s, r) => s + r.hhExtraPpto, 0)
  const exceso = rows.filter((r) => r.hhExtraPpto > 0 && r.hhExtraDim > r.hhExtraPpto).length
  const pico = rows.reduce((best, r) => (r.hhExtraDim > best.hhExtraDim ? r : best), rows[0])
  const kpis: KPICard[] = [
    { label: "HHEE dim. almacén (H1)", value: fmtH(sumDim), sub: "según el volumen presupuestado" },
    { label: "HHEE ppto. almacén (H1)", value: fmtH(sumPpto), sub: "EERR · Q Horas Extras" },
    { label: "Meses c/ exceso vs ppto", value: `${exceso} / 6`, sub: "dimensionadas > presupuestadas", color: exceso > 0 ? COLOR_ACCENT : COLOR_OK },
    { label: "Mes pico de HHEE", value: pico ? MES[pico.mes] : "—", sub: pico ? fmtH(pico.hhExtraDim) : "sin datos", color: COLOR_TEXT },
  ]
  drawKPIs(doc, kpis)

  drawSectionTitle(doc, "Horas extra dimensionadas por rol y comparación con el presupuesto, por mes")
  const rol = (r: FilaAlmacenHist, nombre: string) => {
    const d = r.detalle.find((x) => x.rol === nombre)
    return d && d.horasExtra > 0 ? fmtH(d.horasExtra) : "—"
  }
  const cols: Col<FilaAlmacenHist>[] = [
    { header: "Mes", width: 62, get: (r) => MES[r.mes] },
    { header: "HL ppto", width: 54, align: "right", get: (r) => formatInt(r.hlPresupuesto) },
    { header: "Pickeros", width: 56, align: "right", get: (r) => rol(r, "Pickeros") },
    { header: "Clasificadores", width: 66, align: "right", get: (r) => rol(r, "Clasificadores") },
    { header: "Tareas grales.", width: 62, align: "right", get: (r) => rol(r, "Tareas grales.") },
    { header: "Maquinistas", width: 60, align: "right", get: (r) => rol(r, "Maquinistas") },
    { header: "HHEE dim (total)", width: 66, align: "right", get: (r) => fmtH(r.hhExtraDim) },
    { header: "HHEE ppto", width: 56, align: "right", get: (r) => (r.hhExtraPpto > 0 ? fmtH(r.hhExtraPpto) : "—") },
    { header: "Dif. vs ppto", width: 54, align: "right", get: (r) => fmtDelta(r.hhExtraDim, r.hhExtraPpto) },
  ]
  drawTable(doc, rows, cols)

  const dot = p.dotacionAlmacen.map((d) => `${d.rol} ${d.dotacion}`).join(" · ")
  nota(doc, `Volumen PRESUPUESTADO de cada mes (presupuesto anual ${p.anio}), escalado sobre la estructura actual. Dotación: ${dot}. HHEE dimensionadas = hora-hombre por encima de la capacidad de la dotación efectiva en los días fuertes. HHEE presupuestadas: EERR (fila «Q Horas Extras», bloque Almacén).`)
  for (const a of p.advertencias) nota(doc, `Nota: ${a}`)
}
