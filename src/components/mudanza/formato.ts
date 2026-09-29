import type { MudanzaEstado, MudanzaTarea } from "@/types/mudanza"

const DAY = 86400000

export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

/** "2026-11-01" → "01/11/26" (sin pasar por Date, evita el corrimiento de zona horaria). */
export function formatFecha(s: string | null | undefined): string {
  if (!s) return "—"
  const [y, m, d] = s.slice(0, 10).split("-")
  return `${d}/${m}/${y.slice(2)}`
}

export function parseFecha(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function isoHoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function diasEntre(a: string, b: string): number {
  return Math.round((parseFecha(b).getTime() - parseFecha(a).getTime()) / DAY) + 1
}

export function estadoLabel(e: MudanzaEstado): string {
  return (
    { pendiente: "Pendiente", en_curso: "En curso", hecha: "Hecha", bloqueada: "Bloqueada" }[e] ??
    e
  )
}

export function estadoClase(e: MudanzaEstado): string {
  return (
    {
      pendiente: "border-slate-200 bg-slate-100 text-slate-700",
      en_curso: "border-sky-200 bg-sky-100 text-sky-700",
      hecha: "border-emerald-200 bg-emerald-100 text-emerald-700",
      bloqueada: "border-red-200 bg-red-100 text-red-700",
    }[e] ?? ""
  )
}

export function tieneFechas(t: MudanzaTarea): boolean {
  return !!(t.inicio && t.fin)
}

export function estaAtrasada(t: MudanzaTarea, hoy = isoHoy()): boolean {
  return !!t.fin && t.estado !== "hecha" && t.fin < hoy
}

/** Días de corrimiento del fin real (o de hoy si sigue abierta y vencida) contra el fin planificado. */
export function desvioDias(t: MudanzaTarea, hoy = isoHoy()): number | null {
  if (!t.fin) return null
  if (t.fin_real) return diasEntre(t.fin, t.fin_real) - 1
  if (t.estado !== "hecha" && t.fin < hoy) return diasEntre(t.fin, hoy) - 1
  return null
}

/** Pares de tareas abiertas del mismo responsable que se pisan en fechas planificadas. */
export function superposiciones(tareas: MudanzaTarea[]): [MudanzaTarea, MudanzaTarea][] {
  const por: Record<string, MudanzaTarea[]> = {}
  for (const t of tareas) {
    if (!tieneFechas(t) || t.estado === "hecha" || !t.responsable_id || t.hito) continue
    ;(por[t.responsable_id] ??= []).push(t)
  }
  const out: [MudanzaTarea, MudanzaTarea][] = []
  for (const lista of Object.values(por)) {
    const l = lista.slice().sort((a, b) => a.inicio!.localeCompare(b.inicio!))
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        if (l[j].inicio! <= l[i].fin!) out.push([l[i], l[j]])
      }
    }
  }
  return out
}

/** Colores fijos por responsable (orden del equipo), validados para daltonismo. */
export const COLORES_SERIE = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
]

export function colorResponsable(id: string | null, orden: string[]): string {
  if (!id) return "#94a3b8"
  const i = orden.indexOf(id)
  return i >= 0 && i < COLORES_SERIE.length ? COLORES_SERIE[i] : "#64748b"
}
