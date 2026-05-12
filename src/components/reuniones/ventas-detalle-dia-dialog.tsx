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
  getVentasResumenDia,
  type VentasResumenDia,
} from "@/actions/ventas-resumen-dia"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
}

export function VentasDetalleDiaDialog({ open, onOpenChange, fecha }: Props) {
  const [data, setData] = useState<VentasResumenDia | null>(null)
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
    void getVentasResumenDia(fecha).then((res) => {
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

  const promedio = data?.promedio_mes_anterior ?? null
  const total = data?.total_bultos ?? 0
  const superaPromedio =
    promedio != null && promedio > 0 ? total >= promedio : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1100px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Bultos vendidos
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Desglose del volumen entregado del día por patente.
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
                label="Bultos del día"
                value={formatInt(data.total_bultos)}
                sub="total entregado"
                valueClassName={
                  superaPromedio == null
                    ? "text-slate-900"
                    : superaPromedio
                      ? "text-emerald-700"
                      : "text-red-700"
                }
              />
              <KpiCard
                label="Patentes con venta"
                value={formatInt(data.patentes_con_venta)}
                sub="vehículos"
              />
              <KpiCard
                label="Promedio mes anterior"
                value={promedio == null ? "—" : formatInt(promedio)}
                sub="bultos/día"
              />
            </div>

            {superaPromedio != null && (
              <div
                className={cn(
                  "rounded-md border p-2 text-xs",
                  superaPromedio
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-800",
                )}
              >
                {superaPromedio ? (
                  <>
                    El día <strong>supera</strong> el promedio del mes anterior
                    por <strong>{formatInt(data.total_bultos - (promedio ?? 0))}</strong> bultos.
                  </>
                ) : (
                  <>
                    El día está <strong>por debajo</strong> del promedio del mes
                    anterior por{" "}
                    <strong>{formatInt((promedio ?? 0) - data.total_bultos)}</strong>{" "}
                    bultos.
                  </>
                )}
              </div>
            )}

            <Section
              title="Bultos por patente"
              subtitle={`${data.por_patente.length} patente${data.por_patente.length === 1 ? "" : "s"} con venta`}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-32">Patente</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead className="w-28 text-right">Bultos</TableHead>
                    <TableHead className="w-24 text-right">% del día</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.por_patente.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground"
                      >
                        Sin ventas para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {data.por_patente.map((p, i) => {
                    const pct =
                      data.total_bultos > 0
                        ? (p.bultos / data.total_bultos) * 100
                        : 0
                    return (
                      <TableRow key={p.patente}>
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {p.patente}
                        </TableCell>
                        <TableCell>
                          {p.chofer_nombre ?? (
                            <span className="italic text-muted-foreground">
                              (sin asignar)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatInt(p.bultos)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {pct.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    )
                  })}
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
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
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
