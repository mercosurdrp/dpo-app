"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { etiquetaFletero, limpiarNombreChofer } from "@/lib/gescom/etiqueta-fletero"
import { cn } from "@/lib/utils"
import { formatBultos, formatFecha } from "@/lib/format/rechazos"
import {
  getBultosDiaPatentes,
  type BultosDiaPatentes,
} from "@/actions/bultos-dia-patentes"
import { CamionSkusDialog } from "./camion-skus-dialog"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
}

export function BultosPatentesDiaDialog({ open, onOpenChange, fecha }: Props) {
  const [data, setData] = useState<BultosDiaPatentes | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skuDrill, setSkuDrill] = useState<{ fletero: string; etiqueta: string } | null>(null)

  useEffect(() => {
    if (!open || !fecha) {
      setData(null)
      setError(null)
      setSkuDrill(null)
      return
    }
    let cancelado = false
    setLoading(true)
    setError(null)
    void getBultosDiaPatentes(fecha).then((res) => {
      if (cancelado) return
      if ("error" in res) {
        setError(res.error)
        setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })
    return () => {
      cancelado = true
    }
  }, [open, fecha])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Camiones del día
            {fecha && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                · {formatFecha(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Patentes/repartos que componen los bultos de la columna, con su origen. Tocá un camión para ver sus SKUs. Rech. = lo rechazado de la mercadería que ese camión llevó ese día (aunque la devolución se registre después).
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando camiones…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 p-3 text-sm">
              <span className="font-semibold tabular-nums">{formatBultos(data.total_bultos)}</span>{" "}
              bultos entregados en {data.patentes.length} camión
              {data.patentes.length === 1 ? "" : "es"}/reparto
              {data.patentes.length === 1 ? "" : "s"}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead className="w-32">Patente</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead className="w-24 text-right">Bultos</TableHead>
                  <TableHead className="w-20 text-right">Rech.</TableHead>
                  <TableHead className="w-20 text-right">% del día</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.patentes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Sin ventas para este día
                    </TableCell>
                  </TableRow>
                )}
                {data.patentes.map((p, i) => {
                  const pct = data.total_bultos > 0 ? (p.bultos / data.total_bultos) * 100 : 0
                  const etiqueta =
                    etiquetaFletero(p.ds_fletero_carga, { patente: p.patente }) +
                    (p.chofer_nombre ? ` · ${limpiarNombreChofer(p.chofer_nombre)}` : "")
                  return (
                    <TableRow
                      key={p.ds_fletero_carga}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setSkuDrill({ fletero: p.ds_fletero_carga, etiqueta })}
                    >
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {etiquetaFletero(p.ds_fletero_carga, { patente: p.patente })}
                        {p.origen === "gestion" && p.patente && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({etiquetaFletero(p.ds_fletero_carga)})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {limpiarNombreChofer(p.chofer_nombre) ?? (
                          <span className="italic text-muted-foreground">(sin asignar)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatBultos(p.bultos)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          p.bultos_rechazados > 0 ? "font-medium text-red-700" : "text-muted-foreground",
                        )}
                      >
                        {p.bultos_rechazados > 0 ? formatBultos(p.bultos_rechazados) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {pct.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className="flex justify-end border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}

        <CamionSkusDialog
          open={skuDrill != null}
          onOpenChange={(o) => { if (!o) setSkuDrill(null) }}
          fecha={fecha}
          fletero={skuDrill?.fletero ?? null}
          etiqueta={skuDrill?.etiqueta ?? null}
        />
      </DialogContent>
    </Dialog>
  )
}
