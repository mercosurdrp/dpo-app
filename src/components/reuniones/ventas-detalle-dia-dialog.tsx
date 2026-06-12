"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
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

type Metrica = "bultos" | "hl"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
  metrica: Metrica
}

interface MetricaCfg {
  label: string
  unidad: string
  total: (d: VentasResumenDia) => number
  promedio: (d: VentasResumenDia) => number | null
  porPatente: (
    d: VentasResumenDia,
  ) => Array<{ patente: string; chofer_nombre: string | null; valor: number }>
  formatValor: (n: number) => string
}

const CONFIG: Record<Metrica, MetricaCfg> = {
  bultos: {
    label: "Bultos vendidos",
    unidad: "bultos",
    total: (d) => d.total_bultos,
    promedio: (d) => d.promedio_bultos_mes_anterior,
    porPatente: (d) =>
      d.por_patente.map((p) => ({
        patente: p.patente,
        chofer_nombre: p.chofer_nombre,
        valor: p.bultos,
      })),
    formatValor: (n) =>
      new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n),
  },
  hl: {
    label: "HL vendidos",
    unidad: "HL",
    total: (d) => d.total_hl,
    promedio: (d) => d.promedio_hl_mes_anterior,
    porPatente: (d) =>
      d.por_patente
        .map((p) => ({
          patente: p.patente,
          chofer_nombre: p.chofer_nombre,
          valor: p.hl,
        }))
        .sort((a, b) => b.valor - a.valor),
    formatValor: (n) =>
      new Intl.NumberFormat("es-AR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(n),
  },
}

export function VentasDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
  metrica,
}: Props) {
  const [data, setData] = useState<VentasResumenDia | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [origenAbierto, setOrigenAbierto] = useState<"chess" | "gestion" | null>(null)

  useEffect(() => {
    if (!open || !fecha) {
      setData(null)
      setError(null)
      setOrigenAbierto(null)
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

  const cfg = CONFIG[metrica]
  const total = data ? cfg.total(data) : 0
  const promedio = data ? cfg.promedio(data) : null
  const superaPromedio =
    promedio != null && promedio > 0 ? total >= promedio : null
  const filas = data ? cfg.porPatente(data) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1100px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {cfg.label}
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Desglose del volumen entregado del día por patente
            {metrica === "hl" ? " (en hectolitros)" : ""}.
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
                label={`${cfg.label} del día`}
                value={`${cfg.formatValor(total)} ${cfg.unidad}`}
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
                value={
                  promedio == null
                    ? "—"
                    : `${cfg.formatValor(promedio)} ${cfg.unidad}`
                }
                sub={`${cfg.unidad}/día`}
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
                    por{" "}
                    <strong>
                      {cfg.formatValor(total - (promedio ?? 0))} {cfg.unidad}
                    </strong>
                    .
                  </>
                ) : (
                  <>
                    El día está <strong>por debajo</strong> del promedio del mes
                    anterior por{" "}
                    <strong>
                      {cfg.formatValor((promedio ?? 0) - total)} {cfg.unidad}
                    </strong>
                    .
                  </>
                )}
              </div>
            )}

            {data.por_origen.length > 0 && (
              <Section
                title="Por origen (Chess / Gestión)"
                subtitle="Tocá un origen para ver el detalle por camión y por SKU"
              >
                <div className="divide-y divide-slate-100">
                  {data.por_origen.map((o) => {
                    const valor = metrica === "hl" ? o.hl : o.bultos
                    const pct = total > 0 ? (valor / total) * 100 : 0
                    const abierto = origenAbierto === o.origen
                    const label = o.origen === "gestion" ? "Gestión" : "Chess"
                    return (
                      <div key={o.origen}>
                        <button
                          type="button"
                          onClick={() => setOrigenAbierto(abierto ? null : o.origen)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                        >
                          {abierto ? (
                            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-xs font-semibold",
                              o.origen === "gestion"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-sky-100 text-sky-800",
                            )}
                          >
                            {label}
                          </span>
                          <span className="ml-auto font-semibold tabular-nums">
                            {cfg.formatValor(valor)} {cfg.unidad}
                          </span>
                          <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                            {pct.toFixed(1)}%
                          </span>
                        </button>
                        {abierto && (
                          <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 pb-3 pt-1">
                            <div>
                              <h4 className="mb-1 mt-2 text-xs font-semibold text-slate-700">
                                Por camión ({o.patentes.length})
                              </h4>
                              {o.patentes.length === 0 ? (
                                <p className="py-2 text-center text-xs text-muted-foreground">
                                  Sin detalle por camión para este día.
                                </p>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-10">#</TableHead>
                                      <TableHead className="w-32">
                                        {o.origen === "gestion" ? "Reparto" : "Patente"}
                                      </TableHead>
                                      <TableHead>Chofer</TableHead>
                                      <TableHead className="w-28 text-right">{cfg.unidad}</TableHead>
                                      <TableHead className="w-20 text-right">% origen</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {o.patentes.map((p, i) => {
                                      const pv = metrica === "hl" ? p.hl : p.bultos
                                      const pPct = valor > 0 ? (pv / valor) * 100 : 0
                                      return (
                                        <TableRow key={p.patente}>
                                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                                          <TableCell className="font-mono text-xs">
                                            {p.patente.replace(/^GESTION-/, "Rep. ")}
                                          </TableCell>
                                          <TableCell>
                                            {p.chofer_nombre?.replace(/ \(Gestión\)$/, "") ?? (
                                              <span className="italic text-muted-foreground">
                                                (sin asignar)
                                              </span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right font-medium tabular-nums">
                                            {cfg.formatValor(pv)}
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums text-muted-foreground">
                                            {pPct.toFixed(1)}%
                                          </TableCell>
                                        </TableRow>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                            <h4 className="mb-1 text-xs font-semibold text-slate-700">
                              Por SKU ({o.skus.length})
                            </h4>
                            {o.skus.length === 0 ? (
                              <p className="py-3 text-center text-xs text-muted-foreground">
                                Sin detalle por SKU para este día (se genera con el sync diario).
                              </p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-10">#</TableHead>
                                    <TableHead>Artículo</TableHead>
                                    <TableHead className="w-28 text-right">{cfg.unidad}</TableHead>
                                    <TableHead className="w-20 text-right">% origen</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {o.skus.map((s, i) => {
                                    const sv = metrica === "hl" ? s.hl : s.bultos
                                    const sPct = valor > 0 ? (sv / valor) * 100 : 0
                                    return (
                                      <TableRow key={s.id_articulo}>
                                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                                        <TableCell>
                                          {s.ds_articulo}
                                          <span className="ml-1 text-xs text-muted-foreground">
                                            #{s.id_articulo}
                                          </span>
                                        </TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">
                                          {cfg.formatValor(sv)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-muted-foreground">
                                          {sPct.toFixed(1)}%
                                        </TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            <Section
              title={`${cfg.label === "HL vendidos" ? "HL" : "Bultos"} por patente`}
              subtitle={`${filas.length} patente${filas.length === 1 ? "" : "s"} con venta`}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-32">Patente</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead className="w-28 text-right">
                      {cfg.unidad}
                    </TableHead>
                    <TableHead className="w-24 text-right">% del día</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground"
                      >
                        Sin ventas para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {filas.map((p, i) => {
                    const pct = total > 0 ? (p.valor / total) * 100 : 0
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
                          {cfg.formatValor(p.valor)}
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
