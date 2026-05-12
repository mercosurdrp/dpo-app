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
  getTmlResumenDia,
  type TmlResumenDia,
} from "@/actions/tml-resumen-dia"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
}

export function TmlDetalleDiaDialog({ open, onOpenChange, fecha }: Props) {
  const [data, setData] = useState<TmlResumenDia | null>(null)
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
    void getTmlResumenDia(fecha).then((res) => {
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

  const cumpleMeta =
    data?.promedio != null && data.promedio <= (data?.meta_minutos ?? 21)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1100px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Tiempo Medio de Liberación (TML)
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Detalle del día: cada egreso registrado con su tiempo de liberación
            en minutos.
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
                label="Promedio del día"
                value={data.promedio == null ? "—" : `${data.promedio} min`}
                valueClassName={
                  data.promedio == null
                    ? "text-slate-400"
                    : cumpleMeta
                      ? "text-emerald-700"
                      : "text-red-700"
                }
                sub={
                  data.promedio == null
                    ? "sin egresos"
                    : cumpleMeta
                      ? `≤ meta ${data.meta_minutos}'`
                      : `> meta ${data.meta_minutos}'`
                }
              />
              <KpiCard
                label="Egresos"
                value={formatInt(data.total_egresos)}
                sub="vehículos liberados"
              />
              <KpiCard
                label="Dentro de meta"
                value={formatInt(data.dentro_meta)}
                sub={`de ${data.total_egresos}`}
              />
              <KpiCard
                label="% dentro de meta"
                value={`${data.pct_dentro_meta}%`}
                valueClassName={
                  data.pct_dentro_meta >= 65
                    ? "text-emerald-700"
                    : "text-red-700"
                }
                sub="≤ 21 min"
              />
            </div>

            <Section
              title="Vehículos del día"
              subtitle={`Ordenados de mayor a menor TML · meta ${data.meta_minutos} min`}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-28">Dominio</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead className="w-24 text-right">Entrada</TableHead>
                    <TableHead className="w-24 text-right">Egreso</TableHead>
                    <TableHead className="w-20 text-right">TML</TableHead>
                    <TableHead className="w-24 text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.registros.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground"
                      >
                        Sin egresos registrados para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {data.registros.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.dominio}
                      </TableCell>
                      <TableCell>{r.chofer}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {String(r.hora_entrada).padStart(2, "0")}:00
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatHora(r.hora_egreso)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          r.dentro_meta ? "text-emerald-700" : "text-red-700",
                        )}
                      >
                        {r.tml_minutos} min
                      </TableCell>
                      <TableCell className="text-center">
                        {r.dentro_meta ? (
                          <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            En meta
                          </Badge>
                        ) : (
                          <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
                            Fuera
                          </Badge>
                        )}
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

function formatHora(t: string): string {
  // "HH:MM:SS" → "HH:MM"
  return t?.slice(0, 5) ?? "—"
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
