"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { PlanesListClient } from "./planes-list-client"
import { PlanesUnificadosClient } from "./planes-unificados-client"
import type { PlanAccionListItem } from "@/types/database"
import type { PlanUnificado } from "@/actions/planes-unificados"

/**
 * Envoltorio con dos pestañas para /planes:
 *  - "Planes de acción": la lista de siempre (tabla planes_accion).
 *  - "Todos los planes": tablero unificado con los planes de todos los
 *    módulos (NPS, Rechazos, OWD, Roturas, 5S, …). Sólo se muestra cuando
 *    el server pasa `unificados` (gateado a Pampeana).
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
      <Tabs defaultValue="todos">
        <TabsList>
          <TabsTrigger value="todos">Todos los planes</TabsTrigger>
          <TabsTrigger value="accion">Planes de acción</TabsTrigger>
        </TabsList>
        <TabsContent value="todos" className="mt-4">
          <PlanesUnificadosClient planes={unificados} />
        </TabsContent>
        <TabsContent value="accion" className="mt-4">
          <PlanesListClient planes={planes} admins={admins} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
