"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  AlertTriangle,
  MessageSquareText,
  ShieldAlert,
  ClipboardCheck,
  Wrench,
  Plus,
  Pencil,
  ImageIcon,
  Loader2,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  eliminarItemChecklist,
  eliminarPlanChecklist,
  upsertPlanChecklist,
  type ChecklistComentario,
  type ChecklistItemNoOk,
  type ChecklistPlanEstado,
  type ChecklistPlanTipo,
} from "@/actions/mantenimiento-vehiculos"

function fmtFecha(f: string): string {
  return f.slice(0, 10).split("-").reverse().join("/")
}

function tipoLabel(t: string): string {
  return t === "liberacion" ? "Salida" : t === "retorno" ? "Retorno" : t
}

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        tipo === "liberacion"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-violet-200 bg-violet-50 text-violet-700"
      )}
    >
      {tipoLabel(tipo)}
    </Badge>
  )
}

const VALOR_BADGE: Record<string, string> = {
  nook: "border-red-200 bg-red-50 text-red-700",
  malo: "border-red-200 bg-red-50 text-red-700",
  regular: "border-amber-200 bg-amber-50 text-amber-700",
}

function ValorBadge({ valor }: { valor: string }) {
  const label = valor === "nook" ? "No OK" : valor === "regular" ? "Regular" : valor
  return (
    <Badge variant="outline" className={VALOR_BADGE[valor] ?? "border-slate-200 bg-slate-50"}>
      {label}
    </Badge>
  )
}

const PLAN_TIPO_LABEL: Record<ChecklistPlanTipo, string> = {
  correctivo: "Correctivo",
  preventivo: "Preventivo",
  proactivo: "Proactivo",
}
const PLAN_TIPO_BADGE: Record<ChecklistPlanTipo, string> = {
  correctivo: "border-orange-200 bg-orange-50 text-orange-700",
  preventivo: "border-sky-200 bg-sky-50 text-sky-700",
  proactivo: "border-violet-200 bg-violet-50 text-violet-700",
}
const PLAN_ESTADO_LABEL: Record<ChecklistPlanEstado, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
}
const PLAN_ESTADO_BADGE: Record<ChecklistPlanEstado, string> = {
  pendiente: "border-slate-200 bg-slate-50 text-slate-600",
  en_proceso: "border-amber-200 bg-amber-50 text-amber-700",
  resuelto: "border-emerald-200 bg-emerald-50 text-emerald-700",
}

/**
 * Contenedor con scroll horizontal y una BARRA DE SCROLL ARRIBA sincronizada con
 * la de abajo, para poder desplazar la tabla al costado sin tener que bajar
 * hasta la última fila.
 */
function ScrollX({ children }: { children: ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const medir = () => setAncho(el.scrollWidth)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener("resize", medir)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", medir)
    }
  }, [children])

  const sincronizar = (origen: "top" | "body") => {
    const t = topRef.current
    const b = bodyRef.current
    if (!t || !b) return
    if (origen === "top") b.scrollLeft = t.scrollLeft
    else t.scrollLeft = b.scrollLeft
  }

  return (
    <div>
      <div
        ref={topRef}
        onScroll={() => sincronizar("top")}
        className="overflow-x-auto overflow-y-hidden"
      >
        <div style={{ width: ancho, height: 1 }} />
      </div>
      <div ref={bodyRef} onScroll={() => sincronizar("body")} className="overflow-x-auto">
        {children}
      </div>
    </div>
  )
}

interface Props {
  itemsNoOk: ChecklistItemNoOk[]
  comentarios: ChecklistComentario[]
  puedeEditar: boolean
}

export function ChecklistsMtto({ itemsNoOk, comentarios, puedeEditar }: Props) {
  const router = useRouter()
  const [fDominio, setFDominio] = useState("todos")
  const [fTipo, setFTipo] = useState("todos")
  const [planItem, setPlanItem] = useState<ChecklistItemNoOk | null>(null)
  const [delItem, setDelItem] = useState<ChecklistItemNoOk | null>(null)
  const [delError, setDelError] = useState<string | null>(null)
  const [pendingDel, startDel] = useTransition()

  function confirmarBorrado() {
    if (!delItem) return
    setDelError(null)
    const id = delItem.id
    startDel(async () => {
      const res = await eliminarItemChecklist(id)
      if ("error" in res) {
        setDelError(res.error)
        return
      }
      setDelItem(null)
      router.refresh()
    })
  }

  const dominios = useMemo(() => {
    const s = new Set<string>()
    itemsNoOk.forEach((i) => s.add(i.dominio))
    comentarios.forEach((c) => s.add(c.dominio))
    return Array.from(s).sort()
  }, [itemsNoOk, comentarios])

  const items = useMemo(
    () =>
      itemsNoOk.filter(
        (i) =>
          (fDominio === "todos" || i.dominio === fDominio) &&
          (fTipo === "todos" || i.tipo === fTipo)
      ),
    [itemsNoOk, fDominio, fTipo]
  )

  const coments = useMemo(
    () =>
      comentarios.filter(
        (c) =>
          (fDominio === "todos" || c.dominio === fDominio) &&
          (fTipo === "todos" || c.tipo === fTipo)
      ),
    [comentarios, fDominio, fTipo]
  )

  const criticos = items.filter((i) => i.critico).length
  const conPlan = items.filter((i) => i.plan).length

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <AlertTriangle className="size-4 text-red-500" /> Ítems no OK
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", items.length > 0 ? "text-red-600" : "text-slate-900")}>
              {items.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <ShieldAlert className="size-4 text-red-600" /> Críticos no OK
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", criticos > 0 ? "text-red-600" : "text-slate-900")}>
              {criticos}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Wrench className="size-4 text-emerald-500" /> Con plan de acción
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">
              {conPlan}
              <span className="ml-1 text-sm font-normal text-slate-400">/ {items.length}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <MessageSquareText className="size-4 text-slate-400" /> Con comentarios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{coments.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-slate-500">Unidad</Label>
          <Select value={fDominio} onValueChange={(v: string | null) => setFDominio(v ?? "todos")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {dominios.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-500">Tipo</Label>
          <Select value={fTipo} onValueChange={(v: string | null) => setFTipo(v ?? "todos")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="liberacion">Salida</SelectItem>
              <SelectItem value="retorno">Retorno</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Ítems observados (no OK) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-slate-500" /> Ítems observados (no OK)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <ClipboardCheck className="size-8 text-emerald-300" />
              <p className="mt-3 text-sm text-slate-500">
                Sin ítems observados en los checklists. Todo OK.
              </p>
            </div>
          ) : (
            <ScrollX>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Ítem</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead>Comentario</TableHead>
                    <TableHead>Plan de acción</TableHead>
                    {puedeEditar && <TableHead className="text-right">Eliminar</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="whitespace-nowrap">{fmtFecha(i.fecha)}</TableCell>
                      <TableCell className="font-medium">{i.dominio}</TableCell>
                      <TableCell>
                        <TipoBadge tipo={i.tipo} />
                      </TableCell>
                      <TableCell className="text-slate-600">{i.categoria}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          {i.item}
                          {i.critico && (
                            <span title="Ítem crítico">
                              <ShieldAlert className="size-3.5 text-red-500" />
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ValorBadge valor={i.valor} />
                      </TableCell>
                      <TableCell className="text-slate-600">{i.chofer || "—"}</TableCell>
                      <TableCell className="max-w-72 text-slate-600">
                        {i.comentario || <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="min-w-44">
                        <PlanCell item={i} puedeEditar={puedeEditar} onEditar={() => setPlanItem(i)} />
                      </TableCell>
                      {puedeEditar && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                            title="Eliminar esta observación"
                            onClick={() => {
                              setDelError(null)
                              setDelItem(i)
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
            </ScrollX>
          )}
        </CardContent>
      </Card>

      {/* Comentarios y observaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="size-4 text-slate-500" /> Comentarios y observaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          {coments.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              Sin comentarios cargados en los checklists del período.
            </p>
          ) : (
            <ScrollX>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead>Observación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coments.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">{fmtFecha(c.fecha)}</TableCell>
                    <TableCell className="font-medium">{c.dominio}</TableCell>
                    <TableCell>
                      <TipoBadge tipo={c.tipo} />
                    </TableCell>
                    <TableCell className="text-slate-600">{c.chofer || "—"}</TableCell>
                    <TableCell className="max-w-md text-slate-700">{c.observaciones}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </ScrollX>
          )}
        </CardContent>
      </Card>

      {planItem && (
        <PlanDialog
          item={planItem}
          onClose={() => setPlanItem(null)}
        />
      )}

      <Dialog open={!!delItem} onOpenChange={(o: boolean) => !o && !pendingDel && setDelItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar observación</DialogTitle>
            <DialogDescription>
              {delItem && (
                <>
                  {delItem.dominio} · {delItem.item} · {fmtFecha(delItem.fecha)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Se quita esta observación No OK del listado{delItem?.plan ? " junto con su plan de acción" : ""}. Esta acción no se puede deshacer.
          </p>
          {delError && <p className="text-sm text-red-600">{delError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDelItem(null)} disabled={pendingDel}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="gap-1 bg-red-600 text-white hover:bg-red-700"
              onClick={confirmarBorrado}
              disabled={pendingDel}
            >
              {pendingDel && <Loader2 className="size-4 animate-spin" />}
              <Trash2 className="size-4" /> Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PlanCell({
  item,
  puedeEditar,
  onEditar,
}: {
  item: ChecklistItemNoOk
  puedeEditar: boolean
  onEditar: () => void
}) {
  const plan = item.plan
  if (!plan) {
    if (!puedeEditar) return <span className="text-slate-300">—</span>
    return (
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onEditar}>
        <Plus className="size-3.5" /> Agregar
      </Button>
    )
  }
  return (
    <button
      type="button"
      disabled={!puedeEditar}
      onClick={puedeEditar ? onEditar : undefined}
      className={cn(
        "flex w-full flex-col items-start gap-1 rounded-md p-1 text-left",
        puedeEditar && "hover:bg-slate-50"
      )}
      title={plan.descripcion}
    >
      <span className="flex flex-wrap items-center gap-1">
        <Badge variant="outline" className={cn("text-xs", PLAN_TIPO_BADGE[plan.tipo])}>
          {PLAN_TIPO_LABEL[plan.tipo]}
        </Badge>
        <Badge variant="outline" className={cn("text-xs", PLAN_ESTADO_BADGE[plan.estado])}>
          {PLAN_ESTADO_LABEL[plan.estado]}
        </Badge>
      </span>
      <span className="line-clamp-2 max-w-56 text-xs text-slate-600">{plan.descripcion}</span>
      <span className="flex items-center gap-2 text-[11px] text-slate-400">
        {plan.fotoUrl && (
          <span className="flex items-center gap-0.5">
            <ImageIcon className="size-3" /> foto
          </span>
        )}
        {puedeEditar && (
          <span className="flex items-center gap-0.5 text-sky-600">
            <Pencil className="size-3" /> editar
          </span>
        )}
      </span>
    </button>
  )
}

function PlanDialog({ item, onClose }: { item: ChecklistItemNoOk; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const plan = item.plan
  const [tipo, setTipo] = useState<ChecklistPlanTipo>(plan?.tipo ?? "correctivo")
  const [estado, setEstado] = useState<ChecklistPlanEstado>(plan?.estado ?? "resuelto")
  const [descripcion, setDescripcion] = useState(plan?.descripcion ?? "")
  const [foto, setFoto] = useState<File | null>(null)
  const [eliminarFoto, setEliminarFoto] = useState(false)

  function guardar() {
    setError(null)
    if (!descripcion.trim()) {
      setError("Escribí qué se trabajó / reparó.")
      return
    }
    const fd = new FormData()
    fd.set("respuesta_id", item.id)
    fd.set("tipo", tipo)
    fd.set("estado", estado)
    fd.set("descripcion", descripcion.trim())
    if (foto) fd.set("foto", foto)
    if (eliminarFoto) fd.set("eliminar_foto", "1")
    startTransition(async () => {
      const res = await upsertPlanChecklist(fd)
      if ("error" in res) {
        setError(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  function borrar() {
    if (!plan) return
    setError(null)
    startTransition(async () => {
      const res = await eliminarPlanChecklist(item.id)
      if ("error" in res) {
        setError(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  const fotoActual = plan?.fotoUrl && !eliminarFoto

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan de acción</DialogTitle>
          <DialogDescription>
            {item.dominio} · {item.item} · {fmtFecha(item.fecha)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Tipo</Label>
              <Select value={tipo} onValueChange={(v: string | null) => v && setTipo(v as ChecklistPlanTipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="correctivo">Correctivo</SelectItem>
                  <SelectItem value="preventivo">Preventivo</SelectItem>
                  <SelectItem value="proactivo">Proactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Estado</Label>
              <Select value={estado} onValueChange={(v: string | null) => v && setEstado(v as ChecklistPlanEstado)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="en_proceso">En proceso</SelectItem>
                  <SelectItem value="resuelto">Resuelto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-500">¿Qué se trabajó / cómo se reparó?</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
              placeholder="Describí la reparación realizada sobre este ítem…"
            />
          </div>

          <div>
            <Label className="text-xs text-slate-500">Foto de la reparación (opcional)</Label>
            {fotoActual ? (
              <div className="mt-1 flex items-center gap-3">
                <a
                  href={plan!.fotoUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-sm text-sky-600 hover:underline"
                >
                  <ImageIcon className="size-4" /> Ver foto actual
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs text-red-600"
                  onClick={() => setEliminarFoto(true)}
                >
                  <Trash2 className="size-3.5" /> Quitar
                </Button>
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              />
            )}
            {eliminarFoto && (
              <p className="mt-1 text-xs text-amber-600">
                Se quitará la foto actual al guardar.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setEliminarFoto(false)}
                >
                  Deshacer
                </button>
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          {plan ? (
            <Button
              type="button"
              variant="ghost"
              className="gap-1 text-red-600 hover:text-red-700"
              onClick={borrar}
              disabled={pending}
            >
              <Trash2 className="size-4" /> Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" onClick={guardar} disabled={pending}>
              {pending && <Loader2 className="mr-1 size-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
