"use client"

import { useState, useTransition } from "react"
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
import { Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  createLlanta,
  createNovedad,
  createOrdenCompra,
  deleteGestionRow,
  updateNovedadEstado,
  updateOrdenCompraEstado,
  upsertRepuesto,
  type LlantaInspeccion,
  type Novedad,
  type OrdenCompra,
  type Repuesto,
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

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-slate-100 text-slate-600",
}
const ESTADO_NOV_BADGE: Record<string, string> = {
  abierta: "bg-red-100 text-red-700",
  en_proceso: "bg-amber-100 text-amber-700",
  resuelta: "bg-emerald-100 text-emerald-700",
}
const ESTADO_OC_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  comprada: "bg-emerald-100 text-emerald-700",
  anulada: "bg-slate-100 text-slate-500",
}

interface Props {
  dominios: string[]
  novedades: Novedad[]
  llantas: LlantaInspeccion[]
  repuestos: Repuesto[]
  ordenesCompra: OrdenCompra[]
  puedeEditar: boolean
}

export function GestionMtto({
  dominios,
  novedades,
  llantas,
  repuestos,
  ordenesCompra,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [dialog, setDialog] = useState<
    null | "novedad" | "llanta" | "repuesto" | "oc"
  >(null)
  const [repuestoEdit, setRepuestoEdit] = useState<Repuesto | null>(null)

  const borrar = async (
    tabla: "novedades" | "llantas" | "repuestos" | "ordenes_compra",
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
      <Tabs defaultValue="repuestos">
        <TabsList>
          <TabsTrigger value="repuestos">Inventario</TabsTrigger>
          <TabsTrigger value="oc">Órdenes de compra</TabsTrigger>
          <TabsTrigger value="novedades">Novedades</TabsTrigger>
          <TabsTrigger value="llantas">Inspección de llantas</TabsTrigger>
        </TabsList>

        {/* ===== Novedades ===== */}
        <TabsContent value="novedades" className="space-y-3">
          {puedeEditar && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setDialog("novedad")}>
                <Plus className="mr-1 size-4" /> Nueva novedad
              </Button>
            </div>
          )}
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {novedades.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">Sin novedades cargadas.</p>
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
                        <TableCell className="max-w-72 text-slate-600">{n.descripcion}</TableCell>
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
                                className="size-7 text-red-500"
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

        {/* ===== Llantas ===== */}
        <TabsContent value="llantas" className="space-y-3">
          {puedeEditar && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setDialog("llanta")}>
                <Plus className="mr-1 size-4" /> Nueva inspección
              </Button>
            </div>
          )}
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {llantas.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  Sin inspecciones de neumáticos cargadas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Posición</TableHead>
                      <TableHead className="text-right">Profundidad (mm)</TableHead>
                      <TableHead className="text-right">Presión (psi)</TableHead>
                      <TableHead>Observaciones</TableHead>
                      {puedeEditar && <TableHead className="w-12" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {llantas.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap">{fmtFecha(l.fecha)}</TableCell>
                        <TableCell className="font-medium">{l.dominio}</TableCell>
                        <TableCell>{l.posicion || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtNum(l.profundidad_mm)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtNum(l.presion_psi)}
                        </TableCell>
                        <TableCell className="max-w-60 text-slate-600">
                          {l.observaciones || "—"}
                        </TableCell>
                        {puedeEditar && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-red-500"
                              onClick={() => borrar("llantas", l.id)}
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

        {/* ===== Repuestos ===== */}
        <TabsContent value="repuestos" className="space-y-3">
          {puedeEditar && (
            <div className="flex justify-end">
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
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {repuestos.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
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
                      {puedeEditar && <TableHead className="w-12" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repuestos.map((r) => {
                      const bajo = r.stock_actual <= r.stock_min
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-slate-500">{r.codigo || "—"}</TableCell>
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
                              <span className="ml-1 text-xs text-slate-400">({r.unidad})</span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-medium tabular-nums",
                              bajo ? "text-red-600" : "text-slate-700"
                            )}
                          >
                            {fmtNum(r.stock_actual)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-slate-500">
                            {fmtNum(r.stock_min)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-slate-500">
                            {fmtNum(r.stock_max)}
                          </TableCell>
                          <TableCell className="text-slate-600">{r.ubicacion || "—"}</TableCell>
                          {puedeEditar && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-red-500"
                                onClick={() => borrar("repuestos", r.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
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
        </TabsContent>

        {/* ===== Órdenes de compra ===== */}
        <TabsContent value="oc" className="space-y-3">
          {puedeEditar && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setDialog("oc")}>
                <Plus className="mr-1 size-4" /> Nueva OC
              </Button>
            </div>
          )}
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {ordenesCompra.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
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
                        <TableCell className="max-w-60 text-slate-600">
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
                                className="size-7 text-red-500"
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
      {dialog === "llanta" && (
        <LlantaDialog
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
    </div>
  )
}

// ---------- Dialogs ----------

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

function LlantaDialog({
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
  const [posicion, setPosicion] = useState("")
  const [prof, setProf] = useState("")
  const [presion, setPresion] = useState("")
  const [obs, setObs] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await createLlanta({
      dominio,
      fecha,
      posicion,
      profundidad_mm: parseNum(prof),
      presion_psi: parseNum(presion),
      observaciones: obs,
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Inspección cargada")
    onSaved()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva inspección de neumático</DialogTitle>
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
            <div>
              <Label>Posición</Label>
              <Input
                value={posicion}
                onChange={(e) => setPosicion(e.target.value)}
                placeholder="Ej: DD, DI, TDI1"
              />
            </div>
            <div>
              <Label>Profundidad (mm)</Label>
              <Input type="number" value={prof} onChange={(e) => setProf(e.target.value)} />
            </div>
            <div>
              <Label>Presión (psi)</Label>
              <Input
                type="number"
                value={presion}
                onChange={(e) => setPresion(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Observaciones</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
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
