"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react"
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
import { getChecksDetalleDia } from "@/actions/checks-detalle-dia"
import type { CloudfleetChecksDetalleDia } from "@/lib/cloudfleet/checks-serie"
import type { MisionesSucursal } from "@/lib/foxtrot/auto-indicadores-misiones"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
  sucursal: MisionesSucursal
}

export function ChecksDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
  sucursal,
}: Props) {
  const [data, setData] = useState<CloudfleetChecksDetalleDia | null>(null)
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
    void getChecksDetalleDia(fecha, sucursal).then((res) => {
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
  }, [open, fecha, sucursal])

  const incompletos = data?.camiones.filter((c) => c.incompleto).length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[900px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[900px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Checks de flota
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Cada camión debe tener una liberación y un retorno. Acá se ve el
            estado de ambos por camión y quién quedó incompleto.
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="Liberaciones"
                value={`${data.lib_aprobadas}/${data.lib_total}`}
                valueClassName={
                  data.lib_rechazadas === 0
                    ? "text-emerald-700"
                    : "text-amber-700"
                }
                sub="aprobadas / total"
              />
              <KpiCard
                label="Retornos"
                value={formatInt(data.ret_total)}
                sub="camiones con retorno"
              />
              <KpiCard
                label="Sin liberación"
                value={formatInt(data.sin_liberacion.length)}
                valueClassName={
                  data.sin_liberacion.length > 0
                    ? "text-red-700"
                    : "text-slate-900"
                }
                sub="salieron sin liberar"
              />
              <KpiCard
                label="Sin retorno"
                value={formatInt(data.sin_retorno.length)}
                valueClassName={
                  data.sin_retorno.length > 0
                    ? "text-amber-700"
                    : "text-slate-900"
                }
                sub="sin cerrar el día"
              />
            </div>

            <Section
              title="Camiones del día"
              subtitle={
                incompletos > 0
                  ? `${data.camiones.length} camión(es) · ${incompletos} incompleto(s)`
                  : `${data.camiones.length} camión(es) · todos completos`
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-32">Dominio</TableHead>
                    <TableHead className="w-28">Sucursal</TableHead>
                    <TableHead className="w-36 text-center">
                      Liberación
                    </TableHead>
                    <TableHead className="w-36 text-center">Retorno</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.camiones.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground"
                      >
                        Sin checks de flota para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {data.camiones.map((c, i) => (
                    <TableRow
                      key={c.dominio}
                      className={cn(c.incompleto && "bg-red-50/40")}
                    >
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.dominio}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.sucursal ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <EstadoBadge tipo="liberacion" estado={c.liberacion} />
                      </TableCell>
                      <TableCell className="text-center">
                        <EstadoBadge tipo="retorno" estado={c.retorno} />
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

function EstadoBadge({
  tipo,
  estado,
}: {
  tipo: "liberacion" | "retorno"
  estado: string
}) {
  if (estado === "aprobada") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <CheckCircle2 className="mr-1 size-3" />
        Aprobada
      </Badge>
    )
  }
  if (estado === "rechazada") {
    return (
      <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
        <XCircle className="mr-1 size-3" />
        Rechazada
      </Badge>
    )
  }
  if (estado === "presente") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <CheckCircle2 className="mr-1 size-3" />
        OK
      </Badge>
    )
  }
  // ausente
  return (
    <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
      <AlertTriangle className="mr-1 size-3" />
      {tipo === "liberacion" ? "Sin liberación" : "Sin retorno"}
    </Badge>
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
      {sub && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
      )}
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
