"use client"

import { useEffect, useState } from "react"
import { Truck, Loader2, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getTlpMes,
  getTlpDetalleDia,
  type TlpResumen,
  type TlpViajeDetalle,
} from "@/actions/tlp"

function primerDiaMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`
}

function fmt(n: number | null, dec = 2): string {
  if (n == null) return "—"
  return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function SeccionTlp({ fechaReunion }: { fechaReunion: string }) {
  const [data, setData] = useState<TlpResumen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detalleOpen, setDetalleOpen] = useState(false)

  useEffect(() => {
    let vivo = true
    getTlpMes(primerDiaMes(fechaReunion), fechaReunion).then((res) => {
      if (!vivo) return
      if ("error" in res) setError(res.error)
      else setData(res.data)
    })
    return () => {
      vivo = false
    }
  }, [fechaReunion])

  const loading = data === null && error === null
  const maxTlp = data ? Math.max(...data.por_ciudad.map((c) => c.tlp ?? 0), 0) : 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-5 w-5 text-blue-600" />
            TLP — Productividad de la mano de obra de transporte
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Cajas equivalentes entregadas por hora-hombre en ruta (mes a la fecha).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDetalleOpen(true)}
          disabled={loading || !!error}
        >
          Ver viajes del día
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-red-600">Error: {error}</p>
        ) : !data || data.total.viajes === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Sin datos de TLP para este mes todavía (faltan cajas equivalentes, tiempo en
            ruta o registros de salida cruzables).
          </p>
        ) : (
          <div className="space-y-4">
            {/* KPI total */}
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2 rounded-xl border bg-blue-50/50 p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">TLP total</p>
                <p className="text-3xl font-bold text-blue-700">
                  {fmt(data.total.tlp)}{" "}
                  <span className="text-base font-medium text-blue-600">CEq/h</span>
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                <div>{fmt(data.total.ceq, 0)} CEq entregadas</div>
                <div>{fmt(data.total.horas_hombre, 1)} horas-hombre · {data.total.viajes} viajes</div>
              </div>
            </div>

            {/* Por ciudad */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-right">Viajes</TableHead>
                    <TableHead className="text-right">CEq</TableHead>
                    <TableHead className="text-right">Hs-hombre</TableHead>
                    <TableHead className="text-right">TLP (CEq/h)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.por_ciudad.map((c) => (
                    <TableRow key={c.ciudad}>
                      <TableCell className="font-medium">{c.ciudad}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.viajes}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.ceq, 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.horas_hombre, 1)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${maxTlp > 0 ? ((c.tlp ?? 0) / maxTlp) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="font-semibold tabular-nums">{fmt(c.tlp)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Notas de cobertura */}
            {(data.viajes_sin_tiempo > 0 || data.viajes_fte_fallback > 0) && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  {data.viajes_sin_tiempo > 0 && (
                    <div>
                      {data.viajes_sin_tiempo} viaje{data.viajes_sin_tiempo === 1 ? "" : "s"} con
                      cajas pero sin checklist de retorno (no se puede medir su tiempo en ruta) →
                      excluido{data.viajes_sin_tiempo === 1 ? "" : "s"}.
                    </div>
                  )}
                  {data.viajes_fte_fallback > 0 && (
                    <div>
                      {data.viajes_fte_fallback} viaje{data.viajes_fte_fallback === 1 ? "" : "s"} sin
                      registro de salida → FTE estimado en 2 (chofer + 1 ayudante).
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <TlpDetalleDiaDialog
        open={detalleOpen}
        onOpenChange={setDetalleOpen}
        fecha={fechaReunion}
      />
    </Card>
  )
}

function TlpDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  fecha: string
}) {
  const [data, setData] = useState<TlpViajeDetalle[] | null>(null)

  useEffect(() => {
    if (!open) return
    let vivo = true
    getTlpDetalleDia(fecha).then((res) => {
      if (!vivo) return
      setData("error" in res ? [] : res.data)
    })
    return () => {
      vivo = false
    }
  }, [open, fecha])

  const loading = open && data === null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setData(null) // reset al cerrar para recargar la próxima vez
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Viajes del {fecha}</DialogTitle>
          <DialogDescription>
            Detalle del TLP por viaje (patente). Cada viaje se imputa a la ciudad donde
            entregó más cajas.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Sin viajes con datos ese día.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patente</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead className="text-right">CEq</TableHead>
                  <TableHead className="text-right">Hs ruta</TableHead>
                  <TableHead className="text-right">FTE</TableHead>
                  <TableHead className="text-right">TLP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((v) => (
                  <TableRow key={v.patente}>
                    <TableCell className="font-mono font-medium">{v.patente}</TableCell>
                    <TableCell>{v.ciudad}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(v.ceq, 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(v.horas_ruta, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.fte}
                      {v.fte_fallback && <span className="ml-1 text-amber-600" title="Estimado">*</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {v.tlp == null ? "—" : fmt(v.tlp)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">* FTE estimado (sin registro de salida).</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
