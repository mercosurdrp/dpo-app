"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, Package, PackageX, ShoppingCart } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getWarehousePerdidasDia,
  type WarehousePerdidasDia,
} from "@/actions/warehouse-perdidas-dia"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
}

function formatFechaLarga(s: string): string {
  try {
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  } catch {
    return s
  }
}

function fmt(n: number | null, dec = 0): string {
  if (n == null) return "—"
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

function fmtPesos(n: number | null): string {
  if (n == null) return "—"
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  })
}

export function WarehousePerdidasDetalleDiaDialog({ open, onOpenChange, fecha }: Props) {
  const [data, setData] = useState<WarehousePerdidasDia | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !fecha) {
      setData(null)
      setError(null)
      return
    }
    let cancelado = false
    setLoading(true)
    setError(null)
    void getWarehousePerdidasDia(fecha).then((res) => {
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

  const sinRoturas = data != null && (data.roturas_hl ?? 0) === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Ventas y pérdidas del día
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Bultos vendidos y qué se perdió ese día, con el detalle de cada
            rotura por SKU (bultos, unidades y HL). El WQI es PPM = HL de roturas
            ÷ HL vendidos × 1.000.000.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Cargando detalle…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            {/* Bultos + HL vendidos (tablero) */}
            <Card>
              <CardContent className="flex items-center justify-between pt-4">
                <div className="flex gap-8">
                  <div>
                    <p className="text-xs text-muted-foreground">Bultos vendidos</p>
                    <p className="text-3xl font-bold">{fmt(data.bultos)}</p>
                    {data.devoluciones != null && data.devoluciones !== 0 && (
                      <p className="text-xs text-muted-foreground">
                        Devoluciones (NC): {fmt(Math.abs(data.devoluciones))} bultos
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">HL vendidos</p>
                    <p className="text-3xl font-bold">{fmt(data.hl_vendido, 2)}</p>
                    <p className="text-xs text-muted-foreground">denominador del WQI</p>
                  </div>
                </div>
                <ShoppingCart className="size-6 text-slate-400" />
              </CardContent>
            </Card>

            {/* Pérdidas: roturas / faltantes / $ */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Roturas</p>
                    <Package className="size-4 text-slate-400" />
                  </div>
                  <p className="text-2xl font-bold text-red-700">{fmt(data.roturas_hl, 2)}</p>
                  <p className="text-xs text-muted-foreground">HL</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Faltantes</p>
                    <PackageX className="size-4 text-slate-400" />
                  </div>
                  <p className="text-2xl font-bold text-amber-700">{fmt(data.faltantes_hl, 2)}</p>
                  <p className="text-xs text-muted-foreground">HL</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Pérdidas $</p>
                  <p className="text-2xl font-bold">{fmtPesos(data.perdidas_val)}</p>
                  <p className="text-xs text-muted-foreground">total del día</p>
                </CardContent>
              </Card>
            </div>

            {/* WQI: día vs MTD */}
            <Card>
              <CardContent className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">WQI del día</p>
                  <p className="text-2xl font-bold">{fmt(data.wqi_dia, 1)} <span className="text-sm font-normal text-muted-foreground">PPM</span></p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">WQI acumulado del mes</p>
                  <p className="text-2xl font-bold">{fmt(data.wqi_mtd, 1)} <span className="text-sm font-normal text-muted-foreground">PPM</span></p>
                </div>
              </CardContent>
            </Card>

            {/* Detalle de roturas por SKU: qué se rompió ese día */}
            {data.roturas_detalle.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">
                  Roturas por SKU ({data.roturas_detalle.length})
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Bultos</TableHead>
                        <TableHead className="text-right">Unid.</TableHead>
                        <TableHead className="text-right">HL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.roturas_detalle.map((r) => (
                        <TableRow key={r.sku}>
                          <TableCell className="font-mono font-medium">
                            {r.sku}
                          </TableCell>
                          <TableCell
                            className="max-w-[240px] truncate"
                            title={r.descripcion}
                          >
                            {r.descripcion || "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt(r.bultos, 2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt(r.unidades, 2)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-red-700">
                            {fmt(r.hl, 4)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Nota explicativa del 0 */}
            {sinRoturas && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>
                  WQI del día = <strong>0</strong> porque <strong>no hubo roturas</strong> este
                  día (lo perdido fue faltante, no rotura). Es un día limpio, no un error.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
