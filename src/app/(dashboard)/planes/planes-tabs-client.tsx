"use client"

import { PlanesListClient } from "./planes-list-client"
import { PlanesUnificadosClient } from "./planes-unificados-client"
import type { PlanAccionListItem } from "@/types/database"
import type { PlanUnificado } from "@/actions/planes-unificados"

/**
 * Envoltorio de /planes:
 *  - Pampeana: una sola vista, el tablero unificado con los planes de TODOS
 *    los módulos (auditorías, NPS, Rechazos, OWD, Roturas, 5S, TLP, Reunión,
 *    Presupuesto, Riesgos…). La gestión en detalle de cada plan se hace
 *    entrando al plan (click).
 *  - Misiones (sin `unificados`): la lista clásica de siempre, sin cambios.
 */
export function PlanesTabsClient({
  planes,
  admins,
  unificados,
}: {
  planes: PlanAccionListItem[]
  admins: Array<{ id: string; nombre: string }>
  unificados: PlanUnificado[] | null
}) {
  if (!unificados) {
    // Sin tablero unificado (p. ej. Misiones): sólo la lista clásica.
    return <PlanesListClient planes={planes} admins={admins} />
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Planes</h1>
      </div>
      <PlanesUnificadosClient planes={unificados} />
    </div>
  )
}
