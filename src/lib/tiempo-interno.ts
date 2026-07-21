// Helpers puros del Tiempo Interno.
//
// Viven acá y no en `src/actions/tiempo-interno.ts` porque un archivo "use server"
// solo puede exportar funciones async: exportar esto desde el action rompe el
// build con un error que no señala la causa.
//
// Que la semana se calcule en UN solo lugar no es cosmético: el filtro del
// detalle y la serie semanal tienen que numerar igual, o el usuario filtra la
// "semana 29" y ve otro conjunto de días que el del gráfico.

export function semanaDelAnio(fechaISO: string): { year: number; semana: number } {
  const date = new Date(fechaISO + "T12:00:00")
  const startOfYear = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - startOfYear.getTime()
  const semana = Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7)
  return { year: date.getFullYear(), semana }
}

/** Clave estable para agrupar/filtrar por semana. */
export function claveSemana(fechaISO: string): string {
  const { year, semana } = semanaDelAnio(fechaISO)
  return `${year}-${semana}`
}

/** Rango de fechas (lunes a domingo) que cubre una clave de semana, para mostrarlo. */
export function rangoDeSemana(fechas: string[]): string {
  if (fechas.length === 0) return ""
  const orden = [...fechas].sort()
  const fmt = (f: string) => f.slice(8, 10) + "/" + f.slice(5, 7)
  const desde = fmt(orden[0])
  const hasta = fmt(orden[orden.length - 1])
  return desde === hasta ? desde : `${desde} al ${hasta}`
}
