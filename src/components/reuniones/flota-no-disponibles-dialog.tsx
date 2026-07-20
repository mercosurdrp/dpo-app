"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { UnidadNoDisponible } from "@/lib/vehiculos/disponibilidad-flota"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string
  unidades: UnidadNoDisponible[]
  /** Flota de reparto considerada (denominador): sin depósito ni acoplados. */
  unidadesFlota: number
}

const CAUSA_BADGE: Record<
  UnidadNoDisponible["causa"],
  { label: string; className: string }
> = {
  PMC: {
    label: "Correctivo",
    className: "border-red-200 bg-red-100 text-red-700 hover:bg-red-100",
  },
  PMP: {
    label: "Preventivo",
    className: "border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-100",
  },
  IND: {
    label: "Indisponible",
    className: "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100",
  },
}

function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
}

function formatFechaCorta(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

export function FlotaNoDisponiblesDialog({
  open,
  onOpenChange,
  fecha,
  unidades,
  unidadesFlota,
}: Props) {
  const parados = unidades.length
  const disponibles = Math.max(unidadesFlota - parados, 0)
  const pctDia =
    unidadesFlota > 0 ? (disponibles / unidadesFlota) * 100 : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Flota fuera de servicio</DialogTitle>
          <DialogDescription>
            {formatFechaLarga(fecha)} — unidades de reparto que no estaban
            disponibles ese día.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500">Disponibles</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {disponibles}
              <span className="ml-1 text-sm font-medium text-slate-500">
                / {unidadesFlota}
              </span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500">Paradas</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{parados}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500">
              Disponibilidad del día
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {pctDia == null
                ? "—"
                : pctDia.toLocaleString("es-AR", { maximumFractionDigits: 1 })}
              <span className="ml-1 text-sm font-medium text-slate-500">%</span>
            </p>
          </div>
        </div>

        {/* El % de la tarjeta es del mes acumulado; el de acá, de un solo día.
            Se aclara para que no parezca que uno de los dos está mal. */}
        <p className="text-xs text-slate-500">
          Este porcentaje es solo de este día. El de la tarjeta es el acumulado
          del mes, por eso no coinciden.
        </p>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead className="text-right">Días</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unidades.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-slate-400"
                  >
                    Toda la flota de reparto estuvo disponible ese día.
                  </TableCell>
                </TableRow>
              )}
              {unidades.map((u) => {
                const badge = CAUSA_BADGE[u.causa]
                return (
                  <TableRow key={u.dominio}>
                    <TableCell className="font-medium">
                      {u.dominio}
                      {u.modelo && (
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          {u.modelo}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {u.motivo?.trim() || (
                        <span className="text-slate-400">sin detalle</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-slate-500">
                      {formatFechaCorta(u.desde)}
                    </TableCell>
                    <TableCell className="tabular-nums text-slate-500">
                      {u.hasta ? (
                        formatFechaCorta(u.hasta)
                      ) : (
                        <span className="text-amber-600">sin retorno</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {u.diasParada}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
