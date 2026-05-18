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
import {
  getKmRecorridosDia,
  type KmRecorridosDia,
  type KmUnidadDetalle,
} from "@/actions/km-recorridos-dia"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
}

const ESTADO_BADGE: Record<
  KmUnidadDetalle["estado"],
  { label: string; className: string }
> = {
  ok: {
    label: "OK",
    className:
      "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  },
  sin_liberacion: {
    label: "Sin liberación",
    className:
      "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100",
  },
  sin_retorno: {
    label: "Sin retorno",
    className:
      "border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-100",
  },
  invalido: {
    label: "Lectura inválida",
    className: "border-red-200 bg-red-100 text-red-700 hover:bg-red-100",
  },
}

export function KmRecorridosDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
}: Props) {
  const [data, setData] = useState<KmRecorridosDia | null>(null)
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
    void getKmRecorridosDia(fecha).then((res) => {
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

  const sinRetorno =
    data?.detalle.filter((d) => d.estado === "sin_retorno").length ?? 0
  const invalidas =
    data?.detalle.filter((d) => d.estado === "invalido").length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1000px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1000px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Km recorridos
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Detalle por camión: km = odómetro del checklist de retorno −
            odómetro del checklist de liberación.
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
                label="Total del día"
                value={`${formatInt(data.total_km)} km`}
                sub={`${data.unidades_con_km} unidad(es)`}
              />
              <KpiCard
                label="Unidades con km"
                value={formatInt(data.unidades_con_km)}
                sub="con liberación y retorno"
              />
              <KpiCard
                label="Sin retorno"
                value={formatInt(sinRetorno)}
                valueClassName={sinRetorno > 0 ? "text-amber-700" : undefined}
                sub="falta checklist de retorno"
              />
              <KpiCard
                label="Lecturas inválidas"
                value={formatInt(invalidas)}
                valueClassName={invalidas > 0 ? "text-red-700" : undefined}
                sub="odómetro mal cargado"
              />
            </div>

            <Section
              title="Unidades del día"
              subtitle="Km = retorno − liberación"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-32">Dominio</TableHead>
                    <TableHead className="text-right">Odó. salida</TableHead>
                    <TableHead className="text-right">Odó. retorno</TableHead>
                    <TableHead className="w-24 text-right">Km</TableHead>
                    <TableHead className="w-36 text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.detalle.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground"
                      >
                        Sin checklists con odómetro para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {data.detalle.map((d, i) => {
                    const badge = ESTADO_BADGE[d.estado]
                    return (
                      <TableRow key={d.dominio}>
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {d.dominio}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {d.odo_liberacion == null
                            ? "—"
                            : formatInt(d.odo_liberacion)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {d.odo_retorno == null
                            ? "—"
                            : formatInt(d.odo_retorno)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            d.estado === "ok"
                              ? "text-slate-900"
                              : "text-muted-foreground",
                          )}
                        >
                          {d.estado === "ok" && d.km != null
                            ? `${formatInt(d.km)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={badge.className}>
                            {badge.label}
                          </Badge>
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
