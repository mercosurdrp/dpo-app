"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, TriangleAlert } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getWnpDetalleDia, type WnpDetalleDia } from "@/actions/wnp"
import type { WnpEstadoPersona } from "@/lib/wnp/calculo"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
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

function num(n: number, dec = 2): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec }).format(n)
}

function EstadoBadge({ estado }: { estado: WnpEstadoPersona }) {
  if (estado === "fichado") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Fichó
      </Badge>
    )
  }
  if (estado === "supervisor") {
    return (
      <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
        Supervisor (no ficha)
      </Badge>
    )
  }
  if (estado === "ausente") {
    return (
      <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
        Ausente
      </Badge>
    )
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
      Sin fichaje — estimado
    </Badge>
  )
}

export function WnpDetalleDiaDialog({ open, onOpenChange, fecha }: Props) {
  const [data, setData] = useState<WnpDetalleDia | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!open || !fecha) return
    setLoading(true)
    setError(null)
    const res = await getWnpDetalleDia(fecha)
    setLoading(false)
    if ("error" in res) {
      setError(res.error)
      setData(null)
      return
    }
    setData(res.data)
  }, [open, fecha])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const faltantes = data?.personas.filter((p) => p.estado === "estimado") ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>WNP del día</DialogTitle>
          <DialogDescription>
            {formatFechaLarga(fecha)} · HL vendidos ÷ horas-hombre de Depósito
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando…
          </div>
        )}

        {error && !loading && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && data && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">HL vendidos</p>
                <p className="text-lg font-semibold">{num(data.hl, 1)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Horas-hombre</p>
                <p className="text-lg font-semibold">{num(data.horas, 1)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">WNP</p>
                <p className="text-lg font-semibold">
                  {data.wnp != null ? num(data.wnp) : "—"}
                </p>
              </div>
            </div>

            {/* El aviso que pidió el usuario: qué falta cuando el día no tiene
                fichaje completo ni ausencia cargada. */}
            {data.incompleto && (
              <div className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    Falta el fichaje de {faltantes.length}{" "}
                    {faltantes.length === 1 ? "persona" : "personas"}, sin
                    ausencia cargada.
                  </p>
                  <p>
                    {faltantes.map((p) => p.nombre).join(", ")}. Se les computó
                    la jornada teórica ({num(data.horasEstimadas, 1)} hs
                    estimadas de {num(data.horas, 1)}). Si faltaron, cargá la
                    ausencia; si trabajaron, revisá el reloj.
                  </p>
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Origen de las horas</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.personas.map((p) => (
                  <TableRow key={p.legajo}>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell>
                      <EstadoBadge estado={p.estado} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.horas > 0 ? num(p.horas, 2) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
