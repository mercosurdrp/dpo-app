"use client"

import { useEffect, useState } from "react"
import { Download, Loader2 } from "lucide-react"
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
import { etiquetaFletero, limpiarNombreChofer } from "@/lib/gescom/etiqueta-fletero"
import { formatHl } from "@/lib/format/rechazos"
import {
  getRechazosResumenDia,
  type RechazosResumenDia,
} from "@/actions/rechazos-resumen-dia"

const META_TASA = 1.7

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
}

export function RechazosDetalleDiaDialog({ open, onOpenChange, fecha }: Props) {
  const [data, setData] = useState<RechazosResumenDia | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    if (!open || !fecha) {
      setData(null)
      setError(null)
      return
    }
    let cancelado = false
    setLoading(true)
    setError(null)
    void getRechazosResumenDia(fecha).then((res) => {
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

  async function descargarPDF() {
    if (!fecha) return
    setPdfLoading(true)
    try {
      const resp = await fetch(
        `/api/reuniones/rechazos-dia-pdf?fecha=${encodeURIComponent(fecha)}`,
        { method: "GET", credentials: "include" },
      )
      if (!resp.ok) {
        const txt = await resp.text()
        throw new Error(txt || `HTTP ${resp.status}`)
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `rechazos_${fecha}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo generar el PDF"
      alert(`Error al descargar: ${msg}`)
    } finally {
      setPdfLoading(false)
    }
  }

  const tasa = data?.kpis.tasa ?? null
  const cumple = tasa != null && tasa <= META_TASA

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1400px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalle de rechazos
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Resumen del día con clientes, motivos, productos y patentes
            involucradas. Descargable en PDF para compartir con ventas.
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
                label="Tasa del día (HL)"
                value={tasa == null ? "—" : `${tasa.toFixed(2)}%`}
                valueClassName={
                  tasa == null
                    ? "text-slate-400"
                    : cumple
                      ? "text-emerald-700"
                      : "text-red-700"
                }
                sub={
                  tasa == null
                    ? "sin ventas"
                    : `${cumple ? "cumple" : "supera"} meta ${META_TASA}%` +
                      (data.kpis.tasa_bultos == null
                        ? ""
                        : ` · bultos ${data.kpis.tasa_bultos.toFixed(2)}%`)
                }
              />
              <KpiCard
                label="HL rechazados"
                value={formatHl(data.kpis.hl_rechazados)}
                sub={`${formatInt(data.kpis.bultos_rechazados)} bultos · ${formatInt(data.kpis.eventos)} eventos`}
              />
              <KpiCard
                label="HL entregados"
                value={formatHl(data.kpis.ventas_total_hl)}
                sub={`${formatInt(data.kpis.ventas_total_bultos)} bultos · total del día`}
              />
              <KpiCard
                label="Patentes involucradas"
                value={formatInt(data.kpis.patentes_con_rechazo)}
                sub="vehículos"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                label="Monto neto perdido"
                value={formatMoney(data.kpis.monto_neto)}
                size="md"
              />
              <KpiCard
                label="Monto bruto perdido"
                value={formatMoney(data.kpis.monto_bruto)}
                size="md"
              />
            </div>

            {/* Top clientes */}
            <Section title="Top 10 clientes con rechazo">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="w-20 text-right">Cód.</TableHead>
                    <TableHead className="w-24 text-right">HL</TableHead>
                    <TableHead className="w-20 text-right">Bultos</TableHead>
                    <TableHead className="w-20 text-right">Eventos</TableHead>
                    <TableHead className="w-28 text-right">Monto neto</TableHead>
                    <TableHead>Motivo principal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_clientes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Sin datos para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {data.top_clientes.map((c, i) => (
                    <TableRow key={`${c.id_cliente ?? "null"}-${i}`}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{c.nombre_cliente}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {c.id_cliente == null ? "—" : c.id_cliente}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatHl(c.hl)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatInt(c.bultos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(c.eventos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(c.monto_neto)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.motivo_principal ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>

            {/* Top motivos */}
            <Section title="Top 10 motivos de rechazo">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="w-24 text-right">HL</TableHead>
                    <TableHead className="w-20 text-right">Bultos</TableHead>
                    <TableHead className="w-20 text-right">Eventos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_motivos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Sin datos para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {data.top_motivos.map((m, i) => (
                    <TableRow key={m.id_rechazo}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{m.ds_rechazo}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {prettyCategoria(m.categoria)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatHl(m.hl)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatInt(m.bultos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(m.eventos)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>

            {/* Top productos */}
            <Section title="Top 10 productos rechazados">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="w-20 text-right">Cód.</TableHead>
                    <TableHead className="w-24 text-right">HL</TableHead>
                    <TableHead className="w-20 text-right">Bultos</TableHead>
                    <TableHead className="w-28 text-right">Monto neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_productos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Sin datos para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {data.top_productos.map((p, i) => (
                    <TableRow key={p.id_articulo}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{p.ds_articulo}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {p.id_articulo}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatHl(p.hl)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatInt(p.bultos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(p.monto_neto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>

            {/* Por patente */}
            <Section
              title="HL rechazados por patente"
              subtitle={`${data.por_patente.length} patente${data.por_patente.length === 1 ? "" : "s"} con rechazo`}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-24">Patente</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead className="w-24 text-right">HL</TableHead>
                    <TableHead className="w-20 text-right">Bultos</TableHead>
                    <TableHead className="w-20 text-right">Eventos</TableHead>
                    <TableHead className="w-28 text-right">Monto neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.por_patente.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Sin datos para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {data.por_patente.map((p, i) => (
                    <TableRow key={p.patente}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {etiquetaFletero(p.patente)}
                      </TableCell>
                      <TableCell>
                        {limpiarNombreChofer(p.chofer_nombre) ?? (
                          <span className="text-muted-foreground italic">(sin asignar)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatHl(p.hl)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatInt(p.bultos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(p.eventos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(p.monto_neto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button onClick={descargarPDF} disabled={pdfLoading}>
                {pdfLoading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Download className="mr-2 size-4" />
                )}
                Descargar PDF
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
  size = "lg",
}: {
  label: string
  value: string
  sub?: string
  valueClassName?: string
  size?: "md" | "lg"
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-bold tabular-nums",
          size === "lg" ? "text-xl" : "text-lg",
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

function formatMoney(n: number): string {
  if (!n) return "$0"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
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

function prettyCategoria(c: string): string {
  return c
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (m) => m.toUpperCase())
}
