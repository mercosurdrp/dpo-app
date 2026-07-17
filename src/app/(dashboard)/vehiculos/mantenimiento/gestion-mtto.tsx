"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ClipboardCheck,
  FileText,
  History,
  Minus,
  Plus,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { comprimirImagen } from "@/lib/comprimir-imagen"
import { DpoPuntoBadge, DpoSeccionCinta } from "./_components/dpo-badge"
import {
  createConteo,
  createNovedad,
  createOrdenCompra,
  createResiduo,
  deleteConteo,
  deleteGestionRow,
  deleteResiduo,
  getConteoDetalle,
  getMovimientosRepuesto,
  registrarMovimientoRepuesto,
  updateNovedadEstado,
  updateOrdenCompraEstado,
  upsertRepuesto,
  type ConteoItemDetalle,
  type ConteoResumen,
  type MovimientoRepuesto,
  type Novedad,
  type OrdenCompra,
  type Repuesto,
  type Residuo,
} from "@/actions/mantenimiento-vehiculos"

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function fmtFecha(f: string): string {
  return f.slice(0, 10).split("-").reverse().join("/")
}
const fmtNum = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("es-AR").format(v)
function parseNum(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s.replace(",", "."))
  return isNaN(n) ? null : n
}

// Escala única de badges del módulo: mismos tres tonos (crítico / alerta / ok)
// que el semáforo de <KpiCard>, en tokens que respetan el tema.
const BADGE_CRITICO = "border-destructive/30 bg-destructive/10 text-destructive"
const BADGE_ALERTA =
  "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
const BADGE_OK =
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
const BADGE_NEUTRO = "border-border bg-muted text-muted-foreground"

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: BADGE_CRITICO,
  media: BADGE_ALERTA,
  baja: BADGE_NEUTRO,
}
const ESTADO_NOV_BADGE: Record<string, string> = {
  abierta: BADGE_CRITICO,
  en_proceso: BADGE_ALERTA,
  resuelta: BADGE_OK,
}
const ESTADO_OC_BADGE: Record<string, string> = {
  pendiente: BADGE_ALERTA,
  comprada: BADGE_OK,
  anulada: BADGE_NEUTRO,
}

const MATERIAL_LABEL: Record<string, string> = {
  neumaticos: "Neumáticos",
  aceite: "Aceite usado",
  filtros: "Filtros",
  baterias: "Baterías",
  chatarra: "Chatarra",
  otros: "Otros",
}

interface Props {
  dominios: string[]
  novedades: Novedad[]
  repuestos: Repuesto[]
  ordenesCompra: OrdenCompra[]
  residuos: Residuo[]
  conteos: ConteoResumen[]
  puedeEditar: boolean
}

export function GestionMtto({
  dominios,
  novedades,
  repuestos,
  ordenesCompra,
  residuos,
  conteos,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [dialog, setDialog] = useState<
    null | "novedad" | "repuesto" | "oc" | "residuo" | "conteo"
  >(null)
  const [conteoVer, setConteoVer] = useState<ConteoResumen | null>(null)
  const [repuestoEdit, setRepuestoEdit] = useState<Repuesto | null>(null)
  // Movimiento de stock: repuesto + tipo inicial (ingreso/egreso) del botón.
  const [movimiento, setMovimiento] = useState<{
    repuesto: Repuesto
    tipo: "ingreso" | "egreso"
  } | null>(null)
  // Historial de movimientos del repuesto seleccionado.
  const [historialRep, setHistorialRep] = useState<Repuesto | null>(null)

  const borrar = async (
    tabla: "novedades" | "repuestos" | "ordenes_compra",
    id: string
  ) => {
    const res = await deleteGestionRow(tabla, id)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success("Eliminado")
      refresh()
    }
  }

  return (
    <div className="space-y-4">
      <DpoSeccionCinta seccionId="repuestos" />

      <Tabs defaultValue="repuestos">
        <TabsList>
          <TabsTrigger value="repuestos">Inventario</TabsTrigger>
          <TabsTrigger value="oc">Órdenes de compra</TabsTrigger>
          <TabsTrigger value="novedades">Novedades</TabsTrigger>
          <TabsTrigger value="residuos">Residuos</TabsTrigger>
        </TabsList>

        {/* ===== Residuos de mantenimiento (DPO 1.4) ===== */}
        <TabsContent value="residuos" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Disposición de residuos
                </h3>
                <DpoPuntoBadge numero="1.4" />
              </div>
              <p className="text-sm text-muted-foreground">
                Registro de disposición de residuos de mantenimiento (neumáticos, aceites,
                filtros…) con proveedor y certificado de descarte.
              </p>
            </div>
            {puedeEditar && (
              <Button size="sm" onClick={() => setDialog("residuo")}>
                <Plus className="mr-1 size-4" /> Registrar disposición
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {residuos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin disposiciones registradas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>N° de fuego</TableHead>
                      <TableHead>Certificado</TableHead>
                      {puedeEditar && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {residuos.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{fmtFecha(r.fecha)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={BADGE_NEUTRO}>
                            {MATERIAL_LABEL[r.material] ?? r.material}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-56 text-foreground">
                          {r.descripcion ?? "—"}
                          {r.observaciones && (
                            <span className="block text-xs text-muted-foreground">
                              {r.observaciones}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {r.cantidad != null ? `${fmtNum(r.cantidad)} ${r.unidad ?? ""}` : "—"}
                        </TableCell>
                        <TableCell className="text-foreground">{r.proveedor}</TableCell>
                        <TableCell className="max-w-40 text-xs text-muted-foreground">
                          {r.numeros_fuego ?? "—"}
                        </TableCell>
                        <TableCell>
                          {r.certificado_url ? (
                            <a
                              href={r.certificado_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <FileText className="size-3.5" /> Ver
                            </a>
                          ) : (
                            <span className="text-xs italic text-amber-600 dark:text-amber-400">
                              falta
                            </span>
                          )}
                        </TableCell>
                        {puedeEditar && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive"
                              onClick={async () => {
                                const res = await deleteResiduo(r.id)
                                if ("error" in res) toast.error(res.error)
                                else {
                                  toast.success("Eliminado")
                                  refresh()
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Novedades (DPO 2.3) ===== */}
        <TabsContent value="novedades" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Novedades de repuestos
                </h3>
                <DpoPuntoBadge numero="2.3" />
              </div>
              <p className="text-sm text-muted-foreground">
                Faltantes y pedidos de piezas detectados sobre las unidades, con prioridad
                y estado de resolución.
              </p>
            </div>
            {puedeEditar && (
              <Button size="sm" onClick={() => setDialog("novedad")}>
                <Plus className="mr-1 size-4" /> Nueva novedad
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {novedades.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin novedades cargadas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Prioridad</TableHead>
                      <TableHead>Estado</TableHead>
                      {puedeEditar && <TableHead className="w-40" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {novedades.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="whitespace-nowrap">{fmtFecha(n.fecha)}</TableCell>
                        <TableCell className="font-medium">{n.dominio}</TableCell>
                        <TableCell className="max-w-72 text-foreground">{n.descripcion}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={PRIORIDAD_BADGE[n.prioridad]}>
                            {n.prioridad}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ESTADO_NOV_BADGE[n.estado]}>
                            {n.estado.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        {puedeEditar && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Select
                                value={n.estado}
                                onValueChange={async (v: string | null) => {
                                  if (!v) return
                                  const res = await updateNovedadEstado(n.id, v)
                                  if ("error" in res) toast.error(res.error)
                                  else refresh()
                                }}
                              >
                                <SelectTrigger className="h-7 w-32 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="abierta">Abierta</SelectItem>
                                  <SelectItem value="en_proceso">En proceso</SelectItem>
                                  <SelectItem value="resuelta">Resuelta</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive"
                                onClick={() => borrar("novedades", n.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Repuestos / Inventario (DPO 2.3) ===== */}
        <TabsContent value="repuestos" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Inventario de piezas
                </h3>
                <DpoPuntoBadge numero="2.3" />
              </div>
              <p className="text-sm text-muted-foreground">
                Stock mínimo, objetivo y máximo por pieza, con movimientos y conteos
                físicos que respaldan la exactitud del inventario.
              </p>
            </div>
            {puedeEditar && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setDialog("conteo")}>
                  <ClipboardCheck className="mr-1 size-4" /> Conteo de stock
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setRepuestoEdit(null)
                    setDialog("repuesto")
                  }}
                >
                  <Plus className="mr-1 size-4" /> Nuevo repuesto
                </Button>
              </div>
            )}
          </div>
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {repuestos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin repuestos cargados.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Repuesto</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Mín</TableHead>
                      <TableHead className="text-right">Máx</TableHead>
                      <TableHead>Ubicación</TableHead>
                      {puedeEditar && <TableHead className="w-40" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repuestos.map((r) => {
                      const bajo = r.stock_actual <= r.stock_min
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-muted-foreground">{r.codigo || "—"}</TableCell>
                          <TableCell className="font-medium">
                            <button
                              className="text-left hover:underline"
                              onClick={() => {
                                if (!puedeEditar) return
                                setRepuestoEdit(r)
                                setDialog("repuesto")
                              }}
                            >
                              {r.nombre}
                            </button>
                            {r.unidad && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({r.unidad})
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-medium tabular-nums",
                              bajo ? "text-destructive" : "text-foreground"
                            )}
                          >
                            {fmtNum(r.stock_actual)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {fmtNum(r.stock_min)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {fmtNum(r.stock_max)}
                          </TableCell>
                          <TableCell className="text-foreground">{r.ubicacion || "—"}</TableCell>
                          {puedeEditar && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-emerald-600 dark:text-emerald-400"
                                  title="Registrar ingreso"
                                  onClick={() =>
                                    setMovimiento({ repuesto: r, tipo: "ingreso" })
                                  }
                                >
                                  <Plus className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-amber-600 dark:text-amber-400"
                                  title="Registrar egreso"
                                  onClick={() =>
                                    setMovimiento({ repuesto: r, tipo: "egreso" })
                                  }
                                >
                                  <Minus className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground"
                                  title="Ver movimientos"
                                  onClick={() => setHistorialRep(r)}
                                >
                                  <History className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive"
                                  title="Eliminar repuesto"
                                  onClick={() => borrar("repuestos", r.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Historial de conteos físicos (DPO 2.3) */}
          {conteos.length > 0 && (
            <Card>
              <CardContent className="overflow-x-auto pt-6">
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    Conteos de stock realizados
                  </p>
                  <DpoPuntoBadge numero="2.3" />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Realizado por</TableHead>
                      <TableHead className="text-right">Ítems</TableHead>
                      <TableHead className="text-right">Con diferencia</TableHead>
                      <TableHead className="text-right">Exactitud</TableHead>
                      <TableHead>Ajuste</TableHead>
                      {puedeEditar && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conteos.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setConteoVer(c)}
                      >
                        <TableCell className="whitespace-nowrap">{fmtFecha(c.fecha)}</TableCell>
                        <TableCell className="text-foreground">{c.realizado_por}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.items_total}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            c.items_con_diferencia > 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          {c.items_con_diferencia}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {c.exactitud_pct != null ? `${c.exactitud_pct.toFixed(0)}%` : "—"}
                        </TableCell>
                        <TableCell>
                          {c.ajustado ? (
                            <Badge variant="outline" className={BADGE_OK}>
                              stock ajustado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={BADGE_NEUTRO}>
                              sin ajuste
                            </Badge>
                          )}
                        </TableCell>
                        {puedeEditar && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive"
                              onClick={async () => {
                                const res = await deleteConteo(c.id)
                                if ("error" in res) toast.error(res.error)
                                else {
                                  toast.success("Conteo eliminado")
                                  refresh()
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== Órdenes de compra ===== */}
        <TabsContent value="oc" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Órdenes de compra</h3>
              <p className="text-sm text-muted-foreground">
                Compras de repuestos y servicios de flota, con proveedor, monto y estado.
              </p>
            </div>
            {puedeEditar && (
              <Button size="sm" onClick={() => setDialog("oc")}>
                <Plus className="mr-1 size-4" /> Nueva OC
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {ordenesCompra.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin órdenes de compra cargadas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>N°</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Estado</TableHead>
                      {puedeEditar && <TableHead className="w-40" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordenesCompra.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap">{fmtFecha(o.fecha)}</TableCell>
                        <TableCell>{o.numero || "—"}</TableCell>
                        <TableCell className="font-medium">{o.proveedor || "—"}</TableCell>
                        <TableCell className="max-w-60 text-foreground">
                          {o.descripcion || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {o.monto != null ? `$ ${fmtNum(o.monto)}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ESTADO_OC_BADGE[o.estado]}>
                            {o.estado}
                          </Badge>
                        </TableCell>
                        {puedeEditar && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Select
                                value={o.estado}
                                onValueChange={async (v: string | null) => {
                                  if (!v) return
                                  const res = await updateOrdenCompraEstado(o.id, v)
                                  if ("error" in res) toast.error(res.error)
                                  else refresh()
                                }}
                              >
                                <SelectTrigger className="h-7 w-32 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pendiente">Pendiente</SelectItem>
                                  <SelectItem value="comprada">Comprada</SelectItem>
                                  <SelectItem value="anulada">Anulada</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive"
                                onClick={() => borrar("ordenes_compra", o.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== Dialogs ===== */}
      {dialog === "novedad" && (
        <NovedadDialog
          dominios={dominios}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
      {dialog === "repuesto" && (
        <RepuestoDialog
          repuesto={repuestoEdit}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
      {dialog === "oc" && (
        <OcDialog
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
      {dialog === "residuo" && (
        <ResiduoDialog
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
      {dialog === "conteo" && (
        <ConteoDialog
          repuestos={repuestos}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
      {conteoVer && (
        <ConteoDetalleDialog conteo={conteoVer} onClose={() => setConteoVer(null)} />
      )}
      {movimiento && (
        <MovimientoDialog
          repuesto={movimiento.repuesto}
          tipoInicial={movimiento.tipo}
          onClose={() => setMovimiento(null)}
          onSaved={() => {
            setMovimiento(null)
            refresh()
          }}
        />
      )}
      {historialRep && (
        <HistorialMovimientosDialog
          repuesto={historialRep}
          onClose={() => setHistorialRep(null)}
        />
      )}
    </div>
  )
}

// ---------- Dialogs ----------

function ConteoDialog({
  repuestos,
  onClose,
  onSaved,
}: {
  repuestos: Repuesto[]
  onClose: () => void
  onSaved: () => void
}) {
  const [fecha, setFecha] = useState(hoyISO())
  const [realizadoPor, setRealizadoPor] = useState("")
  const [observaciones, setObservaciones] = useState("")
  // contado por repuesto: arranca vacío; vacío = no contado (no entra al conteo).
  const [contados, setContados] = useState<Record<string, string>>({})
  const [ajustar, setAjustar] = useState(false)
  const [saving, setSaving] = useState(false)

  const items = repuestos
    .map((r) => ({ r, raw: contados[r.id] ?? "" }))
    .filter((x) => x.raw.trim() !== "")
    .map((x) => ({ repuestoId: x.r.id, contado: parseNum(x.raw) }))

  const submit = async () => {
    if (!realizadoPor.trim()) return toast.error("Indicá quién hizo el conteo")
    if (items.length === 0) return toast.error("Cargá al menos un ítem contado")
    if (items.some((i) => i.contado == null || i.contado < 0))
      return toast.error("Hay cantidades inválidas")
    setSaving(true)
    const res = await createConteo({
      fecha,
      realizadoPor,
      observaciones,
      ajustar,
      items: items.map((i) => ({ repuestoId: i.repuestoId, contado: i.contado! })),
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success(ajustar ? "Conteo guardado y stock ajustado" : "Conteo guardado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conteo físico de stock</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label>Realizado por</Label>
            <Input
              value={realizadoPor}
              onChange={(e) => setRealizadoPor(e.target.value)}
              placeholder="Nombre"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repuesto</TableHead>
                <TableHead className="text-right">Sistema</TableHead>
                <TableHead className="w-28 text-right">Contado</TableHead>
                <TableHead className="w-24 text-right">Dif.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repuestos.map((r) => {
                const raw = contados[r.id] ?? ""
                const contado = raw.trim() === "" ? null : parseNum(raw)
                const dif = contado != null ? contado - r.stock_actual : null
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.nombre}
                      {r.unidad && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({r.unidad})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtNum(r.stock_actual)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        value={raw}
                        onChange={(e) =>
                          setContados((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        placeholder="—"
                        className="h-7 w-24 text-right text-sm"
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        dif == null
                          ? "text-muted-foreground/50"
                          : dif === 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "font-medium text-destructive"
                      )}
                    >
                      {dif == null ? "—" : dif > 0 ? `+${fmtNum(dif)}` : fmtNum(dif)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div>
          <Label>Observaciones</Label>
          <Input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={ajustar}
            onChange={(e) => setAjustar(e.target.checked)}
            className="size-4"
          />
          Ajustar el stock del sistema a lo contado
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : `Guardar conteo (${items.length} ítems)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConteoDetalleDialog({
  conteo,
  onClose,
}: {
  conteo: ConteoResumen
  onClose: () => void
}) {
  const [detalle, setDetalle] = useState<ConteoItemDetalle[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getConteoDetalle(conteo.id).then((res) => {
      if ("error" in res) setError(res.error)
      else setDetalle(res.data)
    })
  }, [conteo.id])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Conteo del {fmtFecha(conteo.fecha)} · {conteo.realizado_por}
          </DialogTitle>
        </DialogHeader>
        {conteo.observaciones && (
          <p className="text-sm text-muted-foreground">{conteo.observaciones}</p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="py-4 text-sm text-destructive">{error}</p>
          ) : detalle == null ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repuesto</TableHead>
                  <TableHead className="text-right">Sistema</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Dif.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalle.map((d) => {
                  const dif = d.stock_contado - d.stock_sistema
                  return (
                    <TableRow key={d.repuesto_id}>
                      <TableCell>{d.nombre}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(d.stock_sistema)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(d.stock_contado)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          dif === 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "font-medium text-destructive"
                        )}
                      >
                        {dif > 0 ? `+${fmtNum(dif)}` : fmtNum(dif)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MovimientoDialog({
  repuesto,
  tipoInicial,
  onClose,
  onSaved,
}: {
  repuesto: Repuesto
  tipoInicial: "ingreso" | "egreso"
  onClose: () => void
  onSaved: () => void
}) {
  const [tipo, setTipo] = useState<"ingreso" | "egreso">(tipoInicial)
  const [cantidad, setCantidad] = useState("")
  const [motivo, setMotivo] = useState("")
  const [fecha, setFecha] = useState(hoyISO())
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const cant = parseNum(cantidad)
    if (cant == null || cant <= 0) return toast.error("Ingresá una cantidad mayor a 0")
    setSaving(true)
    const res = await registrarMovimientoRepuesto({
      repuestoId: repuesto.id,
      tipo,
      cantidad: cant,
      motivo,
      fecha,
    })
    setSaving(false)
    // El error de "Stock insuficiente…" viene de la función y se muestra tal cual.
    if ("error" in res) return toast.error(res.error)
    toast.success(tipo === "ingreso" ? "Ingreso registrado" : "Egreso registrado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Movimiento de stock · {repuesto.nombre}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Stock actual:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {fmtNum(repuesto.stock_actual)}
          </span>
          {repuesto.unidad && <span> {repuesto.unidad}</span>}
        </p>
        <div className="space-y-3">
          <div>
            <Label>Tipo de movimiento</Label>
            <Select value={tipo} onValueChange={(v) => v && setTipo(v as "ingreso" | "egreso")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ingreso">Ingreso (+)</SelectItem>
                <SelectItem value="egreso">Egreso (−)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cantidad</Label>
              <Input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Motivo</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                tipo === "ingreso"
                  ? "compra / reposición"
                  : "uso en OT / reparación"
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Registrar movimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistorialMovimientosDialog({
  repuesto,
  onClose,
}: {
  repuesto: Repuesto
  onClose: () => void
}) {
  const [movimientos, setMovimientos] = useState<MovimientoRepuesto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMovimientosRepuesto(repuesto.id).then((res) => {
      if ("error" in res) setError(res.error)
      else setMovimientos(res.data)
    })
  }, [repuesto.id])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Movimientos · {repuesto.nombre}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="py-4 text-sm text-destructive">{error}</p>
          ) : movimientos == null ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : movimientos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Stock después</TableHead>
                  <TableHead>Registró</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{fmtFecha(m.fecha)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={m.tipo === "ingreso" ? BADGE_OK : BADGE_CRITICO}
                      >
                        {m.tipo === "ingreso" ? "Ingreso" : "Egreso"}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        m.tipo === "ingreso"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive"
                      )}
                    >
                      {m.tipo === "ingreso" ? "+" : "−"}
                      {fmtNum(m.cantidad)}
                    </TableCell>
                    <TableCell className="max-w-56 text-muted-foreground">
                      {m.motivo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {fmtNum(m.stock_resultante)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.autor ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ResiduoDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [fecha, setFecha] = useState(hoyISO())
  const [material, setMaterial] = useState("neumaticos")
  const [descripcion, setDescripcion] = useState("")
  const [cantidad, setCantidad] = useState("")
  const [unidad, setUnidad] = useState("un")
  const [proveedor, setProveedor] = useState("")
  const [numerosFuego, setNumerosFuego] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [certificado, setCertificado] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!proveedor.trim()) return toast.error("Cargá el proveedor de la disposición")
    setSaving(true)
    const fd = new FormData()
    fd.set("fecha", fecha)
    fd.set("material", material)
    fd.set("proveedor", proveedor)
    fd.set("descripcion", descripcion)
    fd.set("cantidad", cantidad)
    fd.set("unidad", unidad)
    fd.set("numeros_fuego", numerosFuego)
    fd.set("observaciones", observaciones)
    // Si es imagen (foto del certificado), se comprime; los PDF pasan tal cual.
    if (certificado) fd.set("certificado", await comprimirImagen(certificado))
    const res = await createResiduo(fd)
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Disposición registrada")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar disposición de residuos</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha de eliminación</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Material</Label>
              <Select value={material} onValueChange={(v) => v && setMaterial(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MATERIAL_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Proveedor de disposición</Label>
              <Input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Responsable del retiro/descarte"
              />
            </div>
            <div>
              <Label>Cantidad</Label>
              <div className="flex gap-1.5">
                <Input
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  placeholder="0"
                  className="flex-1"
                />
                <Select value={unidad} onValueChange={(v) => v && setUnidad(v)}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="un">un</SelectItem>
                    <SelectItem value="lts">lts</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div>
            <Label>Detalle del material</Label>
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: cubiertas 295/80 R22.5 fuera de uso"
            />
          </div>
          {material === "neumaticos" && (
            <div>
              <Label>Números de fuego</Label>
              <Input
                value={numerosFuego}
                onChange={(e) => setNumerosFuego(e.target.value)}
                placeholder="Separados por coma"
              />
            </div>
          )}
          <div>
            <Label>Certificado de descarte (PDF o foto)</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setCertificado(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <Label>Observaciones</Label>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UnidadSelect({
  dominios,
  value,
  onChange,
}: {
  dominios: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Select value={value} onValueChange={(v: string | null) => v && onChange(v)}>
      <SelectTrigger>
        <SelectValue placeholder="Unidad" />
      </SelectTrigger>
      <SelectContent>
        {dominios.map((d) => (
          <SelectItem key={d} value={d}>
            {d}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function NovedadDialog({
  dominios,
  onClose,
  onSaved,
}: {
  dominios: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [dominio, setDominio] = useState("")
  const [fecha, setFecha] = useState(hoyISO())
  const [descripcion, setDescripcion] = useState("")
  const [prioridad, setPrioridad] = useState("media")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await createNovedad({ dominio, fecha, descripcion, prioridad })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Novedad cargada")
    onSaved()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva novedad</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unidad</Label>
              <UnidadSelect dominios={dominios} value={dominio} onChange={setDominio} />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Prioridad</Label>
            <Select value={prioridad} onValueChange={(v) => v && setPrioridad(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RepuestoDialog({
  repuesto,
  onClose,
  onSaved,
}: {
  repuesto: Repuesto | null
  onClose: () => void
  onSaved: () => void
}) {
  const [codigo, setCodigo] = useState(repuesto?.codigo ?? "")
  const [nombre, setNombre] = useState(repuesto?.nombre ?? "")
  const [unidad, setUnidad] = useState(repuesto?.unidad ?? "")
  const [stock, setStock] = useState(repuesto ? String(repuesto.stock_actual) : "")
  const [min, setMin] = useState(repuesto ? String(repuesto.stock_min) : "")
  const [max, setMax] = useState(repuesto?.stock_max != null ? String(repuesto.stock_max) : "")
  const [ubicacion, setUbicacion] = useState(repuesto?.ubicacion ?? "")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await upsertRepuesto({
      id: repuesto?.id,
      codigo,
      nombre,
      unidad,
      stock_actual: parseNum(stock) ?? 0,
      stock_min: parseNum(min) ?? 0,
      stock_max: parseNum(max),
      ubicacion,
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success(repuesto ? "Repuesto actualizado" : "Repuesto cargado")
    onSaved()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{repuesto ? "Editar repuesto" : "Nuevo repuesto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Código</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            </div>
            <div>
              <Label>Unidad de medida</Label>
              <Input
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                placeholder="u / lt / kg"
              />
            </div>
          </div>
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Stock actual</Label>
              <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div>
              <Label>Stock mín</Label>
              <Input type="number" value={min} onChange={(e) => setMin(e.target.value)} />
            </div>
            <div>
              <Label>Stock máx</Label>
              <Input type="number" value={max} onChange={(e) => setMax(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Ubicación</Label>
            <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OcDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [numero, setNumero] = useState("")
  const [proveedor, setProveedor] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [monto, setMonto] = useState("")
  const [fecha, setFecha] = useState(hoyISO())
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await createOrdenCompra({
      numero,
      proveedor,
      descripcion,
      monto: parseNum(monto),
      fecha,
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("OC cargada")
    onSaved()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva orden de compra</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>N° OC</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Proveedor</Label>
            <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label>Monto ($)</Label>
            <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
