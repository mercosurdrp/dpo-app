"use client"

import { useEffect, useState } from "react"
import { Loader2, Star } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  getRmdResumenDia,
  type RmdResumenDia,
  type RmdCategoria,
} from "@/actions/rmd-resumen-dia"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
}

export function RmdDetalleDiaDialog({ open, onOpenChange, fecha }: Props) {
  const [data, setData] = useState<RmdResumenDia | null>(null)
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
    void getRmdResumenDia(fecha).then((res) => {
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

  const prom = data?.kpis.promedio ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1100px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalle de RMD
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Puntuaciones de los clientes ese día (Rate My Delivery, Power BI
            Quilmes). Agrupado por fecha de puntuación.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando detalle…
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
              <KpiCard
                label="RMD del día"
                value={prom == null ? "—" : prom.toFixed(2)}
                valueClassName={
                  prom == null
                    ? "text-slate-400"
                    : prom >= 4.5
                      ? "text-emerald-700"
                      : prom >= 4
                        ? "text-amber-700"
                        : "text-red-700"
                }
                sub={`${formatInt(data.kpis.n)} puntuacion${data.kpis.n === 1 ? "" : "es"}`}
              />
              <KpiCard
                label="Promotores"
                value={formatInt(data.kpis.promotores)}
                sub="puntaje 5"
                valueClassName="text-emerald-700"
              />
              <KpiCard
                label="Neutros"
                value={formatInt(data.kpis.neutros)}
                sub="puntaje 4"
                valueClassName="text-amber-700"
              />
              <KpiCard
                label="Detractores"
                value={formatInt(data.kpis.detractores)}
                sub={
                  data.kpis.pct_detractores == null
                    ? "puntaje 1-3"
                    : `${data.kpis.pct_detractores.toFixed(1)}% · puntaje 1-3`
                }
                valueClassName={
                  data.kpis.detractores > 0 ? "text-red-700" : "text-slate-900"
                }
              />
            </div>

            {/* Clientes */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Clientes que puntuaron
                </h3>
                <span className="text-xs text-muted-foreground">
                  {data.clientes.length} cliente
                  {data.clientes.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="rounded-md border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="w-20 text-right">Cód.</TableHead>
                      <TableHead className="w-24 text-center">Puntaje</TableHead>
                      <TableHead className="w-28">Categoría</TableHead>
                      <TableHead>Motivo / Comentario</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.clientes.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground"
                        >
                          Sin puntuaciones cargadas para este día
                        </TableCell>
                      </TableRow>
                    )}
                    {data.clientes.map((c, i) => (
                      <TableRow key={`${c.cod_cliente ?? "null"}-${i}`}>
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {c.nombre_cliente}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {c.cod_cliente == null ? "—" : c.cod_cliente}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                            {c.puntuacion}
                            <Star className="size-3 fill-amber-400 text-amber-400" />
                          </span>
                        </TableCell>
                        <TableCell>
                          <CategoriaBadge categoria={c.categoria} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[c.motivos, c.comentario].filter(Boolean).join(" · ") ||
                            "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-4">
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

function CategoriaBadge({ categoria }: { categoria: RmdCategoria }) {
  const map: Record<RmdCategoria, { label: string; className: string }> = {
    promotor: {
      label: "Promotor",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    neutro: {
      label: "Neutro",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    detractor: {
      label: "Detractor",
      className: "border-red-200 bg-red-50 text-red-700",
    },
  }
  const m = map[categoria]
  return (
    <Badge variant="outline" className={cn("text-xs", m.className)}>
      {m.label}
    </Badge>
  )
}

function KpiCard({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string
  value: string
  sub?: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          valueClassName ?? "text-slate-900",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}

function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  const diaSem = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ][dt.getUTCDay()]
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ]
  const pretty = `${diaSem} ${d} de ${meses[m - 1]} ${y}`
  return pretty.charAt(0).toUpperCase() + pretty.slice(1)
}
