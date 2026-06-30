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

/** % consumido del presupuesto (real ÷ presup). Verde si está dentro, rojo si
 *  se pasó. Menos pérdida que lo presupuestado es bueno. */
function compara(
  real: number | null,
  presup: number | null,
): { pct: string; clase: string } {
  if (real == null || presup == null || presup <= 0)
    return { pct: "", clase: "text-slate-400" }
  const p = Math.round((real / presup) * 100)
  return {
    pct: `${p}% del presup.`,
    clase: real <= presup ? "text-emerald-700" : "text-red-700",
  }
}

const TIPOS: Array<{
  key: "vencido" | "faltante" | "rotura"
  label: string
  icon: typeof Package
  color: string
  ppmLabel: string
}> = [
  { key: "vencido", label: "Vencido", icon: Hourglass, color: "text-violet-700", ppmLabel: "PPM" },
  { key: "faltante", label: "Faltante", icon: PackageX, color: "text-amber-700", ppmLabel: "PPM" },
  { key: "rotura", label: "Rotura", icon: Package, color: "text-red-700", ppmLabel: "WQI" },
]

function SeccionTipo({
  label,
  icon: Icon,
  color,
  ppmLabel,
  tipo,
}: {
  label: string
  icon: typeof Package
  color: string
  ppmLabel: string
  tipo: FgliTipoPerdida
}) {
  const [abierto, setAbierto] = useState(false)
  const [vista, setVista] = useState<"mes" | "dia">("mes")
  const vacio = tipo.detalle.length === 0 && tipo.detalle_mes.length === 0
  const cmpHl = compara(tipo.mtd_hl, tipo.presup_hl)
  const filas = vista === "mes" ? tipo.detalle_mes : tipo.detalle

  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={vacio}
        className={cn(
          "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition",
          vacio ? "cursor-default" : "hover:bg-slate-50",
        )}
      >
        <div className="flex items-center justify-between gap-2">
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
          <span className="flex items-baseline gap-2 tabular-nums">
            <span className={cn("text-lg font-bold", color)}>
              {fmt(tipo.hl, 2)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">HL</span>
            </span>
            <span className="text-sm font-semibold text-slate-600">
              {fmt(tipo.ppm, 0)}
              <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
                {ppmLabel}
              </span>
            </span>
          </span>
        </div>

        {/* Comparación del mes (real acumulado vs presupuesto) */}
        <div className="flex items-center justify-between pl-6 text-xs tabular-nums">
          <span className="text-muted-foreground">
            Mes: <b className="text-slate-700">{fmt(tipo.mtd_hl, 2)}</b> /{" "}
            {fmt(tipo.presup_hl, 2)} HL presup.
            <span className="mx-1 text-slate-300">·</span>
            <b className="text-slate-700">{fmt(tipo.mtd_ppm, 0)}</b> /{" "}
            {fmt(tipo.presup_ppm, 0)} {ppmLabel} presup.
          </span>
          {cmpHl.pct && (
            <span className={cn("font-semibold", cmpHl.clase)}>{cmpHl.pct}</span>
          )}
        </div>
      </button>

      {abierto && !vacio && (
        <div className="border-t bg-white">
          {/* Toggle día / mes acumulado */}
          <div className="flex items-center gap-1 px-3 py-2 text-xs">
            <span className="mr-1 text-muted-foreground">Detalle por SKU:</span>
            <button
              type="button"
              onClick={() => setVista("mes")}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition",
                vista === "mes"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              Mes acumulado
            </button>
            <button
              type="button"
              onClick={() => setVista("dia")}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition",
                vista === "dia"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              Solo el día
            </button>
          </div>
          {filas.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-muted-foreground">
              {vista === "dia"
                ? `Sin ${label.toLowerCase()}s registradas ese día.`
                : `Sin ${label.toLowerCase()}s en el mes.`}
            </p>
          ) : (
            <div className="overflow-x-auto">
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
                  {filas.map((r) => (
                    <TableRow key={r.sku}>
                      <TableCell className="font-mono font-medium">
                        {r.sku}
                      </TableCell>
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
  const cmpFgli = data ? compara(data.total.mtd_hl, data.total.presup_hl) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[780px] overflow-y-auto">
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
            Total perdido el día y desglose por categoría (vencido, faltante,
            rotura), con el acumulado del mes contra el presupuesto. Tocá una
            flecha para ver el detalle por SKU. El PPM de la rotura es el WQI.
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
            {/* Recuadro central: total perdido del día (HL / bultos / $) */}
            <Card>
              <CardContent className="space-y-2 pt-4">
                <div className="grid grid-cols-3 gap-2 text-center">
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
                </div>
                {/* FGLI acumulado del mes vs presupuesto */}
                <div className="flex items-center justify-between border-t pt-2 text-xs tabular-nums">
                  <span className="text-muted-foreground">
                    FGLI mes:{" "}
                    <b className="text-slate-700">{fmt(data.total.mtd_hl, 2)}</b> /{" "}
                    {fmt(data.total.presup_hl, 2)} HL presup.
                  </span>
                  {cmpFgli?.pct && (
                    <span className={cn("font-semibold", cmpFgli.clase)}>
                      {cmpFgli.pct}
                    </span>
                  )}
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
                    ppmLabel={t.ppmLabel}
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
