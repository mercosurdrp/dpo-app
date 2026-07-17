/**
 * Demanda de CLASIFICACIÓN de envases para el dimensionamiento (DPO Planeamiento 3.1).
 *
 * La demanda NO es auto-reportada: sale del presupuesto de retiros de cerveza
 * retornable de la planta de Quilmes. Cada camión (equipo ZARATE) = 156 HL = 26
 * paletas (6 HL/paleta). El presupuesto anual en HL se reparte uniforme entre los
 * días hábiles del mes → HL a clasificar/día.
 *
 * FUENTE: replicado de `acarreo-rdf/src/lib/retornable.ts` (Excel
 * `PRESUPUESTO ACARREO - RDF.xlsx`, hoja `ACARREO PXQ (2)`, fila
 * "CERVEZAS CMQ LITRO" retornable). Es un presupuesto ANUAL: si cambia el Excel,
 * actualizar acá y allá. Se replica en vez de exponer un endpoint porque el dato
 * está hardcodeado en acarreo-rdf (no vive en su base) y cambia una vez al año.
 */

/** HL por paleta de cerveza retornable: 156 HL/camión ÷ 26 paletas/camión. */
export const HL_POR_PALETA_RETORNABLE = 156 / 26 // = 6

/** HL de cerveza retornable presupuestados por mes (índice 0 = enero). 2026. */
const HL_RETORNABLE_2026: number[] = [
  5613.7, // ene
  4744.8, // feb
  3462.1, // mar
  3219.0, // abr
  4301.7, // may
  2697.7, // jun
  3511.3, // jul
  3575.0, // ago
  3637.5, // sep
  4311.3, // oct
  4809.6, // nov
  5921.4, // dic
]

/** HL de cerveza retornable presupuestados del mes/año. 0 si no hay datos. */
export function getHlRetornable(mes: number, anio: number): number {
  if (anio === 2026 && mes >= 1 && mes <= 12) return HL_RETORNABLE_2026[mes - 1]
  return 0
}

// ─── Días hábiles (para prorratear el presupuesto mensual al día) ──────────────
// Hábil = lunes a sábado, excluyendo feriados nacionales. Coincide con la columna
// "DÍAS LABORALES" del Excel de acarreo-rdf.
const FERIADOS_2026 = new Set<string>([
  "2026-01-01", "2026-01-05", "2026-02-16", "2026-02-17", "2026-03-24",
  "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-25", "2026-06-16",
  "2026-06-20", "2026-07-09", "2026-08-17", "2026-10-12", "2026-11-20",
  "2026-12-08", "2026-12-25",
])

function iso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

/** Días hábiles (lun-sáb, sin feriados) del mes. */
export function diasHabilesDelMes(anio: number, mes: number): number {
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  let n = 0
  for (let d = 1; d <= ultimoDia; d++) {
    const dow = new Date(Date.UTC(anio, mes - 1, d)).getUTCDay() // 0 = domingo
    if (dow === 0) continue
    if (FERIADOS_2026.has(iso(anio, mes, d))) continue
    n++
  }
  return n
}

/** HL de cerveza retornable a clasificar por día hábil del mes. 0 si sin datos. */
export function hlRetornablePorDia(mes: number, anio: number): number {
  const hl = getHlRetornable(mes, anio)
  const dias = diasHabilesDelMes(anio, mes)
  return hl > 0 && dias > 0 ? hl / dias : 0
}
