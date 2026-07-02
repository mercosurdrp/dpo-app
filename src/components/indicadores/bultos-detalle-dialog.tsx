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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getDetalleBultosFamilia } from "@/actions/cuadro-mensual"
import {
  nombreMes,
} from "@/lib/indicadores/cuadro-mensual"
import type { DetalleBultos } from "@/lib/indicadores/cuadro-mensual-detalle"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "YYYY-MM" del mes clickeado. */
  mes: string | null
  /** Total de bultos de la celda (para mostrar y contrastar el cuadre). */
  bultosCelda: number | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
const fmtPct = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n)

export function BultosDetalleDialog({
  open,
  onOpenChange,
  mes,
  bultosCelda,
}: Props) {
  const [familia, setFamilia] = useState<DetalleBultos | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !mes) return
    let cancelado = false
    setLoading(true)
    setError(null)
    setFamilia(null)
    getDetalleBultosFamilia(mes)
      .then((res) => {
        if (cancelado) return
        if ("error" in res) setError(res.error)
        else setFamilia(res.data)
      })
      .catch((e) => !cancelado && setError(String(e)))
      .finally(() => !cancelado && setLoading(false))
    return () => {
      cancelado = true
    }
  }, [open, mes])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Bultos distribuidos — {mes ? nombreMes(mes) : ""}
          </DialogTitle>
          <DialogDescription>
            {bultosCelda !== null
              ? `${fmt(bultosCelda)} bultos en el mes`
              : "Detalle del mes"}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="familia">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="zona">Por zona</TabsTrigger>
            <TabsTrigger value="familia">Por familia</TabsTrigger>
          </TabsList>

          {/* Por familia */}
          <TabsContent value="familia">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
              </div>
            ) : error ? (
              <p className="py-6 text-center text-sm text-red-600">{error}</p>
            ) : familia ? (
              <DetalleTabla data={familia} bultosCelda={bultosCelda} />
            ) : null}
          </TabsContent>

          {/* Por zona (Ramallo vs Pergamino) — Etapa 2 */}
          <TabsContent value="zona">
            <div className="space-y-2 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                Ramallo vs Pergamino — en preparación
              </p>
              <p className="mx-auto max-w-sm text-xs text-muted-foreground">
                El desglose por zona (supervisor de ventas: Caballero / Petrillo)
                requiere sincronizar las ventas por supervisor. Se habilita en la
                próxima etapa.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function DetalleTabla({
  data,
  bultosCelda,
}: {
  data: DetalleBultos
  bultosCelda: number | null
}) {
  // Diferencia con la celda (la celda viene de ventas_diarias; el desglose de
  // ventas_diarias_sku — difieren <0,1% por redondeo de SKU).
  const dif =
    bultosCelda !== null && bultosCelda > 0
      ? ((data.total - bultosCelda) / bultosCelda) * 100
      : 0
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Familia</TableHead>
            <TableHead className="text-right">Bultos</TableHead>
            <TableHead className="text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((it) => (
            <TableRow key={it.label}>
              <TableCell className="font-medium">{it.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {fmt(it.bultos)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {fmtPct(it.pct)}%
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 font-semibold">
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt(data.total)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              100,0%
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {bultosCelda !== null && Math.abs(dif) >= 0.1 && (
        <p className="mt-2 text-xs text-muted-foreground">
          El total del desglose (por SKU) difiere {fmtPct(Math.abs(dif))}% del
          número de la celda por redondeos de SKU.
        </p>
      )}
    </>
  )
}
