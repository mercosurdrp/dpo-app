// Vista empleado — regla de horario:
// Antes de las 19hs (hora ARG) muestra HOY; desde las 19hs muestra MAÑANA.
export function fechaQueVeElEmpleado(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const y = parseInt(get("year"), 10)
  const m = parseInt(get("month"), 10)
  const d = parseInt(get("day"), 10)
  const h = parseInt(get("hour"), 10)

  // Mediodía UTC para evitar saltos por DST; +1 día si la hora ARG ≥ 19.
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  if (h >= 19) base.setUTCDate(base.getUTCDate() + 1)
  return base.toISOString().slice(0, 10)
}
