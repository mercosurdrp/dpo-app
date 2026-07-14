// Segundas vueltas por mes: el camión vuelve a salir después de descargar.
//
// 🚨 CARGA MANUAL, no hay forma de contarlas desde el sistema: Chess no pone
// patente en los comprobantes de SEGUNDA VUELTA (documento PRVTA), así que esos
// viajes no se pueden imputar a ningún camión. Por eso tampoco entran al TLP.
//
// Los valores los cierra Andy mes a mes.
export const SEGUNDAS_VUELTAS: Record<string, number> = {
  "2026-01": 6,
  "2026-02": 7,
  "2026-03": 8,
  "2026-04": 2,
  "2026-05": 1,
  "2026-06": 0,
}
