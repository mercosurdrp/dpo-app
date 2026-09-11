// Formato compartido por la página de Plan Territorial y sus secciones.

export const MESES = [
  "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

export function pesos(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return "$" + Math.round(n).toLocaleString("es-AR")
}

export function num(n: number | null | undefined, dec = 2): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}
