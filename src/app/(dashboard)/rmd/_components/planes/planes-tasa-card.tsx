"use client"

import { useMemo } from "react"
import { ClipboardList, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RmdPlan } from "@/actions/rmd-planes"
import { PlanCard, hoyISO } from "./planes-accion-bloque"

interface Props {
  /** Planes con foco en la tasa de respuesta (ya filtrados). */
  planes: RmdPlan[]
  onNuevo: () => void
  onVer: (plan: RmdPlan) => void
}

/**
 * Tarjeta de la solapa Cobertura con los planes que atacan la tasa de
 * respuesta (por ejemplo, la entrega de folletos con QR en los PDV). Los
 * planes se abren acá mismo, sin saltar a la solapa del panel.
 */
export function PlanesTasaCard({ planes, onNuevo, onVer }: Props) {
  const hoy = useMemo(() => hoyISO(), [])
  const abiertos = planes.filter((p) => p.estado !== "completado")
  const cerrados = planes.filter((p) => p.estado === "completado")

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-amber-600" />
            Plan de acción para subir la tasa de respuesta
            {planes.length > 0 && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-800"
              >
                {abiertos.length} abierto{abiertos.length === 1 ? "" : "s"}
                {cerrados.length > 0 && ` · ${cerrados.length} cerrado${cerrados.length === 1 ? "" : "s"}`}
              </Badge>
            )}
          </span>
          <Button size="sm" onClick={onNuevo}>
            <Plus className="mr-1 h-4 w-4" />
            Nuevo plan
          </Button>
        </CardTitle>
        <p className="text-xs text-slate-500">
          Acciones generales sobre toda la base para que más clientes califiquen
          la entrega. Clic en un plan para ver el detalle, cargar avances o
          cambiarle el estado.
        </p>
      </CardHeader>
      <CardContent className="border-t pt-4">
        {planes.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Todavía no hay un plan para subir la tasa. Crealo desde «Nuevo
            plan».
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...abiertos, ...cerrados].map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                hoy={hoy}
                compacta
                onClick={() => onVer(p)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
