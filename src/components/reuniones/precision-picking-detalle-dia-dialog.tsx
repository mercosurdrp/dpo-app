"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PrecisionPickingDetalleDia } from "@/lib/warehouse/auto-indicadores"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
  detalle: PrecisionPickingDetalleDia | null
}

function formatFechaLarga(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function num(n: number, dec = 0): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

/**
 * Qué hay detrás de la precisión de picking de un día. Es un valor global del
 * depósito (no abre la apertura por operador, que ya se ve desde "Errores de
 * picking"): sólo los bultos pickeados, los bultos errados y la cuenta, para
 * explicar en la reunión por qué un solo error puede pesar mucho.
 */
export function PrecisionPickingDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
  detalle,
}: Props) {
  const errados = detalle
    ? num(detalle.errados, Number.isInteger(detalle.errados) ? 0 : 2)
    : ""
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Precisión de picking</DialogTitle>
          <DialogDescription className="capitalize">
            {fecha ? formatFechaLarga(fecha) : "Sin fecha"}
          </DialogDescription>
        </DialogHeader>

        {detalle ? (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Bultos pickeados</dt>
              <dd className="text-right tabular-nums">{num(detalle.bultos)}</dd>
              <dt className="text-muted-foreground">Bultos errados</dt>
              <dd className="text-right tabular-nums">{errados}</dd>
              <dt className="font-medium">Precisión</dt>
              <dd className="text-right font-semibold tabular-nums">
                {num(detalle.precision, 2)}%
              </dd>
            </dl>
            <p className="text-[11px] text-muted-foreground">
              Se mide en bultos errados, no en cantidad de errores: un error de
              muchos bultos pesa más que varios de un bulto. Los bultos
              pickeados son los de la planilla de bultos (entrega del día hábil
              siguiente); los errados, la columna CANTIDAD DE BULTOS de la
              planilla de errores, sin los de SISTEMA.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay detalle para este día (la precisión no salió de las
            planillas).
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
