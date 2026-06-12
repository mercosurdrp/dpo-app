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
import { formatBultos, formatFecha, formatHl } from "@/lib/format/rechazos"
import { getCamionDiaSkus, type CamionDiaSkus } from "@/actions/camion-dia-skus"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
  /** ds_fletero_carga: patente Chess o GESTION-<cod>. */
  fletero: string | null
  /** Etiqueta linda para el título (patente o "Rep. X · chofer"). */
  etiqueta?: string | null
}

export function CamionSkusDialog({ open, onOpenChange, fecha, fletero, etiqueta }: Props) {
  const [data, setData] = useState<CamionDiaSkus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !fecha || !fletero) {
      setData(null)
      setError(null)
      return
    }
    let cancelado = false
    setLoading(true)
    setError(null)
    void getCamionDiaSkus(fecha, fletero).then((res) => {
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
  }, [open, fecha, fletero])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[640px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {etiqueta ?? fletero?.replace(/^GESTION-/, "Rep. ")}
            {fecha && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                · {formatFecha(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>Mercadería que llevó el camión ese día, por SKU.</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando SKUs…
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
              bultos · <span className="font-semibold tabular-nums">{formatHl(data.total_hl)}</span> HL ·{" "}
              {data.skus.length} SKU{data.skus.length === 1 ? "" : "s"}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead className="w-24 text-right">Bultos</TableHead>
                  <TableHead className="w-24 text-right">HL</TableHead>
                  <TableHead className="w-20 text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.skus.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Sin detalle por SKU para este camión/día (se genera con el sync diario).
                    </TableCell>
                  </TableRow>
                )}
                {data.skus.map((s, i) => {
                  const pct = data.total_bultos > 0 ? (s.bultos / data.total_bultos) * 100 : 0
                  return (
                    <TableRow key={s.id_articulo}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        {s.ds_articulo ?? `Art ${s.id_articulo}`}
                        <span className="ml-1 text-xs text-muted-foreground">#{s.id_articulo}</span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatBultos(s.bultos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatHl(s.hl)}</TableCell>
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
      </DialogContent>
    </Dialog>
  )
}
