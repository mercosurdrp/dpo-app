"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
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
import { getTlpDetalleDia, type TlpViajeDetalle } from "@/actions/tlp"

function fmt(n: number | null, dec = 2): string {
  if (n == null) return "—"
  return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

interface CiudadAgg {
  ciudad: string
  viajes: number
  ceq: number
  horas_hombre: number
  tlp: number | null
}

function agruparPorCiudad(viajes: TlpViajeDetalle[]): CiudadAgg[] {
  const m = new Map<string, CiudadAgg>()
  for (const v of viajes) {
    const a = m.get(v.ciudad) ?? { ciudad: v.ciudad, viajes: 0, ceq: 0, horas_hombre: 0, tlp: null }
    a.viajes += 1
    a.ceq += v.ceq
    a.horas_hombre += v.horas_hombre
    m.set(v.ciudad, a)
  }
  const out = [...m.values()].map((a) => ({
    ...a,
    ceq: Math.round(a.ceq),
    horas_hombre: Math.round(a.horas_hombre * 10) / 10,
    tlp: a.horas_hombre > 0 ? Math.round((a.ceq / a.horas_hombre) * 100) / 100 : null,
  }))
  out.sort((a, b) => b.ceq - a.ceq)
  return out
}

export function TlpDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  fecha: string | null
}) {
  const [data, setData] = useState<TlpViajeDetalle[] | null>(null)

  useEffect(() => {
    if (!open || !fecha) return
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
  const porCiudad = data ? agruparPorCiudad(data) : []

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setData(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>TLP del {fecha ?? ""}</DialogTitle>
          <DialogDescription>
            Cajas equivalentes por hora-hombre, dividido por ciudad y por viaje (patente).
            Cada viaje se imputa a la ciudad donde entregó más cajas.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Sin viajes con datos ese día.</p>
        ) : (
          <div className="space-y-5">
            {/* Por ciudad */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Por ciudad
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ciudad</TableHead>
                      <TableHead className="text-right">Viajes</TableHead>
                      <TableHead className="text-right">CEq</TableHead>
                      <TableHead className="text-right">Hs-hombre</TableHead>
                      <TableHead className="text-right">TLP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porCiudad.map((c) => (
                      <TableRow key={c.ciudad}>
                        <TableCell className="font-medium">{c.ciudad}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.viajes}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.ceq, 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.horas_hombre, 1)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{fmt(c.tlp)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Por viaje */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Por viaje
              </p>
              <div className="max-h-[40vh] overflow-y-auto">
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
                          {v.fte_fallback && <span className="ml-0.5 text-amber-600" title="Estimado">*</span>}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{fmt(v.tlp)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                * FTE estimado en 2 (sin registro de salida cargado).
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
