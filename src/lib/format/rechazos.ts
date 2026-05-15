/**
 * Helpers de formato del dashboard de rechazos.
 *
 * Convenciones:
 *   - Locale `es-AR` (coma decimal, punto miles).
 *   - Estos helpers se usan en server, client, tooltips y export CSV — sin excepción.
 *     No formatees números ad-hoc en otros archivos; importá desde acá.
 */

const NF_INT = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })
const NF_1DEC = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const NF_2DEC = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Tasa porcentual. Espera escala 0–100 (no fracción 0–1).
 *   formatTasa(1.8)   → "1,8 %"
 *   formatTasa(12.5)  → "12,5 %"
 *   formatTasa(0)     → "0,0 %"
 */
export function formatTasa(v: number): string {
  if (!Number.isFinite(v)) return "—"
  return `${NF_1DEC.format(v)} %`
}

/**
 * Cantidad entera de bultos con separador de miles.
 *   formatBultos(449)   → "449"
 *   formatBultos(1245)  → "1.245"
 */
export function formatBultos(v: number): string {
  if (!Number.isFinite(v)) return "—"
  return NF_INT.format(Math.round(v))
}

/**
 * Hectolitros. Métrica de volumen primaria del dashboard de rechazos.
 * Los valores son chicos (un día ≈ 8 HL de rechazos) → 2 decimales hasta
 * 100, 1 decimal por encima. Sufijo " HL".
 *   formatHl(7.95)   → "7,95 HL"
 *   formatHl(273.36) → "273,4 HL"
 *   formatHl(0)      → "0,00 HL"
 */
export function formatHl(v: number): string {
  if (!Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  return `${(abs >= 100 ? NF_1DEC : NF_2DEC).format(v)} HL`
}

/**
 * Monto en pesos. Umbrales pensados para gerencia (lectura rápida):
 *   |v| < 10.000      → "$2.745"
 *   |v| < 1.000.000   → "$245 k"   (k = miles, redondeado)
 *   |v| ≥ 1.000.000   → "$1,23 M"  (M = millones, 2 decimales)
 * Negativos se prefijan con "−".
 */
export function formatMonto(v: number): string {
  if (!Number.isFinite(v)) return "—"
  const sign = v < 0 ? "−" : ""
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${sign}$${NF_2DEC.format(abs / 1_000_000)} M`
  if (abs >= 10_000)    return `${sign}$${NF_INT.format(abs / 1_000)} k`
  return `${sign}$${NF_INT.format(abs)}`
}

/**
 * Delta con flecha direccional. `suffix` define la unidad de la magnitud:
 *   formatDelta(4, "%")     → "▲ 4 %"
 *   formatDelta(-12, "%")   → "▼ 12 %"
 *   formatDelta(0.3, "pp")  → "▲ 0,3 pp"
 *   formatDelta(0, "%")     → "= 0 %"
 *
 * Para pp y otros decimales chicos usá 1 decimal; para % grandes (≥10) entero.
 * Si pasás un valor sin signo, asume positivo.
 */
export function formatDelta(v: number, suffix: "%" | "pp" | "" = ""): string {
  if (!Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "="
  const num = suffix === "pp" || abs < 10 ? NF_1DEC.format(abs) : NF_INT.format(abs)
  const tail = suffix ? ` ${suffix}` : ""
  return `${arrow} ${num}${tail}`
}

/**
 * Fecha en formato DD/MM/YYYY (es-AR).
 *   formatFecha("2026-05-11")          → "11/05/2026"
 *   formatFecha(new Date("2026-05-11")) → "11/05/2026"
 */
export function formatFecha(d: Date | string): string {
  let date: Date
  if (typeof d === "string") {
    // ISO `YYYY-MM-DD` puro: construir local sin shift TZ.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
    date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d)
  } else {
    date = d
  }
  if (Number.isNaN(date.getTime())) return "—"
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}
