"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, Package } from "lucide-react"
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
import { etiquetaChofer, etiquetaFletero, limpiarNombreChofer } from "@/lib/gescom/etiqueta-fletero"
import {
  getVentasResumenDia,
  getVentasCamionSkuDia,
  type VentasResumenDia,
  type CamionSkuDetalle,
} from "@/actions/ventas-resumen-dia"

type Metrica = "bultos" | "hl"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
  /** Métrica por la que se ordena y se resalta. El diálogo siempre muestra
   *  bultos Y HL lado a lado; `metrica` solo define el orden y el énfasis. */
  metrica: Metrica
}

// Formateadores: bultos enteros, HL con 1 decimal.
const fmtBultos = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
const fmtHl = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n)

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
  const [filtroCliente, setFiltroCliente] = useState("")
  const [verTodosClientes, setVerTodosClientes] = useState(false)
  // Camión seleccionado para ver su detalle por SKU en un modal.
  const [camionSel, setCamionSel] = useState<{
    patente: string
    label: string
    chofer: string | null
  } | null>(null)

  useEffect(() => {
    if (!open || !fecha) {
      setData(null)
      setError(null)
      setOrigenAbierto(null)
      setFiltroCliente("")
      setVerTodosClientes(false)
      setCamionSel(null)
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

  // Énfasis y orden según la métrica con la que se abrió el diálogo.
  const esHl = metrica === "hl"
  const valorPrimario = (v: { bultos: number; hl: number }) =>
    esHl ? v.hl : v.bultos
  const fmtPrimario = esHl ? fmtHl : fmtBultos
  const unidadPrimaria = esHl ? "HL" : "bultos"
  const totalPrimario = data ? (esHl ? data.total_hl : data.total_bultos) : 0
  const promedio = data
    ? esHl
      ? data.promedio_hl_mes_anterior
      : data.promedio_bultos_mes_anterior
    : null
  const superaPromedio =
    promedio != null && promedio > 0 ? totalPrimario >= promedio : null
  const patentes = data
    ? [...data.por_patente].sort((a, b) => valorPrimario(b) - valorPrimario(a))
    : []

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1100px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Ventas del día
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Bultos y HL entregados del día, por camión, SKU y cliente.
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
                value={`${fmtBultos(data.total_bultos)} bultos`}
                sub="total entregado"
                valueClassName={
                  !esHl && superaPromedio != null
                    ? superaPromedio
                      ? "text-emerald-700"
                      : "text-red-700"
                    : "text-slate-900"
                }
              />
              <KpiCard
                label="HL del día"
                value={`${fmtHl(data.total_hl)} HL`}
                sub="total entregado"
                valueClassName={
                  esHl && superaPromedio != null
                    ? superaPromedio
                      ? "text-emerald-700"
                      : "text-red-700"
                    : "text-slate-900"
                }
              />
              <KpiCard
                label="Patentes con venta"
                value={formatInt(data.patentes_con_venta)}
                sub="vehículos"
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
                      {fmtPrimario(totalPrimario - (promedio ?? 0))}{" "}
                      {unidadPrimaria}
                    </strong>
                    .
                  </>
                ) : (
                  <>
                    El día está <strong>por debajo</strong> del promedio del mes
                    anterior por{" "}
                    <strong>
                      {fmtPrimario((promedio ?? 0) - totalPrimario)}{" "}
                      {unidadPrimaria}
                    </strong>
                    .
                  </>
                )}
              </div>
            )}

            {data.por_origen.length > 0 && (
              <Section
                title="Detalle por camión y SKU"
                subtitle="Tocá para ver el detalle por camión y por SKU"
              >
                <div className="divide-y divide-slate-100">
                  {data.por_origen.map((o) => {
                    const valor = valorPrimario(o)
                    const pct = totalPrimario > 0 ? (valor / totalPrimario) * 100 : 0
                    const abierto = origenAbierto === o.origen
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
                          <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                            Chess
                          </span>
                          <span className="ml-auto font-semibold tabular-nums">
                            {fmtBultos(o.bultos)} bultos
                            <span className="mx-1 text-muted-foreground">·</span>
                            {fmtHl(o.hl)} HL
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
                                <span className="ml-2 font-normal text-muted-foreground">
                                  tocá un camión para ver sus SKU
                                </span>
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
                                      <TableHead className="w-24 text-right">Bultos</TableHead>
                                      <TableHead className="w-24 text-right">HL</TableHead>
                                      <TableHead className="w-20 text-right">% origen</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {o.patentes.map((p, i) => {
                                      const pPct =
                                        valor > 0 ? (valorPrimario(p) / valor) * 100 : 0
                                      const label = etiquetaFletero(p.patente, {
                                        chofer: p.chofer_nombre,
                                      })
                                      return (
                                        <TableRow
                                          key={p.patente}
                                          onClick={() =>
                                            setCamionSel({ patente: p.patente, label, chofer: p.chofer_nombre })
                                          }
                                          className="cursor-pointer transition-colors hover:bg-sky-50"
                                          title="Ver detalle por SKU de este camión"
                                        >
                                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                                          <TableCell className="font-mono text-xs">
                                            <span className="inline-flex items-center gap-1 text-sky-700 underline-offset-2 hover:underline">
                                              <Package className="size-3" />
                                              {label}
                                            </span>
                                          </TableCell>
                                          <TableCell>
                                            {limpiarNombreChofer(p.chofer_nombre) ?? (
                                              <span className="italic text-muted-foreground">
                                                (sin asignar)
                                              </span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right font-medium tabular-nums">
                                            {fmtBultos(p.bultos)}
                                          </TableCell>
                                          <TableCell className="text-right font-medium tabular-nums">
                                            {fmtHl(p.hl)}
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
                                    <TableHead className="w-24 text-right">Bultos</TableHead>
                                    <TableHead className="w-24 text-right">HL</TableHead>
                                    <TableHead className="w-20 text-right">% origen</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {o.skus.map((s, i) => {
                                    const sPct =
                                      valor > 0 ? (valorPrimario(s) / valor) * 100 : 0
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
                                          {fmtBultos(s.bultos)}
                                        </TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">
                                          {fmtHl(s.hl)}
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

            {data.por_cliente.length > 0 && (() => {
              const filtro = filtroCliente.trim().toLowerCase()
              const filtrados = filtro
                ? data.por_cliente.filter(
                    (c) =>
                      (c.nombre_cliente ?? "").toLowerCase().includes(filtro) ||
                      String(c.id_cliente).includes(filtro),
                  )
                : data.por_cliente
              const visibles = verTodosClientes ? filtrados : filtrados.slice(0, 30)
              return (
                <Section
                  title="Por cliente"
                  subtitle={`${data.por_cliente.length} clientes con entrega · camión asignado y origen`}
                >
                  <div className="space-y-2 p-3">
                    <input
                      type="text"
                      value={filtroCliente}
                      onChange={(e) => setFiltroCliente(e.target.value)}
                      placeholder="Buscar cliente por nombre o número…"
                      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                    />
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead className="w-40">Camión</TableHead>
                          <TableHead className="w-24">Origen</TableHead>
                          <TableHead className="w-24 text-right">Bultos</TableHead>
                          <TableHead className="w-24 text-right">HL</TableHead>
                          <TableHead className="w-20 text-right">% del día</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibles.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground">
                              Sin clientes que coincidan con la búsqueda
                            </TableCell>
                          </TableRow>
                        )}
                        {visibles.map((c, i) => {
                          const cPct =
                            totalPrimario > 0 ? (valorPrimario(c) / totalPrimario) * 100 : 0
                          const camiones = [
                            ...new Set(
                              c.origenes.map(
                                (o) => etiquetaFletero(o.ds_fletero_carga, { patente: o.patente }),
                              ),
                            ),
                          ]
                          // Unificado: todo se muestra como Chess (no se expone "Gestión").
                          const origenes = [...new Set(c.origenes.map(() => "chess"))]
                          return (
                            <TableRow key={c.id_cliente}>
                              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                              <TableCell>
                                {c.nombre_cliente ?? (
                                  <span className="italic text-muted-foreground">(sin nombre)</span>
                                )}
                                <span className="ml-1 text-xs text-muted-foreground">
                                  #{c.id_cliente}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {camiones.join(", ")}
                              </TableCell>
                              <TableCell>
                                <span className="flex flex-wrap gap-1">
                                  {origenes.map((o) => (
                                    <span
                                      key={o}
                                      className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800"
                                    >
                                      Chess
                                    </span>
                                  ))}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {fmtBultos(c.bultos)}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {fmtHl(c.hl)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {cPct.toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                    {!verTodosClientes && filtrados.length > 30 && (
                      <div className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setVerTodosClientes(true)}
                        >
                          Ver los {filtrados.length} clientes
                        </Button>
                      </div>
                    )}
                  </div>
                </Section>
              )
            })()}

            <Section
              title="Por patente"
              subtitle={`${patentes.length} patente${patentes.length === 1 ? "" : "s"} con venta · tocá una para ver sus SKU`}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-32">Patente</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead className="w-24 text-right">Bultos</TableHead>
                    <TableHead className="w-24 text-right">HL</TableHead>
                    <TableHead className="w-20 text-right">% del día</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patentes.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground"
                      >
                        Sin ventas para este día
                      </TableCell>
                    </TableRow>
                  )}
                  {patentes.map((p, i) => {
                    const pct =
                      totalPrimario > 0 ? (valorPrimario(p) / totalPrimario) * 100 : 0
                    const label = etiquetaFletero(p.patente, { chofer: p.chofer_nombre })
                    return (
                      <TableRow
                        key={p.patente}
                        onClick={() =>
                          setCamionSel({ patente: p.patente, label, chofer: p.chofer_nombre })
                        }
                        className="cursor-pointer transition-colors hover:bg-sky-50"
                        title="Ver detalle por SKU de este camión"
                      >
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className="inline-flex items-center gap-1 text-sky-700 underline-offset-2 hover:underline">
                            <Package className="size-3" />
                            {label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {limpiarNombreChofer(p.chofer_nombre) ?? (
                            <span className="italic text-muted-foreground">
                              (sin asignar)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {fmtBultos(p.bultos)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {fmtHl(p.hl)}
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

    <CamionSkuModal
      fecha={fecha}
      camion={camionSel}
      metrica={metrica}
      onClose={() => setCamionSel(null)}
    />
    </>
  )
}

function CamionSkuModal({
  fecha,
  camion,
  metrica,
  onClose,
}: {
  fecha: string | null
  camion: { patente: string; label: string; chofer: string | null } | null
  metrica: Metrica
  onClose: () => void
}) {
  const [data, setData] = useState<CamionSkuDetalle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!camion || !fecha) {
      setData(null)
      setError(null)
      return
    }
    let cancelado = false
    setLoading(true)
    setError(null)
    void getVentasCamionSkuDia(fecha, camion.patente).then((res) => {
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
  }, [camion, fecha])

  const esHl = metrica === "hl"
  const rows = data?.rows ?? []

  return (
    <Dialog open={!!camion} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Package className="size-4 text-sky-700" />
            Detalle por SKU · {camion?.label ?? ""}
          </DialogTitle>
          <DialogDescription>
            {camion?.chofer ? `Chofer: ${limpiarNombreChofer(camion.chofer)} · ` : ""}
            {fecha ? formatFechaLarga(fecha) : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Cargando SKU…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-md border border-slate-200 px-2 py-1">
                <strong>{fmtBultos(data.total_bultos)}</strong> bultos
              </span>
              <span className="rounded-md border border-slate-200 px-2 py-1">
                <strong>{fmtHl(data.total_hl)}</strong> HL
              </span>
              <span className="rounded-md border border-slate-200 px-2 py-1">
                <strong>{rows.length}</strong> SKU
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin detalle por SKU para este camión en el día.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-24">Cód. SKU</TableHead>
                    <TableHead>Artículo</TableHead>
                    <TableHead className="w-24 text-right">Bultos</TableHead>
                    <TableHead className="w-24 text-right">HL</TableHead>
                    <TableHead className="w-20 text-right">% camión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s, i) => {
                    const base = esHl ? data.total_hl : data.total_bultos
                    const val = esHl ? s.hl : s.bultos
                    const pct = base > 0 ? (val / base) * 100 : 0
                    return (
                      <TableRow key={s.id_articulo}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {s.id_articulo}
                        </TableCell>
                        <TableCell>{s.ds_articulo}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {fmtBultos(s.bultos)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {fmtHl(s.hl)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {pct.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        <div className="flex justify-end border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
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
