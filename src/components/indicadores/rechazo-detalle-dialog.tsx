"use client"

import { useEffect, useState } from "react"
import { FileDown, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getDetalleRechazosMes } from "@/actions/cuadro-mensual"
import { nombreMes } from "@/lib/indicadores/cuadro-mensual"
import {
  PLANES_ACCION_RECHAZO,
  type DetalleRechazos,
} from "@/lib/indicadores/cuadro-mensual-detalle"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "YYYY-MM" del mes clickeado. */
  mes: string | null
  /** % de rechazo de la celda (para el encabezado). */
  pctCelda: number | null
}

const fmt = (n: number, dec = 1) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n)

export function RechazoDetalleDialog({ open, onOpenChange, mes, pctCelda }: Props) {
  const [detalle, setDetalle] = useState<DetalleRechazos | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !mes) return
    let cancelado = false
    setLoading(true)
    setError(null)
    setDetalle(null)
    getDetalleRechazosMes(mes)
      .then((res) => {
        if (cancelado) return
        if ("error" in res) setError(res.error)
        else setDetalle(res.data)
      })
      .catch((e) => !cancelado && setError(String(e)))
      .finally(() => !cancelado && setLoading(false))
    return () => {
      cancelado = true
    }
  }, [open, mes])

  const plan = mes ? PLANES_ACCION_RECHAZO[mes] : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>% Rechazo — {mes ? nombreMes(mes) : ""}</DialogTitle>
          <DialogDescription>
            {pctCelda !== null ? `${fmt(pctCelda)}% del volumen distribuido` : "Detalle del mes"}
            {detalle
              ? ` · ${fmt(detalle.totalHl)} HL rechazados en ${detalle.cantidad.toLocaleString("es-AR")} rechazos`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {plan && (
          <a
            href={plan}
            download
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <FileDown className="mr-2 h-4 w-4" />
            Descargar plan de acción del mes (PDF)
          </a>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-600">{error}</p>
        ) : detalle ? (
          <>
            <p className="text-xs font-medium text-slate-500">
              Top {detalle.top.length} rechazos del mes (por comprobante)
            </p>
            <div className="max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Bultos</TableHead>
                    <TableHead className="text-right">HL</TableHead>
                    <TableHead className="text-right">% mes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalle.top.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {it.fecha.slice(8, 10)}/{it.fecha.slice(5, 7)}
                      </TableCell>
                      <TableCell className="font-medium">{it.cliente}</TableCell>
                      <TableCell className="text-xs">{it.motivo}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {it.bultos.toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(it.hl)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmt(it.pctMes)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
