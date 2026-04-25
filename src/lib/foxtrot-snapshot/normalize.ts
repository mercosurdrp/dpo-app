const RELOAD_PREFIX = /^\s*[12]\s*[°º]\s+/u
const RELOAD_SUFFIX = /[\s._-]*[12]\s*[°º]?\s*$/u

export function normalizeRouteName(name: string): string {
  if (!name) return ""
  let n = name.trim()
  n = n.replace(RELOAD_PREFIX, "")
  if (n.length > 3) n = n.replace(RELOAD_SUFFIX, "")
  return n.replace(/\s+/g, "").toUpperCase()
}

export function dateRange(
  rng: string,
  fromDate?: string | null,
  toDate?: string | null,
): string[] {
  const today = nowAr()
  if (rng === "today") return [today]
  if (rng === "yesterday") return [addDays(today, -1)]
  if (rng === "week") {
    const dt = parseDate(today)
    const dow = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay()
    const prevMonday = addDays(today, -(dow + 6))
    const dates: string[] = []
    for (let i = 0; i < 6; i++) dates.push(addDays(prevMonday, i))
    return dates
  }
  if (rng === "month") {
    const dates: string[] = []
    for (let i = 0; i < 30; i++) dates.push(addDays(today, -i))
    return dates
  }
  if (rng === "custom") {
    if (!fromDate || !toDate) throw new Error("rango personalizado requiere from_date y to_date")
    let d1 = fromDate
    let d2 = toDate
    if (d2 < d1) {
      const tmp = d1
      d1 = d2
      d2 = tmp
    }
    const diffDays = Math.round(
      (parseDate(d2).getTime() - parseDate(d1).getTime()) / 86_400_000,
    )
    const cap = Math.min(diffDays, 90)
    const dates: string[] = []
    for (let i = 0; i <= cap; i++) dates.push(addDays(d2, -i))
    return dates
  }
  throw new Error(`rango desconocido: ${rng}`)
}

function nowAr(): string {
  const d = new Date()
  const arMs = d.getTime() - 3 * 60 * 60 * 1000
  return new Date(arMs).toISOString().slice(0, 10)
}

function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`)
}

function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export { nowAr, parseDate, addDays }
