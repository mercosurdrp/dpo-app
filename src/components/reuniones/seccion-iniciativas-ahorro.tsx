"use client"

import Link from "next/link"
import { ExternalLink, PiggyBank } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { IniciativasAhorroSection } from "@/components/presupuesto/iniciativas-ahorro-section"
import {
  FOCO_LABEL,
  focoDe,
  ordenarPorFoco,
  type FocoIniciativa,
  type IniciativasAhorroReunionData,
} from "@/lib/reuniones-iniciativas-ahorro"

/**
 * Temario de la reunión de Iniciativas de Ahorro: las iniciativas del año con
 * el mismo bloque que usa /presupuesto (ahorro real vs. comprometido, KPI
 * físico de vencidos, roturas y combustible), ordenadas por foco. Se reusa el
 * componente entero para que el criterio de "cómo fue" cada iniciativa se
 * calcule en un solo lugar; la edición pasa por las mismas acciones y
 * `router.refresh()` vuelve a leer todo desde la página (server).
 */
export function SeccionIniciativasAhorro({
  data,
  puedeEditar,
}: {
  data: IniciativasAhorroReunionData
  puedeEditar: boolean
}) {
  const ordenadas = ordenarPorFoco(data.iniciativas)
  const conteo = ordenadas.reduce<Record<FocoIniciativa, number>>(
    (acc, ini) => {
      acc[focoDe(ini)] += 1
      return acc
    },
    { obsolescencia: 0, roturas: 0, combustible: 0, otras: 0 },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <PiggyBank className="size-5 text-slate-500" />
            Iniciativas de Ahorro {data.anio}
          </span>
          <Link
            href="/presupuesto"
            className="flex items-center gap-1 text-xs font-normal text-blue-600 hover:underline"
          >
            Ver en Presupuesto
            <ExternalLink className="size-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500">
          Cada iniciativa se mira contra el ahorro $ comprometido y contra su
          KPI. En orden: obsolescencia, roturas, combustible y el resto.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FOCO_LABEL) as FocoIniciativa[]).map((foco) => (
            <Badge
              key={foco}
              variant="secondary"
              className={
                conteo[foco] === 0 ? "text-slate-400" : "text-slate-700"
              }
            >
              {FOCO_LABEL[foco]}: {conteo[foco]}
            </Badge>
          ))}
        </div>
        <IniciativasAhorroSection
          anio={data.anio}
          iniciativas={ordenadas}
          ejecucionRubros={data.ejecucionRubros}
          kpiPerdidas={data.kpiPerdidas}
          kpiCombustible={data.kpiCombustible}
          responsables={data.responsables}
          puedeEditar={puedeEditar}
        />
      </CardContent>
    </Card>
  )
}
