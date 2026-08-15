"use client"

// Órdenes de trabajo abiertas.
//
// Vivía en el Tablero operativo, al lado de "Service pendientes". Su lugar es
// Programación OT, debajo del calendario del mes: quien programa la semana
// necesita ver ahí mismo lo que todavía está abierto, sin cambiar de solapa.

import { Wrench } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export interface OTPendiente {
  id: string
  dominio: string
  fecha: string
  estado: "programado" | "en_taller"
  motivo: string
}

export const OT_BADGE: Record<OTPendiente["estado"], { label: string; cls: string }> = {
  programado: {
    label: "Programada",
    cls: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  en_taller: {
    label: "En taller",
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
}

function antiguedad(fecha: string): string {
  const hoy = new Date()
  const f = new Date(fecha + "T00:00:00")
  const d = Math.round((hoy.getTime() - f.getTime()) / 86_400_000)
  if (d <= 0) return "hoy"
  if (d === 1) return "ayer"
  return `hace ${d} d`
}

export function OtAbiertasCard({
  otPendientes,
  onVerHistorial,
}: {
  otPendientes: OTPendiente[]
  /** Abre el historial de OT; con dominio, ya filtrado por esa unidad. */
  onVerHistorial: (dominio?: string) => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="size-4 text-muted-foreground" /> Órdenes de trabajo
        </CardTitle>
        <button
          type="button"
          onClick={() => onVerHistorial()}
          title="Ver el historial completo de órdenes de trabajo"
        >
          <Badge
            className={cn(
              "border-blue-500/30 bg-blue-500/10 text-blue-700 transition-shadow hover:brightness-95 dark:text-blue-400"
            )}
          >
            Abiertas: {otPendientes.length}
          </Badge>
        </button>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        {otPendientes.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            No hay órdenes de trabajo abiertas.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidad</TableHead>
                <TableHead>OT / motivo</TableHead>
                <TableHead>Abierta</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {otPendientes.map((ot) => (
                <TableRow
                  key={ot.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onVerHistorial(ot.dominio)}
                >
                  <TableCell className="font-medium">{ot.dominio}</TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    {ot.motivo}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {antiguedad(ot.fecha)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={OT_BADGE[ot.estado].cls}>
                      {OT_BADGE[ot.estado].label}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
