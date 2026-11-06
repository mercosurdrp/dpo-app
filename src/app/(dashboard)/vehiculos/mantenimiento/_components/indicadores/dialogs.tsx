"use client"

// Diálogos del tablero de Indicadores (movidos tal cual desde
// indicadores-flota.tsx): detalle de un PI, crear plan y detalle de plan con
// los comentarios y fotos de cada acción.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient as createClientBrowser } from "@/lib/supabase/client"
import {
  addFlotaPlanItem,
  agregarAvanceFlotaPlan,
  cerrarFlotaPlan,
  createFlotaPlan,
  deleteFlotaPlan,
  deleteFlotaPlanItem,
  eliminarAvanceFlotaPlan,
  getFlotaKpiDetalle,
  listarAvancesFlotaPlan,
  updateFlotaPlanItem,
  type DetalleKpi,
  type FlotaKpiConDetalle,
  type FlotaPlanAvance,
  type FlotaPlanConItems,
} from "@/actions/flota-indicadores"
import { PlanHerramientasInline } from "@/components/herramientas-gestion/plan-herramientas-inline"
import { fmtMesLargo, pad } from "./formato"
import type { KpiDef } from "./kpi-defs"
import { EstadoPlanBadge } from "./planes-accion"

/** Encabezado del panel: qué significan el numerador y el denominador. */
const RESUMEN_DETALLE: Record<FlotaKpiConDetalle, (d: DetalleKpi) => string> = {
  checklist_deteccion: (d) =>
    `${d.numerador} de ${d.denominador} ${d.denominador === 1 ? "OT correctiva" : "OT correctivas"} venían anticipadas por un defecto de checklist`,
  checklist_resolucion: (d) =>
    `${d.denominador} ${d.denominador === 1 ? "plan resuelto" : "planes resueltos"}, ${(d.denominador > 0 ? d.numerador / d.denominador : 0).toFixed(1)} días promedio${d.excluidos > 0 ? ` · ${d.excluidos} sin tiempo medible` : ""}`,
  repuestos_trazabilidad: (d) =>
    `${d.numerador} de ${d.denominador} ${d.denominador === 1 ? "egreso" : "egresos"} del pañol salieron contra una OT o un plan del checklist${d.excluidos > 0 ? ` · ${d.excluidos} ajuste${d.excluidos === 1 ? "" : "s"} por conteo afuera` : ""}`,
  inventario_exactitud: (d) =>
    `${d.numerador} de ${d.denominador} ${d.denominador === 1 ? "ítem contado" : "ítems contados"} sin diferencia en el último conteo del mes`,
  repuestos_stock_minimo: (d) =>
    `${d.numerador} de ${d.denominador} ${d.denominador === 1 ? "ítem con mínimo" : "ítems con mínimo"} en o por encima del mínimo${d.excluidos > 0 ? ` · ${d.excluidos} sin mínimo definido` : ""}`,
  cil_fugas_detectadas: (d) =>
    `${d.numerador} ${d.numerador === 1 ? "hallazgo" : "hallazgos"} de aceite en ${d.denominador} ${d.denominador === 1 ? "control" : "controles"} del CIL`,
  fugas_aceite_ruta: (d) =>
    `${d.numerador} ${d.numerador === 1 ? "pérdida llegó" : "pérdidas llegaron"} al checklist diario` +
    (d.excluidos > 0 ? ` · ${d.excluidos} venía${d.excluidos === 1 ? "" : "n"} del mes anterior` : ""),
  presupuesto_desvio: (d) =>
    `Gastado $${d.numerador.toLocaleString("es-AR")} contra $${d.denominador.toLocaleString("es-AR")} presupuestados` +
    (d.denominador > 0
      ? ` · ${(((d.numerador - d.denominador) / d.denominador) * 100).toFixed(0)} % de desvío`
      : ""),
}

export function DetalleKpiDialog({
  kpi,
  label,
  ym,
  onClose,
}: {
  kpi: FlotaKpiConDetalle
  label: string
  ym: string
  onClose: () => void
}) {
  const [data, setData] = useState<DetalleKpi | null>(null)
  const [error, setError] = useState<string | null>(null)

  // El diálogo se monta al abrirlo y se desmonta al cerrarlo (va con `key`),
  // así que el efecto corre una sola vez y no hace falta limpiar el estado.
  useEffect(() => {
    let vivo = true
    getFlotaKpiDetalle(kpi, ym).then((res) => {
      if (!vivo) return
      if ("error" in res) setError(res.error)
      else setData(res.data)
    })
    return () => {
      vivo = false
    }
  }, [kpi, ym])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {fmtMesLargo(ym)}
            {data ? ` · ${RESUMEN_DETALLE[kpi](data)}` : ""}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : data.filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hubo casos en el mes: el PI no tiene sobre qué calcularse.
          </p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {data.filas.map((f, i) => (
              <li key={i} className="flex items-start gap-3 py-2">
                {/* El punto de color dice de una si la fila suma o no. */}
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    f.cuenta === true
                      ? "bg-emerald-500"
                      : f.cuenta === false
                        ? "bg-destructive"
                        : "bg-muted-foreground/40"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {f.titulo}
                    {f.fecha && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {f.fecha}
                      </span>
                    )}
                    {f.valor != null && (
                      <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">
                        {f.valor.toFixed(1)} d
                      </span>
                    )}
                  </p>
                  {f.subtitulo && (
                    <p className="truncate text-xs text-muted-foreground">{f.subtitulo}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{f.motivo}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ==================== Dialog: crear plan ====================

interface ItemForm {
  accion: string
  responsable: string
  fecha: string
}

export function CrearPlanDialog({
  def, ym, valor, meta, onClose, onSaved,
}: {
  def: KpiDef
  ym: string
  valor: number | null
  meta: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [causa, setCausa] = useState("")
  const [items, setItems] = useState<ItemForm[]>([{ accion: "", responsable: "", fecha: "" }])
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    if (!causa.trim()) {
      toast.error("Cargá la causa raíz")
      return
    }
    const itemsOk = items.filter((i) => i.accion.trim() && i.responsable.trim() && i.fecha)
    if (itemsOk.length === 0) {
      toast.error("Cargá al menos una acción completa (acción, responsable y fecha)")
      return
    }
    setSaving(true)
    const res = await createFlotaPlan({
      kpi: def.kpi,
      mes: Number(ym.slice(5, 7)),
      year: Number(ym.slice(0, 4)),
      valorMes: valor,
      metaMes: meta,
      causaRaiz: causa,
      items: itemsOk.map((i) => ({
        accion: i.accion,
        responsable: i.responsable,
        fechaCompromiso: i.fecha,
      })),
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Plan de acción creado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Plan de acción — {def.label} · {fmtMesLargo(ym)}
          </DialogTitle>
          <DialogDescription>
            {valor != null && (
              <>
                Valor del mes: <span className="font-medium">{def.fmt(valor)}</span>
                {meta != null && (
                  <>
                    {" "}· Meta: <span className="font-medium">{def.fmt(meta)}</span>
                  </>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Causa raíz</Label>
            <Textarea
              value={causa}
              onChange={(e) => setCausa(e.target.value)}
              placeholder="¿Por qué quedó fuera de meta?"
              rows={2}
            />
          </div>

          <div>
            <Label>Acciones</Label>
            <div className="mt-1.5 space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={it.accion}
                    onChange={(e) =>
                      setItems(items.map((x, j) => (j === i ? { ...x, accion: e.target.value } : x)))
                    }
                    placeholder="Acción"
                    className="flex-1"
                  />
                  <Input
                    value={it.responsable}
                    onChange={(e) =>
                      setItems(
                        items.map((x, j) => (j === i ? { ...x, responsable: e.target.value } : x))
                      )
                    }
                    placeholder="Responsable"
                    className="w-40"
                  />
                  <Input
                    type="date"
                    value={it.fecha}
                    onChange={(e) =>
                      setItems(items.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)))
                    }
                    className="w-40"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setItems([...items, { accion: "", responsable: "", fecha: "" }])}
            >
              <Plus className="mr-1 size-4" /> Agregar acción
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Crear plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Dialog: detalle de plan ====================

export function DetallePlanDialog({
  plan, def, puedeEditar, esAdmin, onClose, onChanged,
}: {
  plan: FlotaPlanConItems
  def: KpiDef | undefined
  puedeEditar: boolean
  esAdmin: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [nuevo, setNuevo] = useState<ItemForm>({ accion: "", responsable: "", fecha: "" })
  const [resultado, setResultado] = useState("")
  const [cerrando, setCerrando] = useState(false)
  const [saving, setSaving] = useState(false)
  const cerrado = plan.estado === "cerrado"

  /*
   * Los comentarios de TODAS las acciones del plan se leen de una sola vez al
   * abrir el diálogo y se reparten por acción: con una consulta por renglón,
   * un plan de cinco acciones pegaba cinco veces a la base para mostrar lo
   * mismo.
   */
  const [avances, setAvances] = useState<FlotaPlanAvance[]>([])
  const [recarga, setRecarga] = useState(0)
  const recargarAvances = useCallback(() => setRecarga((n) => n + 1), [])

  useEffect(() => {
    let vivo = true
    listarAvancesFlotaPlan(plan.id).then((res) => {
      if (vivo) setAvances("error" in res ? [] : res.data)
    })
    return () => {
      vivo = false
    }
  }, [plan.id, recarga])

  const avancesPorItem = useMemo(() => {
    const m = new Map<string, FlotaPlanAvance[]>()
    for (const a of avances) {
      if (!a.item_id) continue
      const arr = m.get(a.item_id)
      if (arr) arr.push(a)
      else m.set(a.item_id, [a])
    }
    return m
  }, [avances])

  const agregarItem = async () => {
    if (!nuevo.accion.trim() || !nuevo.responsable.trim() || !nuevo.fecha) {
      toast.error("Completá acción, responsable y fecha")
      return
    }
    setSaving(true)
    const res = await addFlotaPlanItem({
      planId: plan.id,
      accion: nuevo.accion,
      responsable: nuevo.responsable,
      fechaCompromiso: nuevo.fecha,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setNuevo({ accion: "", responsable: "", fecha: "" })
    onChanged()
    onClose()
  }

  const toggleItem = async (id: string, completado: boolean) => {
    const res = await updateFlotaPlanItem({
      id,
      estado: completado ? "completado" : "pendiente",
    })
    if ("error" in res) toast.error(res.error)
    else {
      onChanged()
      onClose()
    }
  }

  const cerrarPlan = async () => {
    if (!resultado.trim()) {
      toast.error("Contá el resultado del plan para cerrarlo")
      return
    }
    setSaving(true)
    const res = await cerrarFlotaPlan(plan.id, resultado)
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Plan cerrado")
    onChanged()
    onClose()
  }

  const borrarPlan = async () => {
    const res = await deleteFlotaPlan(plan.id)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success("Plan eliminado")
      onChanged()
      onClose()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {def?.label ?? plan.kpi} · {fmtMesLargo(`${plan.year}-${pad(plan.mes)}`)}
            <EstadoPlanBadge estado={plan.estado} />
          </DialogTitle>
          <DialogDescription>
            {plan.valor_mes != null && def && (
              <>
                Valor: <span className="font-medium">{def.fmt(Number(plan.valor_mes))}</span>
              </>
            )}
            {plan.meta_mes != null && def && (
              <>
                {" "}· Meta: <span className="font-medium">{def.fmt(Number(plan.meta_mes))}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Causa raíz</p>
            <p className="mt-0.5 text-sm text-foreground">{plan.causa_raiz}</p>
            {/*
              La causa raíz era un párrafo escrito a mano. Desde acá se le puede
              aplicar el método: 5 Porqués, Causa-Efecto o PDCA, con el mismo
              formato que en el resto de la app y con PDF para la auditoría.
            */}
            <PlanHerramientasInline
              flotaPlanId={plan.id}
              tituloSugerido={def ? def.label : "Plan de acción de flota"}
              puedeAplicar={puedeEditar && !cerrado}
            />
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Acciones</p>
            <div className="mt-1.5 space-y-1.5">
              {plan.items.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin acciones cargadas.</p>
              )}
              {plan.items.map((it) => (
                <div key={it.id} className="rounded-md border border-border px-2.5 py-1.5">
                 <div className="flex items-center gap-2">
                  <Checkbox
                    checked={it.estado === "completado"}
                    disabled={!puedeEditar || cerrado}
                    onCheckedChange={(v) => toggleItem(it.id, v === true)}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm text-foreground",
                        it.estado === "completado" && "text-muted-foreground line-through"
                      )}
                    >
                      {it.accion}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {it.responsable} · compromiso{" "}
                      {it.fecha_compromiso.slice(0, 10).split("-").reverse().join("/")}
                      {it.fecha_completado &&
                        ` · completado ${it.fecha_completado.slice(0, 10).split("-").reverse().join("/")}`}
                    </p>
                  </div>
                  {puedeEditar && !cerrado && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        const res = await deleteFlotaPlanItem(it.id)
                        if ("error" in res) toast.error(res.error)
                        else {
                          onChanged()
                          onClose()
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                 </div>

                 {/*
                   Comentario y fotos DE ESTA ACCIÓN. Un plan con cinco acciones
                   tenía un solo renglón de seguimiento para las cinco y no se
                   sabía a cuál se refería "ya se pidió el turno".
                 */}
                 <AvancesDeAccion
                   planId={plan.id}
                   itemId={it.id}
                   avances={avancesPorItem.get(it.id) ?? []}
                   puedeEditar={puedeEditar && !cerrado}
                   onChanged={recargarAvances}
                 />
                </div>
              ))}
            </div>

            {puedeEditar && !cerrado && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={nuevo.accion}
                  onChange={(e) => setNuevo({ ...nuevo, accion: e.target.value })}
                  placeholder="Nueva acción"
                  className="flex-1"
                />
                <Input
                  value={nuevo.responsable}
                  onChange={(e) => setNuevo({ ...nuevo, responsable: e.target.value })}
                  placeholder="Responsable"
                  className="w-36"
                />
                <Input
                  type="date"
                  value={nuevo.fecha}
                  onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
                  className="w-36"
                />
                <Button size="sm" onClick={agregarItem} disabled={saving}>
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {cerrado ? (
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
              <p className="text-xs font-medium uppercase text-emerald-600 dark:text-emerald-400">
                Cerrado{" "}
                {plan.fecha_cierre &&
                  `el ${plan.fecha_cierre.slice(0, 10).split("-").reverse().join("/")}`}
              </p>
              <p className="mt-0.5">{plan.resultado_cierre}</p>
            </div>
          ) : (
            puedeEditar &&
            (cerrando ? (
              <div className="space-y-2 rounded-md border border-border bg-muted p-3">
                <Label>Resultado del cierre</Label>
                <Textarea
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                  placeholder="¿Qué se logró? ¿Volvió a meta?"
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCerrando(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={cerrarPlan} disabled={saving}>
                    {saving ? "Cerrando…" : "Cerrar plan"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between">
                {esAdmin ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={borrarPlan}
                  >
                    <Trash2 className="mr-1 size-4" /> Eliminar
                  </Button>
                ) : (
                  <span />
                )}
                <Button variant="outline" size="sm" onClick={() => setCerrando(true)}>
                  Cerrar plan
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Comentarios y fotos de UNA acción del plan.
 *
 * El plan tenía tres momentos —se abre, se tildan las acciones, se cierra— y
 * nada en el medio. Lo que falta contar es justamente eso: se pidió el turno,
 * llegó el repuesto, el taller lo devolvió sin hacer. Y cuelga de la acción,
 * no del plan: con un solo renglón para las cinco acciones no se sabía a cuál
 * se refería.
 *
 * Las fotos son OPCIONALES a propósito: la mayoría de los avances son una
 * línea de texto, y exigir evidencia para escribirla logra que no se escriba
 * nada. Hasta dos, que es lo que entra en una pantalla sin tapar la acción.
 */
function AvancesDeAccion({
  planId,
  itemId,
  avances,
  puedeEditar,
  onChanged,
}: {
  planId: string
  itemId: string
  avances: FlotaPlanAvance[]
  puedeEditar: boolean
  onChanged: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [comentario, setComentario] = useState("")
  const [fotos, setFotos] = useState<File[]>([])
  const [guardando, setGuardando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const supabase = useMemo(() => createClientBrowser(), [])
  const urlDe = (path: string) =>
    supabase.storage.from("mantenimiento-evidencias").getPublicUrl(path).data.publicUrl

  const guardar = async () => {
    if (!comentario.trim() && fotos.length === 0) {
      toast.error("Escribí un comentario o adjuntá una foto")
      return
    }
    setGuardando(true)
    const fd = new FormData()
    fd.set("comentario", comentario)
    fd.set("item_id", itemId)
    for (const f of fotos) fd.append("archivo", f)
    const res = await agregarAvanceFlotaPlan(planId, fd)
    setGuardando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setComentario("")
    setFotos([])
    if (fileRef.current) fileRef.current.value = ""
    setAbierto(false)
    toast.success("Comentario agregado")
    onChanged()
  }

  const borrar = async (id: string) => {
    if (!window.confirm("¿Eliminar este comentario?")) return
    const res = await eliminarAvanceFlotaPlan(id)
    if ("error" in res) toast.error(res.error)
    else onChanged()
  }

  return (
    <div className="ml-6 mt-1 space-y-1.5">
      {avances.map((a) => (
        <div key={a.id} className="flex items-start gap-2 border-l-2 border-border pl-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              {new Date(a.created_at).toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {a.autor_nombre ? ` · ${a.autor_nombre}` : ""}
            </p>
            {a.comentario && (
              <p className="whitespace-pre-wrap text-xs text-foreground">{a.comentario}</p>
            )}
            {a.archivos.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {a.archivos.map((f) => (
                  <a key={f.path} href={urlDe(f.path)} target="_blank" rel="noreferrer" title={f.nombre}>
                    {(f.mime ?? "").startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={urlDe(f.path)}
                        alt={f.nombre}
                        className="h-16 w-24 rounded border object-cover"
                      />
                    ) : (
                      <span className="text-[11px] text-primary underline">{f.nombre}</span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
          {puedeEditar && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={() => borrar(a.id)}
              aria-label="Eliminar comentario"
            >
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      ))}

      {puedeEditar &&
        (abierto ? (
          <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Qué se hizo o en qué está"
              rows={2}
              className="text-sm"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.pdf"
                  className="h-8 w-auto text-xs"
                  onChange={(e) => setFotos(Array.from(e.target.files ?? []).slice(0, 2))}
                />
                <span className="text-[11px] text-muted-foreground">
                  {fotos.length > 0 ? `${fotos.length} de 2` : "hasta 2, opcionales"}
                </span>
              </div>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={guardar} disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => setAbierto(true)}
          >
            <Plus className="mr-1 size-3" /> Comentario / foto
          </Button>
        ))}
    </div>
  )
}
