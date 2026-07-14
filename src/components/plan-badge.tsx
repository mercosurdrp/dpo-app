"use client"

import { ClipboardCheck } from "lucide-react"

export type PlanEstado = "pendiente" | "en_progreso" | "completado"

/** Lo mínimo que necesitamos de un plan de acción (NpsPlan y RmdPlan lo cumplen). */
export interface PlanMarcable {
  id: string
  titulo: string
  estado: PlanEstado
  foco_cliente_id: number | null
}

export const ESTADO_PLAN: Record<PlanEstado, string> = {
  pendiente: "pendiente",
  en_progreso: "en progreso",
  completado: "completado",
}

/** Agrupa los planes por el cliente al que enfocan. */
export function planesPorClienteFoco<T extends PlanMarcable>(
  planes: T[],
): Map<number, T[]> {
  const m = new Map<number, T[]>()
  for (const p of planes) {
    if (p.foco_cliente_id == null) continue
    const ps = m.get(p.foco_cliente_id)
    if (ps) ps.push(p)
    else m.set(p.foco_cliente_id, [p])
  }
  return m
}

/**
 * El plan que se abre al clickear el botón: el primero que sigue abierto, o el
 * último si ya están todos completados.
 */
export function planAAbrir<T extends PlanMarcable>(planes: T[]): T {
  return planes.find((p) => p.estado !== "completado") ?? planes[planes.length - 1]
}

/**
 * Va en la columna "Acción" del explorador, en lugar del botón de crear: marca
 * que el cliente ya tiene plan (para no duplicarlo) y lleva a verlo.
 */
export function PlanBadge({
  planes,
  onVerPlan,
}: {
  planes: PlanMarcable[]
  onVerPlan: (plan: PlanMarcable) => void
}) {
  if (planes.length === 0) return null

  const cerrado = planes.every((p) => p.estado === "completado")
  const detalle = planes
    .map((p) => `${p.titulo} (${ESTADO_PLAN[p.estado]})`)
    .join(" · ")

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onVerPlan(planAAbrir(planes))
      }}
      title={`Ya tiene ${planes.length === 1 ? "un plan de acción" : `${planes.length} planes de acción`}: ${detalle}. Clic para verlo.`}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
        cerrado
          ? "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      }`}
    >
      <ClipboardCheck className="h-3.5 w-3.5" />
      {cerrado ? "Plan cerrado" : "Con plan"}
      {planes.length > 1 && ` (${planes.length})`}
    </button>
  )
}
