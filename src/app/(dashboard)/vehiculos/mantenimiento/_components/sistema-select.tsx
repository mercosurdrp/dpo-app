"use client"

// Selector del sistema del vehículo en la OT (R2.2.6 / R2.4.2).
//
// Mientras la persona no elija a mano, el valor es el que sugiere el texto de
// la OT (tareas + observaciones) y se dice que es una sugerencia. Elegir uno
// la fija; «Volver a la sugerencia» la suelta. Centinela "none": nunca un
// SelectItem con value "" (crashea en producción).

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SISTEMAS_OT, type SugerenciaSistema } from "@/lib/flota/sistemas-ot"
import type { MantenimientoSistema } from "@/types/database"

export type SistemaValor = MantenimientoSistema | "none"

export function SistemaSelect({
  valor,
  manual,
  sugerencia,
  onChange,
  className,
}: {
  /** Valor efectivo (el manual o el sugerido). */
  valor: SistemaValor
  /** true = lo eligió la persona; false = viene de la sugerencia. */
  manual: boolean
  sugerencia: SugerenciaSistema | null
  onChange: (valor: SistemaValor, manual: boolean) => void
  className?: string
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <Label>Sistema del vehículo</Label>
        {manual && sugerencia && sugerencia.sistema !== valor && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => onChange(sugerencia.sistema, false)}
          >
            Volver a la sugerencia
          </button>
        )}
      </div>
      <Select value={valor} onValueChange={(v) => onChange(v as SistemaValor, true)}>
        <SelectTrigger>
          <SelectValue placeholder="Sin clasificar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sin clasificar</SelectItem>
          {SISTEMAS_OT.map((s) => (
            <SelectItem key={s.id} value={s.id} title={s.descripcion}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-xs text-muted-foreground">
        {!manual && sugerencia
          ? `Sugerido por el texto (${sugerencia.coincidencias.slice(0, 3).join(", ")}). Es la base del análisis de correctivos recurrentes.`
          : !manual
            ? "Se sugiere solo cuando el texto de las tareas lo permite; elegilo si lo sabés."
            : "Clasificación confirmada."}
      </p>
    </div>
  )
}
