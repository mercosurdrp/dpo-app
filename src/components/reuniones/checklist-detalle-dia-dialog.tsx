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
import {
  getChecklistResumenDia,
  type ChecklistResumenDia,
} from "@/actions/checklist-resumen-dia"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
}

export function ChecklistDetalleDiaDialog({ open, onOpenChange, fecha }: Props) {
  const [data, setData] = useState<ChecklistResumenDia | null>(null)
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
    void getChecklistResumenDia(fecha).then((res) => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1100px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Checklist de liberación
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Detalle del día: cada unidad liberada con el resultado de su
            checklist y los ítems que no aprobaron.
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
                label="Camiones a la calle"
                value={formatInt(data.camiones)}
                sub="unidades únicas"
              />
              <KpiCard
                label="Checklists"
                value={`${data.aprobados}/${data.total_checklists}`}
                valueClassName={
                  data.rechazados === 0 ? "text-emerald-700" : "text-amber-700"
                }
                sub="aprobados / total"
              />
              <KpiCard
                label="Rechazados"
                value={formatInt(data.rechazados)}
                valueClassName={
                  data.rechazados > 0 ? "text-red-700" : "text-slate-900"
                }
                sub="con ítem crítico en falla"
              />
              <KpiCard
                label="Sin checklist"
                value={formatInt(data.sin_checklist.length)}
                valueClassName={
                  data.sin_checklist.length > 0
                    ? "text-red-700"
                    : "text-slate-900"
                }
                sub="salieron sin liberar"
              />
            </div>

            <Section
              title="Unidades del día"
              subtitle={`${data.checklists.length} checklist(s) de liberación`}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-28">Dominio</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead className="w-20 text-right">Hora</TableHead>
                    <TableHead className="w-28 text-center">Resultado</TableHead>
                    <TableHead>Ítems que no aprobaron</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.checklists.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground"
                      >
                        Sin checklists de liberación para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {data.checklists.map((c, i) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.dominio}
                      </TableCell>
                      <TableCell>{c.chofer}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatHora(c.hora)}
                      </TableCell>
                      <TableCell className="text-center">
                        {c.resultado === "aprobado" ? (
                          <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            <CheckCircle2 className="mr-1 size-3" />
                            Aprobado
                          </Badge>
                        ) : (
                          <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
                            <XCircle className="mr-1 size-3" />
                            Rechazado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.items_fallados.length === 0 ? (
                          <span className="text-xs text-emerald-700">
                            Todos los ítems OK
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.items_fallados.map((it, k) => (
                              <Badge
                                key={k}
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-normal",
                                  it.critico
                                    ? "border-red-300 bg-red-50 text-red-700"
                                    : "border-amber-300 bg-amber-50 text-amber-700",
                                )}
                                title={
                                  (it.critico ? "Ítem crítico · " : "") +
                                  `${it.categoria}` +
                                  (it.comentario ? ` · ${it.comentario}` : "")
                                }
                              >
                                {it.critico && (
                                  <AlertTriangle className="mr-1 size-3" />
                                )}
                                {it.nombre}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>

            {data.sin_checklist.length > 0 && (
              <Section
                title="Salieron sin checklist"
                subtitle="Egreso registrado en TML sin checklist de liberación"
              >
                <div className="flex flex-wrap gap-2 p-3">
                  {data.sin_checklist.map((dom) => (
                    <Badge
                      key={dom}
                      className="border-red-200 bg-red-100 font-mono text-xs text-red-700 hover:bg-red-100"
                    >
                      <AlertTriangle className="mr-1 size-3" />
                      {dom}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

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

function formatHora(iso: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d)
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
