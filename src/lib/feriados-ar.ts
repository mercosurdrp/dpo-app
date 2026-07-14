/**
 * Feriados nacionales de Argentina. En feriado el depósito no opera: la jornada
 * teórica del WNP es 0 y esos días no se rellenan (si no, un feriado con una
 * venta residual —15/06/26: 2 HL— sale con 72 hs imputadas y un WNP de 0,03).
 * Quien igual haya trabajado y fichado cuenta con sus horas reales.
 *
 * Espejo de ARGENTINA_HOLIDAYS (DepositoDashboard/api/index.py), que ya lo usa
 * para el indicador #38. Mantener ambas listas en sincronía.
 */
const FERIADOS_AR: Record<number, ReadonlySet<string>> = {
  2025: new Set([
    "2025-01-01", "2025-03-03", "2025-03-04", "2025-03-24", "2025-04-02",
    "2025-04-18", "2025-05-01", "2025-05-25", "2025-06-16", "2025-06-20",
    "2025-07-09", "2025-08-17", "2025-10-12", "2025-11-24", "2025-12-08",
    "2025-12-25",
  ]),
  2026: new Set([
    "2026-01-01", // Año Nuevo
    "2026-02-16", // Carnaval
    "2026-02-17", // Carnaval
    "2026-03-24", // Día de la Memoria
    "2026-04-02", // Veterano de Malvinas (coincide con Jueves Santo)
    "2026-04-03", // Viernes Santo
    "2026-05-01", // Día del Trabajador
    "2026-05-25", // Revolución de Mayo
    "2026-06-15", // Güemes (lunes)
    "2026-06-20", // Bandera
    "2026-07-09", // Independencia
    "2026-08-17", // San Martín
    "2026-10-12", // Diversidad
    "2026-11-23", // Soberanía
    "2026-12-08", // Inmaculada Concepción
    "2026-12-25", // Navidad
  ]),
  2027: new Set([
    "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-24", "2027-04-02",
    "2027-05-01", "2027-05-25", "2027-06-21", "2027-07-09", "2027-08-16",
    "2027-10-11", "2027-11-22", "2027-12-08", "2027-12-25",
  ]),
}

/** true si la fecha (YYYY-MM-DD) es feriado nacional. */
export function esFeriado(fecha: string): boolean {
  const anio = Number(fecha.slice(0, 4))
  return FERIADOS_AR[anio]?.has(fecha) ?? false
}
