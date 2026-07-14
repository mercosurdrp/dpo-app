import { ClipboardCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"

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
 * Marca al cliente que ya tiene un plan de acción creado abajo, para no
 * duplicarlo. Un plan cerrado se muestra distinto de uno todavía abierto.
 */
export function PlanBadge({ planes }: { planes: PlanMarcable[] }) {
  if (planes.length === 0) return null

  const cerrado = planes.every((p) => p.estado === "completado")
  const detalle = planes
    .map((p) => `${p.titulo} (${ESTADO_PLAN[p.estado]})`)
    .join(" · ")

  return (
    <Badge
      variant="outline"
      title={`Ya tiene ${planes.length === 1 ? "un plan de acción" : `${planes.length} planes de acción`}: ${detalle}`}
      className={`shrink-0 gap-1 px-1.5 py-0 text-[10px] font-medium ${
        cerrado
          ? "border-slate-200 bg-slate-100 text-slate-600"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <ClipboardCheck className="h-3 w-3" />
      {cerrado ? "Plan cerrado" : "Con plan"}
      {planes.length > 1 && ` (${planes.length})`}
    </Badge>
  )
}
