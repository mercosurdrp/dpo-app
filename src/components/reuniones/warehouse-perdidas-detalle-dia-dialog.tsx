"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, Truck, Warehouse } from "lucide-react"
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

  const sinRoturas = data != null && (data.roturas_hl_dia ?? 0) === 0
  // Parte del volumen afectado que NO pasó por reempaque (rotura directa de
  // depósito). Sólo se muestra cuando el día tuvo las dos cosas.
  const directasHl =
    data?.wqi_hl_dia != null && data?.reempaque_hl_dia != null
      ? Math.max(0, data.wqi_hl_dia - data.reempaque_hl_dia)
      : null
  const hayDistribucion = (data?.roturas_detalle ?? []).some(
    (r) => r.origen === "distribucion",
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            WQI del día
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Las dos lecturas del día sobre el mismo denominador (HL entregado):
            el <strong>WQI total</strong>, que cuenta todo el volumen afectado
            por rotura —incluido lo que se reempaca y se recupera—, y las{" "}
            <strong>roturas reales</strong>, que es la merma final del almacén.
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
            <div className="grid gap-3 sm:grid-cols-2">
              {/* WQI total: el valor de la celda sobre la que se hizo click */}
              <Card className="border-slate-300 bg-slate-50">
                <CardContent className="pt-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    WQI total (con reempacado)
                  </p>
                  <div className="mt-1 flex items-baseline gap-3">
                    <p className="text-3xl font-bold tabular-nums text-slate-900">
                      {fmt(data.wqi_dia, 1)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        PPM
                      </span>
                    </p>
                    <p className="text-xl font-semibold tabular-nums text-slate-700">
                      {fmt(data.wqi_hl_dia, 2)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        HL
                      </span>
                    </p>
                  </div>
                  {data.reempaque_hl_dia != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      A reempaque {fmt(data.reempaque_hl_dia, 2)} HL
                      {directasHl != null && directasHl > 0.0001
                        ? ` + roturas directas ${fmt(directasHl, 2)} HL`
                        : ""}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Acumulado del mes: {fmt(data.wqi_mtd, 1)} PPM
                  </p>
                </CardContent>
              </Card>

              {/* Roturas reales: merma final del almacén (lo que se descarta) */}
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Roturas reales (merma final)
                  </p>
                  <div className="mt-1 flex items-baseline gap-3">
                    <p className="text-3xl font-bold tabular-nums text-red-700">
                      {fmt(data.roturas_ppm_dia, 1)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        PPM
                      </span>
                    </p>
                    <p className="text-xl font-semibold tabular-nums text-red-700">
                      {fmt(data.roturas_hl_dia, 2)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        HL
                      </span>
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Acumulado del mes: {fmt(data.roturas_ppm_mtd, 1)} PPM
                  </p>
                </CardContent>
              </Card>
            </div>

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
                        <TableHead>Dónde</TableHead>
                        <TableHead className="text-right">Bultos</TableHead>
                        <TableHead className="text-right">HL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.roturas_detalle.map((r) => {
                        const esDistribucion = r.origen === "distribucion"
                        const patentes = r.patentes ?? []
                        return (
                          <TableRow key={`${r.sku}-${r.origen ?? "almacen"}`}>
                            <TableCell className="font-mono font-medium">
                              {r.sku}
                            </TableCell>
                            <TableCell
                              className="max-w-[240px] truncate"
                              title={r.descripcion}
                            >
                              {r.descripcion || "—"}
                            </TableCell>
                            <TableCell>
                              <span
                                className={
                                  esDistribucion
                                    ? "inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                                    : "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
                                }
                                title={
                                  esDistribucion && patentes.length > 0
                                    ? `Camión ${patentes.join(", ")}`
                                    : undefined
                                }
                              >
                                {esDistribucion ? (
                                  <Truck className="size-3" />
                                ) : (
                                  <Warehouse className="size-3" />
                                )}
                                {esDistribucion ? "Distribución" : "Almacén"}
                              </span>
                              {esDistribucion && patentes.length > 0 && (
                                <span className="ml-1 font-mono text-xs text-muted-foreground">
                                  {patentes.join(", ")}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmt(r.bultos_eq ?? r.bultos, 2)}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-red-700">
                              {fmt(r.hl, 4)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                {hayDistribucion && (
                  <p className="text-xs text-muted-foreground">
                    Las roturas de <strong>Distribución</strong> se rompieron en
                    la calle: van al DQI y no suman a ninguno de los dos números
                    de arriba.
                  </p>
                )}
              </div>
            )}

            {/* Nota explicativa del 0 */}
            {sinRoturas && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>
                  <strong>Sin roturas reales</strong> este día: nada se terminó
                  descartando. Si el WQI total no es 0, es volumen que entró a
                  reempaque y se recuperó.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
