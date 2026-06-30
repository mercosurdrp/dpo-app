"use client"

import { useEffect, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Droplets,
  Hourglass,
  Loader2,
  Package,
  PackageX,
} from "lucide-react"
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
import { cn } from "@/lib/utils"
import {
  getFgliPerdidasDia,
  type FgliPerdidasDia,
  type FgliTipoPerdida,
} from "@/actions/fgli-perdidas-dia"

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

type TipoKey = "vencido" | "faltante" | "rotura"

const TIPOS: Array<{
  key: TipoKey
  label: string
  icon: typeof Package
  color: string
}> = [
  { key: "vencido", label: "Vencido", icon: Hourglass, color: "text-violet-700" },
  { key: "faltante", label: "Faltante", icon: PackageX, color: "text-amber-700" },
  { key: "rotura", label: "Rotura", icon: Package, color: "text-red-700" },
]

function SeccionTipo({
  label,
  icon: Icon,
  color,
  tipo,
}: {
  label: string
  icon: typeof Package
  color: string
  tipo: FgliTipoPerdida
}) {
  const [abierto, setAbierto] = useState(false)
  const vacio = tipo.detalle.length === 0

  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={vacio}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition",
          vacio ? "cursor-default bg-slate-50/60" : "hover:bg-slate-50",
        )}
      >
        <span className="flex items-center gap-2">
          {vacio ? (
            <span className="size-4" />
          ) : abierto ? (
            <ChevronDown className="size-4 text-slate-500" />
          ) : (
            <ChevronRight className="size-4 text-slate-500" />
          )}
          <Icon className={cn("size-4", color)} />
          <span className="font-semibold text-slate-800">{label}</span>
          {!vacio && (
            <span className="text-xs text-muted-foreground">
              ({tipo.detalle.length} SKU)
            </span>
          )}
        </span>
        <span className="flex items-center gap-4 text-sm tabular-nums">
          <span className={cn("font-bold", color)}>{fmt(tipo.hl, 2)} HL</span>
          <span className="hidden text-muted-foreground sm:inline">
            {fmt(tipo.bultos, 0)} bul
          </span>
          <span className="font-medium text-slate-700">{fmtPesos(tipo.valor)}</span>
        </span>
      </button>

      {abierto && !vacio && (
        <div className="overflow-x-auto border-t bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Bultos</TableHead>
                <TableHead className="text-right">Unid.</TableHead>
                <TableHead className="text-right">HL</TableHead>
                <TableHead className="text-right">$</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tipo.detalle.map((r) => (
                <TableRow key={r.sku}>
                  <TableCell className="font-mono font-medium">{r.sku}</TableCell>
                  <TableCell
                    className="max-w-[220px] truncate"
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
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(r.hl, 4)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.valor != null ? fmtPesos(r.valor) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function FgliPerdidasDetalleDiaDialog({ open, onOpenChange, fecha }: Props) {
  const [data, setData] = useState<FgliPerdidasDia | null>(null)
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
    void getFgliPerdidasDia(fecha).then((res) => {
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

  const sinPerdidas = data != null && (data.total.hl ?? 0) === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Pérdidas del día (FGLI)
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Total perdido el día y su desglose por categoría (vencido, faltante y
            rotura). Tocá una flecha para ver el detalle por SKU. FGLI = HL
            perdidos = roturas + faltantes + vencidos.
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
            {/* Recuadro central: total perdido (HL / bultos / $) */}
            <Card>
              <CardContent className="grid grid-cols-3 gap-2 pt-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">HL perdidos</p>
                  <p className="flex items-center justify-center gap-1 text-3xl font-bold">
                    <Droplets className="size-5 text-slate-400" />
                    {fmt(data.total.hl, 2)}
                  </p>
                </div>
                <div className="border-x">
                  <p className="text-xs text-muted-foreground">Bultos</p>
                  <p className="text-3xl font-bold">{fmt(data.total.bultos, 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Precio</p>
                  <p className="text-3xl font-bold">{fmtPesos(data.total.valor)}</p>
                </div>
              </CardContent>
            </Card>

            {sinPerdidas ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                No hubo pérdidas registradas ese día. 🎉
              </div>
            ) : (
              <div className="space-y-2">
                {TIPOS.map((t) => (
                  <SeccionTipo
                    key={t.key}
                    label={t.label}
                    icon={t.icon}
                    color={t.color}
                    tipo={data[t.key]}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
