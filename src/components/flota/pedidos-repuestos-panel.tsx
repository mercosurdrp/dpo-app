"use client"

/**
 * Pedidos de repuestos: qué falta, para qué unidad y OT, a quién se compra y
 * cuándo se retira.
 *
 * Reemplaza a Novedades + Órdenes de compra. La lista de piezas es para tildar
 * y sale del catálogo, no del teclado: así deja de haber cuatro nombres para la
 * misma pieza, y una pieza que falta pasa a ser contable —cuántas veces faltó y
 * cuántos días esperó el trabajo—.
 */

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Check, Package, Plus, Trash2, Truck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  eliminarPedidoRepuestos,
  getCatalogoRepuestos,
  getPedidosRepuestos,
  marcarPedidoRetirado,
  upsertPedidoRepuestos,
  type PedidoRepuestos,
  type RepuestoCatalogo,
} from "@/actions/pedidos-repuestos"

const hoyISO = () => new Date().toISOString().slice(0, 10)
const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")
const fmtMoney = (n: number | null) =>
  n == null ? "—" : `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`

const ESTADO_BADGE: Record<string, string> = {
  abierto: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  comprado: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  retirado: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  anulado: "border-border bg-muted text-muted-foreground",
}
const PRIORIDAD_BADGE: Record<string, string> = {
  alta: "border-destructive/30 bg-destructive/10 text-destructive",
  media: "border-border bg-muted text-muted-foreground",
  baja: "border-border bg-muted text-muted-foreground/70",
}

export interface OtParaPedido {
  id: string
  numeroOt: string | null
  fecha: string
  dominio: string
}

export function PedidosRepuestosPanel({
  dominios,
  ots,
  puedeEditar,
}: {
  dominios: string[]
  /** OT recientes y programadas, para colgar el pedido de la que lo espera. */
  ots: OtParaPedido[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<PedidoRepuestos[]>([])
  const [catalogo, setCatalogo] = useState<RepuestoCatalogo[]>([])
  const [editar, setEditar] = useState<PedidoRepuestos | null | "nuevo">(null)
  const [cargando, setCargando] = useState(true)

  const refrescar = () => {
    getPedidosRepuestos().then((r) => {
      if ("data" in r) setPedidos(r.data)
      setCargando(false)
    })
    getCatalogoRepuestos().then((r) => {
      if ("data" in r) setCatalogo(r.data)
    })
  }
  useEffect(refrescar, [])

  const abiertos = pedidos.filter((p) => p.estado === "abierto" || p.estado === "comprado")
  const esperaProm = (() => {
    const cerrados = pedidos.filter((p) => p.estado === "retirado" && p.diasEspera != null)
    if (cerrados.length === 0) return null
    return cerrados.reduce((a, p) => a + (p.diasEspera ?? 0), 0) / cerrados.length
  })()

  async function retirar(p: PedidoRepuestos) {
    const res = await marcarPedidoRetirado(p.id)
    if ("error" in res) return toast.error(res.error)
    toast.success("Pedido cerrado: la pieza se retiró")
    refrescar()
    router.refresh()
  }

  async function borrar(p: PedidoRepuestos) {
    const res = await eliminarPedidoRepuestos(p.id)
    if ("error" in res) return toast.error(res.error)
    toast.success("Pedido eliminado")
    refrescar()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Pedidos de repuestos</h3>
          <p className="text-sm text-muted-foreground">
            Qué piezas faltan, para qué unidad y OT, a quién se compran y cuándo se
            retiran. El tiempo entre que se detecta la falta y que llega la pieza es lo
            que mide cuánto esperan los trabajos por repuestos.
          </p>
          <p className="text-xs text-muted-foreground">
            {abiertos.length > 0 ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {abiertos.length} esperando pieza
              </span>
            ) : (
              <span>Ningún pedido esperando.</span>
            )}
            {esperaProm != null && <> · espera promedio {esperaProm.toFixed(1)} días</>}
          </p>
        </div>
        {puedeEditar && (
          <Button size="sm" onClick={() => setEditar("nuevo")}>
            <Plus className="mr-1 size-4" /> Nuevo pedido
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {cargando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : pedidos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin pedidos cargados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Detectado</TableHead>
                  <TableHead>Unidad / OT</TableHead>
                  <TableHead>Piezas</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Compra</TableHead>
                  <TableHead>Retiro</TableHead>
                  <TableHead className="text-right">Espera</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  {puedeEditar && <TableHead className="w-28" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {fmtFecha(p.fecha)}
                      {p.prioridad !== "media" && (
                        <Badge
                          variant="outline"
                          className={cn("ml-1 text-[10px]", PRIORIDAD_BADGE[p.prioridad])}
                        >
                          {p.prioridad}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.dominio || "—"}
                      {p.otNumero && (
                        <span className="block text-[11px] text-sky-700 dark:text-sky-400">
                          OT {p.otNumero}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-64">
                      <span className="flex flex-wrap gap-1">
                        {p.items.map((i) => (
                          <span
                            key={i.id}
                            className="rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[11px]"
                          >
                            {i.nombre}
                            {i.cantidad !== 1 && ` ×${i.cantidad}`}
                          </span>
                        ))}
                      </span>
                      {p.descripcion && (
                        <span className="line-clamp-1 text-[11px] text-muted-foreground">
                          {p.descripcion}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.proveedor || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {fmtFecha(p.fechaCompra)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {fmtFecha(p.fechaRetiro)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        p.estado !== "retirado" && (p.diasEspera ?? 0) > 7
                          ? "font-medium text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {p.diasEspera == null ? "—" : `${p.diasEspera} d`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtMoney(p.monto)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs", ESTADO_BADGE[p.estado])}>
                        {p.estado}
                      </Badge>
                    </TableCell>
                    {puedeEditar && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {p.estado !== "retirado" && p.estado !== "anulado" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-xs"
                              title="Marcar que la pieza ya se retiró"
                              onClick={() => retirar(p)}
                            >
                              <Check className="size-3.5" /> Retirado
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => setEditar(p)}
                            aria-label="Editar pedido"
                          >
                            <Package className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-destructive"
                            onClick={() => borrar(p)}
                            aria-label="Eliminar pedido"
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

      {editar && (
        <PedidoDialog
          pedido={editar === "nuevo" ? null : editar}
          catalogo={catalogo}
          dominios={dominios}
          ots={ots}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null)
            refrescar()
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

/**
 * Lista de piezas para tildar. Va fuera del diálogo a propósito: definida
 * adentro se recrea en cada render y React la desmonta y la vuelve a montar,
 * que es lo que hace que el input de cantidad pierda el foco al tipear.
 */
function ListaPiezas({
  titulo,
  items,
  sel,
  onToggle,
  onCantidad,
}: {
  titulo: string
  items: RepuestoCatalogo[]
  sel: Map<string, number>
  onToggle: (id: string) => void
  onCantidad: (id: string, cantidad: number) => void
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <ul className="divide-y rounded-md border border-border">
        {items.map((c) => {
          const tildado = sel.has(c.id)
          return (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/40">
                <Checkbox checked={tildado} onCheckedChange={() => onToggle(c.id)} />
                <span className="flex-1">{c.nombre}</span>
                {c.enPanol && (
                  <span
                    className={cn(
                      "text-[11px]",
                      c.stockActual <= c.stockMin
                        ? "font-medium text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    quedan {c.stockActual}
                  </span>
                )}
                {tildado && (
                  <Input
                    type="number"
                    min={1}
                    className="h-7 w-16"
                    value={sel.get(c.id) ?? 1}
                    onClick={(e) => e.preventDefault()}
                    onChange={(e) => onCantidad(c.id, Number(e.target.value) || 1)}
                    aria-label={`Cantidad de ${c.nombre}`}
                  />
                )}
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PedidoDialog({
  pedido,
  catalogo,
  dominios,
  ots,
  onClose,
  onSaved,
}: {
  pedido: PedidoRepuestos | null
  catalogo: RepuestoCatalogo[]
  dominios: string[]
  ots: OtParaPedido[]
  onClose: () => void
  onSaved: () => void
}) {
  const [dominio, setDominio] = useState(pedido?.dominio ?? "")
  const [otId, setOtId] = useState(pedido?.otId ?? "")
  const [fecha, setFecha] = useState(pedido?.fecha ?? hoyISO())
  const [fechaCompra, setFechaCompra] = useState(pedido?.fechaCompra ?? "")
  const [fechaRetiro, setFechaRetiro] = useState(pedido?.fechaRetiro ?? "")
  const [proveedor, setProveedor] = useState(pedido?.proveedor ?? "")
  const [prioridad, setPrioridad] = useState(pedido?.prioridad ?? "media")
  const [monto, setMonto] = useState(pedido?.monto != null ? String(pedido.monto) : "")
  const [descripcion, setDescripcion] = useState(pedido?.descripcion ?? "")
  const [sel, setSel] = useState<Map<string, number>>(
    () =>
      new Map(
        (pedido?.items ?? [])
          .filter((i) => i.repuestoId)
          .map((i) => [i.repuestoId as string, i.cantidad])
      )
  )
  // Piezas que todavía no están en el catálogo: se dan de alta al guardar.
  const [nuevas, setNuevas] = useState<string[]>(
    () => (pedido?.items ?? []).filter((i) => !i.repuestoId).map((i) => i.nombre)
  )
  const [textoNueva, setTextoNueva] = useState("")
  const [saving, setSaving] = useState(false)

  const { panol, compra } = useMemo(
    () => ({
      panol: catalogo.filter((c) => c.enPanol),
      compra: catalogo.filter((c) => !c.enPanol),
    }),
    [catalogo]
  )

  const toggle = (id: string) =>
    setSel((prev) => {
      const m = new Map(prev)
      if (m.has(id)) m.delete(id)
      else m.set(id, 1)
      return m
    })

  const cantidad = (id: string, n: number) =>
    setSel((prev) => new Map(prev).set(id, n))

  const agregarNueva = () => {
    const t = textoNueva.trim()
    if (!t) return
    // Si ya está en el catálogo, se tilda en vez de duplicarla.
    const ya = catalogo.find((c) => c.nombre.toLowerCase() === t.toLowerCase())
    if (ya) {
      setSel((p) => new Map(p).set(ya.id, 1))
    } else if (!nuevas.some((n) => n.toLowerCase() === t.toLowerCase())) {
      setNuevas((p) => [...p, t])
    }
    setTextoNueva("")
  }

  async function guardar() {
    setSaving(true)
    const res = await upsertPedidoRepuestos({
      id: pedido?.id,
      dominio: dominio || null,
      otId: otId || null,
      fecha,
      fechaCompra: fechaCompra || null,
      fechaRetiro: fechaRetiro || null,
      proveedor,
      prioridad: prioridad as "baja" | "media" | "alta",
      monto: monto ? Number(monto.replace(",", ".")) : null,
      descripcion,
      items: [
        ...[...sel.entries()].map(([repuestoId, cantidad]) => ({ repuestoId, cantidad })),
        ...nuevas.map((nombreNuevo) => ({ nombreNuevo, cantidad: 1 })),
      ],
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success(pedido ? "Pedido actualizado" : "Pedido cargado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pedido ? "Editar pedido" : "Nuevo pedido de repuestos"}</DialogTitle>
          <DialogDescription>
            Tildá lo que se compra. Lo que no esté en la lista lo agregás abajo y queda
            cargado para la próxima vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label className="text-xs text-muted-foreground">Unidad</Label>
              <Select
                value={dominio || "ninguna"}
                onValueChange={(v: string | null) => setDominio(!v || v === "ninguna" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin unidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguna">Sin unidad (stock)</SelectItem>
                  {dominios.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">OT que lo espera</Label>
              <Select
                value={otId || "ninguna"}
                onValueChange={(v: string | null) => setOtId(!v || v === "ninguna" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin OT" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguna">Sin OT</SelectItem>
                  {ots
                    .filter((o) => !dominio || o.dominio === dominio)
                    .map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        OT {o.numeroOt ?? "s/n"} · {o.dominio} · {fmtFecha(o.fecha)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Se detecta</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Prioridad</Label>
              <Select
                value={prioridad}
                onValueChange={(v: string | null) => v && setPrioridad(v as "baja" | "media" | "alta")}
              >
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
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Proveedor</Label>
              <Input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="A quién se le compra"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Se compra</Label>
              <Input
                type="date"
                value={fechaCompra}
                onChange={(e) => setFechaCompra(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Se retira</Label>
              <Input
                type="date"
                value={fechaRetiro}
                onChange={(e) => setFechaRetiro(e.target.value)}
              />
            </div>
          </div>

          {/* La lista para tildar: el pañol primero, después lo que se compra. */}
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Qué se compra ({sel.size + nuevas.length} elegido
                {sel.size + nuevas.length === 1 ? "" : "s"})
              </Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {compra.length > 0 && (
                <ListaPiezas
                  titulo="Piezas de compra"
                  items={compra}
                  sel={sel}
                  onToggle={toggle}
                  onCantidad={cantidad}
                />
              )}
              {panol.length > 0 && (
                <ListaPiezas
                  titulo="Del pañol"
                  items={panol}
                  sel={sel}
                  onToggle={toggle}
                  onCantidad={cantidad}
                />
              )}
            </div>

            {nuevas.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {nuevas.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px]"
                  >
                    {n}
                    <button
                      type="button"
                      onClick={() => setNuevas((p) => p.filter((x) => x !== n))}
                      aria-label={`Quitar ${n}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={textoNueva}
                onChange={(e) => setTextoNueva(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    agregarNueva()
                  }
                }}
                placeholder="¿Falta una pieza en la lista? Escribila acá"
              />
              <Button type="button" variant="outline" onClick={agregarNueva}>
                Agregar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              La pieza nueva queda guardada en el catálogo para la próxima compra.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Monto (opcional)</Label>
              <Input
                type="number"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="$"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Observaciones</Label>
              <Textarea
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving || sel.size + nuevas.length === 0}>
            {saving ? (
              "Guardando…"
            ) : (
              <>
                <Truck className="mr-1 size-4" /> Guardar pedido
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
