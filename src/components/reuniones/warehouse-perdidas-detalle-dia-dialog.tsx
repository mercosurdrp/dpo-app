"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Loader2,
  PackageCheck,
  Truck,
  Warehouse,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getWarehousePerdidasDia,
  type WarehousePerdidasDia,
} from "@/actions/warehouse-perdidas-dia"
import type { OrigenPerdida, RoturaDetalleSku } from "@/lib/warehouse/auto-indicadores"

/** Qué indicador se clickeó. Cambia el contenido entero del diálogo: "wqi"
 *  abre las dos lecturas del WQI + las dos aperturas por SKU que las explican
 *  (lo roto y lo que entró a reempaque y se recuperó); "faltantes" abre los
 *  HL faltantes del día + qué faltó. Antes las celdas de Faltantes caían en la
 *  vista de WQI y mostraban roturas, que es otro indicador. */
export type PerdidasDetalleTipo = "wqi" | "faltantes"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
  tipo?: PerdidasDetalleTipo
}

function formatFechaLarga(s: string): string {
  try {
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  } catch {
    return s
  }
}

function fmt(n: number | null, dec = 0): string {
  if (n == null) return "—"
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

/** Dónde ocurrió la pérdida. Las tres son "pérdida del día", pero sólo la de
 *  Almacén es responsabilidad del depósito: Distribución se rompió en la calle
 *  (va al DQI) y Acarreo en el transporte primario entre plantas. Sin la
 *  chapita, un faltante de acarreo se lee como faltante de almacén. */
const ORIGEN_CHAPITA: Record<
  OrigenPerdida,
  { texto: string; clase: string; icono: "camion" | "deposito" }
> = {
  distribucion: {
    texto: "Distribución",
    clase: "border-amber-200 bg-amber-50 text-amber-800",
    icono: "camion",
  },
  acarreo: {
    texto: "Acarreo",
    clase: "border-sky-200 bg-sky-50 text-sky-800",
    icono: "camion",
  },
  almacen: {
    texto: "Almacén",
    clase: "border-slate-200 bg-slate-50 text-slate-700",
    icono: "deposito",
  },
}

/** Chapita de origen + patente del camión cuando el Excel la informó. */
function OrigenBadge({ fila }: { fila: RoturaDetalleSku }) {
  const origen: OrigenPerdida = fila.origen ?? "almacen"
  const cfg = ORIGEN_CHAPITA[origen] ?? ORIGEN_CHAPITA.almacen
  const patentes = fila.patentes ?? []
  return (
    <>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.clase}`}
        title={patentes.length > 0 ? `Camión ${patentes.join(", ")}` : undefined}
      >
        {cfg.icono === "camion" ? (
          <Truck className="size-3" />
        ) : (
          <Warehouse className="size-3" />
        )}
        {cfg.texto}
      </span>
      {patentes.length > 0 && (
        <span className="ml-1 font-mono text-xs text-muted-foreground">
          {patentes.join(", ")}
        </span>
      )}
    </>
  )
}

export function WarehousePerdidasDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
  tipo = "wqi",
}: Props) {
  const [data, setData] = useState<WarehousePerdidasDia | null>(null)
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
    void getWarehousePerdidasDia(fecha).then((res) => {
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

  const esFaltantes = tipo === "faltantes"
  const sinRoturas = data != null && (data.roturas_hl_dia ?? 0) === 0
  const sinFaltantes = data != null && (data.faltantes_hl_dia ?? 0) === 0
  // Parte del volumen afectado que NO pasó por reempaque (rotura directa de
  // depósito). Sólo se muestra cuando el día tuvo las dos cosas.
  const directasHl =
    data?.wqi_hl_dia != null && data?.reempaque_hl_dia != null
      ? Math.max(0, data.wqi_hl_dia - data.reempaque_hl_dia)
      : null
  const hayDistribucion = (data?.roturas_detalle ?? []).some(
    (r) => r.origen === "distribucion",
  )
  const hayAcarreo = (data?.roturas_detalle ?? []).some(
    (r) => r.origen === "acarreo",
  )
  // Faltantes: mismo aviso, pero acá la mezcla es la regla y no la excepción —
  // el grueso de los faltantes es de acarreo, y hasta ahora la tabla no lo decía.
  const faltantesFueraDeAlmacen = (data?.faltantes_detalle ?? []).filter(
    (r) => r.origen === "distribucion" || r.origen === "acarreo",
  )
  // La otra mitad del WQI: lo que entró a reempaque y NO terminó descartado.
  // El total sale de los dos escalares (WQI − roturas reales), no de sumar la
  // columna: así el número del encabezado no puede contradecir a las tarjetas.
  const reempaqueDetalle = data?.reempaque_detalle ?? []
  const recuperadoHl =
    data?.wqi_hl_dia != null && data?.roturas_hl_dia != null
      ? data.wqi_hl_dia - data.roturas_hl_dia
      : null
  const hayMermaDeOtroDia = reempaqueDetalle.some((r) => r.sin_ingreso_dia)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {esFaltantes ? "Faltantes del día" : "WQI del día"}
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {formatFechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {esFaltantes ? (
              <>
                Los <strong>HL faltantes</strong> del día y su apertura por SKU.
                Es el mismo número de la celda: va en HL, no en PPM, y se compara
                contra el target de faltantes del mes.
              </>
            ) : (
              <>
                Las dos lecturas del día sobre el mismo denominador (HL
                entregado): el <strong>WQI total</strong>, que cuenta todo el
                volumen afectado por rotura —incluido lo que se reempaca y se
                recupera—, y las <strong>roturas reales</strong>, que es la merma
                final del almacén. Abajo, las dos aperturas por SKU: lo que se
                rompió y lo que se envió a reempaque y se recuperó.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Cargando detalle…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && data && !esFaltantes && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* WQI total: el valor de la celda sobre la que se hizo click */}
              <Card className="border-slate-300 bg-slate-50">
                <CardContent className="pt-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    WQI total (con reempacado)
                  </p>
                  <div className="mt-1 flex items-baseline gap-3">
                    <p className="text-3xl font-bold tabular-nums text-slate-900">
                      {fmt(data.wqi_dia, 1)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        PPM
                      </span>
                    </p>
                    <p className="text-xl font-semibold tabular-nums text-slate-700">
                      {fmt(data.wqi_hl_dia, 2)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        HL
                      </span>
                    </p>
                  </div>
                  {data.reempaque_hl_dia != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      A reempaque {fmt(data.reempaque_hl_dia, 2)} HL
                      {directasHl != null && directasHl > 0.0001
                        ? ` + roturas directas ${fmt(directasHl, 2)} HL`
                        : ""}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Acumulado del mes: {fmt(data.wqi_mtd, 1)} PPM
                  </p>
                </CardContent>
              </Card>

              {/* Roturas reales: merma final del almacén (lo que se descarta) */}
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Roturas reales (merma final)
                  </p>
                  <div className="mt-1 flex items-baseline gap-3">
                    <p className="text-3xl font-bold tabular-nums text-red-700">
                      {fmt(data.roturas_ppm_dia, 1)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        PPM
                      </span>
                    </p>
                    <p className="text-xl font-semibold tabular-nums text-red-700">
                      {fmt(data.roturas_hl_dia, 2)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        HL
                      </span>
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Acumulado del mes: {fmt(data.roturas_ppm_mtd, 1)} PPM
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Detalle de roturas por SKU: qué se rompió ese día */}
            {data.roturas_detalle.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">
                  Roturas por SKU ({data.roturas_detalle.length})
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Dónde</TableHead>
                        <TableHead className="text-right">Bultos</TableHead>
                        <TableHead className="text-right">HL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.roturas_detalle.map((r) => (
                        <TableRow key={`${r.sku}-${r.origen ?? "almacen"}`}>
                          <TableCell className="font-mono font-medium">
                            {r.sku}
                          </TableCell>
                          <TableCell
                            className="max-w-[240px] truncate"
                            title={r.descripcion}
                          >
                            {r.descripcion || "—"}
                          </TableCell>
                          <TableCell>
                            <OrigenBadge fila={r} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt(r.bultos_eq ?? r.bultos, 2)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-red-700">
                            {fmt(r.hl, 4)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {hayDistribucion && (
                  <p className="text-xs text-muted-foreground">
                    Las roturas de <strong>Distribución</strong> se rompieron en
                    la calle: van al DQI y no suman a ninguno de los dos números
                    de arriba.
                  </p>
                )}
                {hayAcarreo && (
                  <p className="text-xs text-muted-foreground">
                    Las de <strong>Acarreo</strong> pasaron en el transporte
                    primario entre plantas. Hoy <strong>sí</strong> suman a los
                    dos números de arriba, igual que las de almacén.
                  </p>
                )}
              </div>
            )}

            {/* La OTRA parte del WQI: lo que se envió a reempaque y no se
                rompió. Sin esta lista, el popover explicaba sólo el tramo del
                indicador que terminó en merma. */}
            {reempaqueDetalle.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <PackageCheck className="size-4 text-emerald-600" />
                    Enviado a reempaque ({reempaqueDetalle.length})
                  </p>
                  {recuperadoHl != null && (
                    <p className="text-xs text-muted-foreground">
                      Recuperado{" "}
                      <span className="font-semibold tabular-nums text-emerald-700">
                        {fmt(recuperadoHl, 2)} HL
                      </span>{" "}
                      = WQI total − roturas reales
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Bultos</TableHead>
                        <TableHead className="text-right">Enviado HL</TableHead>
                        <TableHead className="text-right">Roto HL</TableHead>
                        <TableHead className="text-right">
                          Recuperado HL
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reempaqueDetalle.map((r) => (
                        <TableRow
                          key={`reempaque-${r.sku}-${r.sin_ingreso_dia ? "previo" : "dia"}`}
                        >
                          <TableCell className="font-mono font-medium">
                            {r.sku}
                          </TableCell>
                          <TableCell
                            className="max-w-[220px] truncate"
                            title={r.descripcion}
                          >
                            {r.descripcion || "—"}
                            {r.sin_ingreso_dia && (
                              <span className="ml-1 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                                entró otro día
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.sin_ingreso_dia
                              ? "—"
                              : fmt(r.bultos_eq ?? r.bultos, 2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.sin_ingreso_dia ? "—" : fmt(r.hl, 4)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-red-700">
                            {r.hl_roto > 0.00005 ? fmt(r.hl_roto, 4) : "—"}
                          </TableCell>
                          <TableCell
                            className={
                              r.hl_recuperado < 0
                                ? "text-right font-semibold tabular-nums text-red-700"
                                : "text-right font-semibold tabular-nums text-emerald-700"
                            }
                          >
                            {fmt(r.hl_recuperado, 4)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Todo esto suma al <strong>WQI total</strong> —una rotura
                  consume proceso aunque el producto se recupere— pero no a las{" "}
                  <strong>roturas reales</strong>: la merma es sólo la columna
                  &ldquo;Roto&rdquo;.
                  {hayMermaDeOtroDia && (
                    <>
                      {" "}
                      Las filas <strong>&ldquo;entró otro día&rdquo;</strong> son
                      pallets que ingresaron antes y recién hoy dejaron merma:
                      restan del recuperado del día, por eso van en negativo.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Nota explicativa del 0 */}
            {sinRoturas && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>
                  <strong>Sin roturas reales</strong> este día: nada se terminó
                  descartando. Si el WQI total no es 0, es volumen que entró a
                  reempaque y se recuperó.
                </p>
              </div>
            )}
          </div>
        )}

        {!loading && !error && data && esFaltantes && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Faltantes del día
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-amber-700">
                  {fmt(data.faltantes_hl_dia, 2)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    HL
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Acumulado del mes: {fmt(data.faltantes_hl_mtd, 2)} HL
                </p>
              </CardContent>
            </Card>

            {/* Detalle por SKU: qué faltó ese día */}
            {data.faltantes_detalle.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">
                  Faltantes por SKU ({data.faltantes_detalle.length})
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Dónde</TableHead>
                        <TableHead className="text-right">Bultos</TableHead>
                        <TableHead className="text-right">HL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.faltantes_detalle.map((r) => (
                        <TableRow key={`${r.sku}-${r.origen ?? "almacen"}`}>
                          <TableCell className="font-mono font-medium">
                            {r.sku}
                          </TableCell>
                          <TableCell
                            className="max-w-[240px] truncate"
                            title={r.descripcion}
                          >
                            {r.descripcion || "—"}
                          </TableCell>
                          <TableCell>
                            <OrigenBadge fila={r} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt(r.bultos_eq ?? r.bultos, 2)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-amber-700">
                            {fmt(r.hl, 4)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {faltantesFueraDeAlmacen.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {faltantesFueraDeAlmacen.length} de{" "}
                    {data.faltantes_detalle.length} no faltaron dentro del
                    almacén (<strong>Acarreo</strong> = transporte primario entre
                    plantas, <strong>Distribución</strong> = reparto a clientes).
                    Igual suman al número de arriba: la fila Faltantes cuenta
                    todo.
                  </p>
                )}
              </div>
            )}

            {sinFaltantes && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>
                  <strong>Sin faltantes</strong> este día: no se registró ningún
                  faltante en el almacén.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
