"use client"

/**
 * Tarjeta de KPI de las pantallas de Vehículos (el módulo de mantenimiento tiene
 * la suya en `mantenimiento/_components/kpi-card.tsx`).
 *
 * 🚨 Nace de un pedido concreto: las tarjetas de arriba de /vehiculos y de la
 * ficha de cada unidad mostraban un número y al tocarlas no pasaba nada. Un
 * número que no se puede abrir obliga a buscar a mano lo que lo forma, así que
 * acá el `onClick` es OBLIGATORIO: si una tarjeta no lleva a ningún lado, no
 * debería parecer un botón.
 */

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export function TarjetaKpi({
  label,
  valor,
  valorClase,
  Icon,
  iconoClase,
  detalle,
  pista,
  activo,
  onClick,
}: {
  label: string
  valor: string | number
  /** Color del número (el default es el del texto principal). */
  valorClase?: string
  Icon: LucideIcon
  /** Fondo + color del ícono, juntos: `bg-blue-100 text-blue-600`. */
  iconoClase: string
  /** Línea extra bajo el número (comparación, promedio, etc.). */
  detalle?: ReactNode
  /** Qué pasa al tocarla: se muestra abajo y como `title`. */
  pista: string
  /** Sólo para las que dejan un filtro puesto. */
  activo?: boolean
  onClick: () => void
}) {
  return (
    <Card
      className={`cursor-pointer transition-colors hover:border-blue-400 hover:bg-slate-50 ${
        activo ? "border-blue-500 ring-2 ring-blue-200" : ""
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={activo}
        title={pista}
        className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-3xl font-bold ${valorClase ?? "text-slate-900"}`}>{valor}</p>
            </div>
            <div className={`rounded-full p-3 ${iconoClase}`}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
          {detalle}
          <p className="mt-2 text-xs text-blue-600">
            {activo ? "Filtro puesto — click para quitarlo" : pista}
          </p>
        </CardContent>
      </button>
    </Card>
  )
}
