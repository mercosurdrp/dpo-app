"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, Package, Target, Truck } from "lucide-react"
import { pesoLimiteKg } from "@/lib/sla-cumplimiento"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
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
  getOcupacionBodegaResumenDia,
  type OBResumenDia,
} from "@/actions/ocupacion-bodega-resumen-dia"

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

function fmtN(n: number, dec = 0): string {
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function colorPct(pct: number): { text: string; bg: string; hex: string } {
  if (pct >= 100) return { text: "text-emerald-700", bg: "bg-emerald-50", hex: "#059669" }
  if (pct >= 70) return { text: "text-amber-700", bg: "bg-amber-50", hex: "#b45309" }
  return { text: "text-red-700", bg: "bg-red-50", hex: "#b91c1c" }
}

export function OcupacionBodegaDetalleDiaDialog({ open, onOpenChange, fecha }: Props) {
  const [data, setData] = useState<OBResumenDia | null>(null)
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
    void getOcupacionBodegaResumenDia(fecha).then((res) => {
      if (cancelado) return
      if ("error" in res) {
        setError(res.error); setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })
    return () => { cancelado = true }
  }, [open, fecha])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1100px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Ocupación de Bodega
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Detalle por camión del día: cuántas CEq cargó cada uno y su % respecto al target de {data?.target ?? 600} CEq.
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
          <div className="space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">% promedio del día</p>
                      <p className={`text-2xl font-bold ${colorPct(data.pct_promedio).text}`}>
                        {fmtN(data.pct_promedio, 1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">de target {data.target} CEq</p>
                    </div>
                    <Target className="size-5 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Viajes</p>
                      <p className="text-2xl font-bold">{data.total_viajes}</p>
                      <p className="text-xs text-muted-foreground">{data.en_meta} en meta (≥ {data.target})</p>
                    </div>
                    <Truck className="size-5 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">CEq total cargado</p>
                      <p className="text-2xl font-bold">{fmtN(data.ceq_total, 1)}</p>
                      <p className="text-xs text-muted-foreground">prom. {fmtN(data.ceq_promedio, 1)} CEq/viaje</p>
                    </div>
                    <Package className="size-5 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Mejor viaje</p>
                    <p className="text-2xl font-bold text-emerald-700">{fmtN(data.ceq_max, 1)}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.patente_top ?? "—"} · min {fmtN(data.ceq_min, 1)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Patente</TableHead>
                    <TableHead className="text-right">CEq</TableHead>
                    <TableHead className="text-right">% target</TableHead>
                    <TableHead className="text-right">Bultos</TableHead>
                    <TableHead className="text-right">HL</TableHead>
                    <TableHead className="text-right">Peso (kg)</TableHead>
                    <TableHead className="text-right">Líneas</TableHead>
                    <TableHead className="text-right">SKUs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.viajes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                        Sin viajes registrados este día
                      </TableCell>
                    </TableRow>
                  ) : data.viajes.map((v, i) => {
                    const c = colorPct(v.ob_pct)
                    return (
                      <TableRow key={v.patente}>
                        <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono font-medium">{v.patente}</TableCell>
                        <TableCell className={`text-right font-semibold ${c.text}`}>
                          {fmtN(v.ceq_total, 1)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={c.text} style={{ borderColor: c.hex }}>
                            {fmtN(v.ob_pct, 1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtN(v.bultos_total, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtN(v.hl_total, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {v.peso_total > 0 ? (
                            (() => {
                              const lim = pesoLimiteKg(v.patente)
                              const excede = v.peso_total > lim
                              const titulo = excede
                                ? `Supera el peso permitido (${fmtN(lim, 0)} kg)`
                                : `Dentro del peso permitido (${fmtN(lim, 0)} kg)`
                              return (
                                <span
                                  className={`inline-flex items-center justify-end gap-1 ${excede ? "font-semibold text-red-600" : ""}`}
                                  title={titulo}
                                >
                                  {fmtN(v.peso_total, 0)}
                                  {excede ? (
                                    <AlertTriangle className="size-4 shrink-0 text-red-600" />
                                  ) : (
                                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                                  )}
                                </span>
                              )
                            })()
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{v.lineas}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{v.skus_distintos}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
