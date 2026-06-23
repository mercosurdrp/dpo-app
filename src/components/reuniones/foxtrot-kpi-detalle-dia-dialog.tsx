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
import { getFoxtrotKpiDia } from "@/actions/foxtrot-matinal"
import type {
  FoxtrotKpiDia,
  FoxtrotKpiId,
} from "@/lib/foxtrot/matinal-kpi-types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
  kpiId: FoxtrotKpiId | null
}

export function FoxtrotKpiDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
  kpiId,
}: Props) {
  const [data, setData] = useState<FoxtrotKpiDia | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !fecha || !kpiId) {
      setData(null)
      setError(null)
      return
    }
    let cancelado = false
    setLoading(true)
    setError(null)
    void getFoxtrotKpiDia(fecha, kpiId).then((res) => {
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
  }, [open, fecha, kpiId])

  const conDato = data?.detalle.filter((d) => d.valor != null).length ?? 0
  const sinPatente = data?.detalle.filter((d) => !d.patente).length ?? 0

  const fmtVal = (v: number | null, texto: string | null): string => {
    if (texto != null) return texto
    if (v == null) return "—"
    return `${formatNum(v)}${data?.unidad ? ` ${data.unidad}` : ""}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[900px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[900px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {data?.titulo ?? "Detalle Foxtrot"}
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Detalle por camión (patente del egreso TML del día). El valor del día
            es el que se muestra en el tablero.
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <KpiCard
                label="Valor del día"
                value={
                  data.valor_dia == null
                    ? "—"
                    : `${formatNum(data.valor_dia)} ${data.unidad}`
                }
                sub="igual al del tablero"
              />
              <KpiCard
                label="Camiones con dato"
                value={formatInt(conDato)}
                sub={`de ${data.detalle.length} ruta(s)`}
              />
              <KpiCard
                label="Sin patente"
                value={formatInt(sinPatente)}
                valueClassName={sinPatente > 0 ? "text-amber-700" : undefined}
                sub="sin egreso TML para cruzar"
              />
            </div>

            <Section title="Camiones del día">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-32">Patente</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead className="w-16 text-center">Ruta</TableHead>
                    <TableHead className="w-28 text-right">Valor</TableHead>
                    <TableHead className="w-28 text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.detalle.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground"
                      >
                        Sin rutas de Foxtrot para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {data.detalle.map((d, i) => (
                    <TableRow key={`${d.chofer}-${d.ruta}-${i}`}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.patente ?? (
                          <span className="text-muted-foreground">s/patente</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{d.chofer}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {d.ruta}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          d.valor == null
                            ? "text-muted-foreground"
                            : "text-slate-900",
                        )}
                      >
                        {fmtVal(d.valor, d.texto)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={cn(
                            d.finalizada
                              ? "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                              : "border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-100",
                          )}
                        >
                          {d.finalizada ? "Finalizada" : "Activa"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>

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

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="rounded-md border border-slate-200">{children}</div>
    </div>
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

function formatNum(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)
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
