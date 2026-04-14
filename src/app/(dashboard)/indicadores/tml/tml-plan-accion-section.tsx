"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  TmlPlanResumen,
  TmlPlanAccionItem,
  PlanTmlItemEstado,
} from "@/types/database"
import {
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  ShieldAlert,
  ListChecks,
  X,
} from "lucide-react"
import {
  createTmlPlan,
  getTmlPlanById,
  addTmlPlanItem,
  updateTmlPlanItem,
  deleteTmlPlanItem,
  updateTmlPlanCausaRaiz,
  cerrarTmlPlan,
  deleteTmlPlan,
} from "@/actions/tml-plan-accion"

const MESES = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

interface Props {
  resumen: TmlPlanResumen[]
}

export function TmlPlanAccionSection({ resumen }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [createFor, setCreateFor] = useState<TmlPlanResumen | null>(null)
  const [openPlanId, setOpenPlanId] = useState<string | null>(null)

  const mesesFuera = resumen.filter((r) => r.fuera_meta)
  const mesesFueraConPlan = mesesFuera.filter((r) => r.plan != null).length
  const pctConPlan =
    mesesFuera.length === 0
      ? 100
      : Math.round((mesesFueraConPlan / mesesFuera.length) * 100)

  function refresh() {
    startTransition(() => router.refresh())
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">Planes de Acción TML (R1.1.4)</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Cada mes fuera de meta requiere un plan con causa raíz y acciones concretas.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">% meses con plan</p>
            <p
              className={`text-2xl font-bold ${
                pctConPlan === 100
                  ? "text-green-600"
                  : pctConPlan >= 50
                  ? "text-amber-600"
                  : "text-red-600"
              }`}
            >
              {pctConPlan}%
            </p>
            <p className="text-xs text-muted-foreground">
              {mesesFueraConPlan}/{mesesFuera.length} meses
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {resumen.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin datos de TML cargados todavía.
            </p>
          ) : (
            <div className="space-y-2">
              {resumen.map((r) => (
                <MesRow
                  key={`${r.year}-${r.mes}`}
                  resumen={r}
                  onCreatePlan={() => setCreateFor(r)}
                  onOpenPlan={() => r.plan && setOpenPlanId(r.plan.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {createFor && (
        <CreatePlanDialog
          resumen={createFor}
          onClose={() => setCreateFor(null)}
          onCreated={(planId) => {
            setCreateFor(null)
            setOpenPlanId(planId)
            refresh()
          }}
        />
      )}

      {openPlanId && (
        <PlanDetailDialog
          planId={openPlanId}
          onClose={() => {
            setOpenPlanId(null)
            refresh()
          }}
        />
      )}
    </>
  )
}

// ==================== Fila por mes ====================
function MesRow({
  resumen,
  onCreatePlan,
  onOpenPlan,
}: {
  resumen: TmlPlanResumen
  onCreatePlan: () => void
  onOpenPlan: () => void
}) {
  const label = `${MESES[resumen.mes]} ${resumen.year}`
  const enVerde = !resumen.fuera_meta
  const plan = resumen.plan

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 ${
        enVerde
          ? "border-green-100 bg-green-50/40"
          : plan
          ? "border-amber-200 bg-amber-50/40"
          : "border-red-200 bg-red-50/40"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-900">{label}</p>
          {enVerde ? (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
              Dentro de meta
            </Badge>
          ) : plan ? (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
              Con plan · {plan.estado}
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
              <ShieldAlert className="mr-1 h-3 w-3" /> Sin plan
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          TML {resumen.promedio_tml} min · {resumen.pct_dentro_meta}% dentro meta
          {plan && (
            <>
              {" "}
              · {resumen.items_completados}/{resumen.items_total} acciones completadas
            </>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        {enVerde ? null : plan ? (
          <Button variant="outline" size="sm" onClick={onOpenPlan}>
            <ListChecks className="mr-1 h-4 w-4" /> Ver plan
          </Button>
        ) : (
          <Button size="sm" onClick={onCreatePlan}>
            <Plus className="mr-1 h-4 w-4" /> Crear plan
          </Button>
        )}
      </div>
    </div>
  )
}

// ==================== Dialog crear plan ====================
function CreatePlanDialog({
  resumen,
  onClose,
  onCreated,
}: {
  resumen: TmlPlanResumen
  onClose: () => void
  onCreated: (planId: string) => void
}) {
  const [causaRaiz, setCausaRaiz] = useState("")
  const [items, setItems] = useState<
    Array<{ accion: string; responsable: string; fechaCompromiso: string }>
  >([{ accion: "", responsable: "", fechaCompromiso: "" }])
  const [saving, setSaving] = useState(false)

  function updateItem(idx: number, patch: Partial<(typeof items)[number]>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function addItem() {
    setItems((prev) => [...prev, { accion: "", responsable: "", fechaCompromiso: "" }])
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!causaRaiz.trim()) {
      toast.error("La causa raíz es obligatoria")
      return
    }
    const validItems = items.filter(
      (i) => i.accion.trim() && i.responsable.trim() && i.fechaCompromiso,
    )
    if (validItems.length === 0) {
      toast.error("Agregá al menos una acción completa")
      return
    }
    setSaving(true)
    const result = await createTmlPlan({
      mes: resumen.mes,
      year: resumen.year,
      promedioTmlMes: resumen.promedio_tml,
      pctDentroMetaMes: resumen.pct_dentro_meta,
      causaRaiz,
      items: validItems,
    })
    setSaving(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("Plan creado")
    onCreated(result.data.id)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Plan de acción · {MESES[resumen.mes]} {resumen.year}
          </DialogTitle>
          <DialogDescription>
            TML {resumen.promedio_tml} min · {resumen.pct_dentro_meta}% dentro de meta
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Causa raíz (5 porqués)</Label>
            <Textarea
              rows={4}
              placeholder="Por qué el TML del mes no cumplió la meta. Aplicá la técnica de los 5 porqués."
              value={causaRaiz}
              onChange={(e) => setCausaRaiz(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Acciones</Label>
            {items.map((item, idx) => (
              <div
                key={idx}
                className="space-y-2 rounded-md border bg-slate-50 p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Acción #{idx + 1}
                  </p>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-red-500"
                      onClick={() => removeItem(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="Qué hay que hacer"
                  value={item.accion}
                  onChange={(e) => updateItem(idx, { accion: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Responsable"
                    value={item.responsable}
                    onChange={(e) => updateItem(idx, { responsable: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={item.fechaCompromiso}
                    onChange={(e) => updateItem(idx, { fechaCompromiso: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="mr-1 h-4 w-4" /> Agregar acción
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Dialog detalle/edición ====================
function PlanDetailDialog({
  planId,
  onClose,
}: {
  planId: string
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<{
    causa_raiz: string
    estado: string
    mes: number
    year: number
    fecha_cierre: string | null
    resultado_cierre: string | null
  } | null>(null)
  const [items, setItems] = useState<TmlPlanAccionItem[]>([])
  const [editingCausa, setEditingCausa] = useState(false)
  const [causaEdit, setCausaEdit] = useState("")
  const [newAccion, setNewAccion] = useState("")
  const [newResp, setNewResp] = useState("")
  const [newFecha, setNewFecha] = useState("")
  const [busy, setBusy] = useState(false)
  const [closingMode, setClosingMode] = useState(false)
  const [resultadoCierre, setResultadoCierre] = useState("")

  async function reload() {
    setLoading(true)
    const res = await getTmlPlanById(planId)
    setLoading(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setPlan({
      causa_raiz: res.data.plan.causa_raiz,
      estado: res.data.plan.estado,
      mes: res.data.plan.mes,
      year: res.data.plan.year,
      fecha_cierre: res.data.plan.fecha_cierre,
      resultado_cierre: res.data.plan.resultado_cierre,
    })
    setItems(res.data.items)
    setCausaEdit(res.data.plan.causa_raiz)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  async function handleSaveCausa() {
    setBusy(true)
    const r = await updateTmlPlanCausaRaiz(planId, causaEdit)
    setBusy(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    toast.success("Causa raíz actualizada")
    setEditingCausa(false)
    reload()
  }

  async function handleAddItem() {
    if (!newAccion.trim() || !newResp.trim() || !newFecha) {
      toast.error("Completá todos los campos de la acción")
      return
    }
    setBusy(true)
    const r = await addTmlPlanItem({
      planId,
      accion: newAccion,
      responsable: newResp,
      fechaCompromiso: newFecha,
    })
    setBusy(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    setNewAccion("")
    setNewResp("")
    setNewFecha("")
    reload()
  }

  async function handleItemEstado(id: string, estado: PlanTmlItemEstado) {
    const r = await updateTmlPlanItem({ id, estado })
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    reload()
  }

  async function handleItemDelete(id: string) {
    const r = await deleteTmlPlanItem(id)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    reload()
  }

  async function handleCerrarPlan() {
    if (!resultadoCierre.trim()) {
      toast.error("Escribí el resultado del cierre")
      return
    }
    setBusy(true)
    const r = await cerrarTmlPlan(planId, resultadoCierre)
    setBusy(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    toast.success("Plan cerrado")
    setClosingMode(false)
    reload()
  }

  async function handleDeletePlan() {
    if (!confirm("¿Eliminar el plan completo?")) return
    setBusy(true)
    const r = await deleteTmlPlan(planId)
    setBusy(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    toast.success("Plan eliminado")
    onClose()
  }

  const cerrado = plan?.estado === "cerrado"

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Plan · {plan ? `${MESES[plan.mes]} ${plan.year}` : "..."}
            {plan && (
              <Badge
                className={`ml-2 ${
                  plan.estado === "cerrado"
                    ? "bg-green-100 text-green-700"
                    : plan.estado === "en_progreso"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-700"
                } hover:${plan.estado}`}
              >
                {plan.estado}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading || !plan ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Causa raíz */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Causa raíz</Label>
                {!cerrado &&
                  (editingCausa ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingCausa(false)
                        setCausaEdit(plan.causa_raiz)
                      }}
                    >
                      Cancelar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setEditingCausa(true)}>
                      Editar
                    </Button>
                  ))}
              </div>
              {editingCausa ? (
                <>
                  <Textarea
                    rows={3}
                    value={causaEdit}
                    onChange={(e) => setCausaEdit(e.target.value)}
                  />
                  <Button size="sm" onClick={handleSaveCausa} disabled={busy}>
                    Guardar
                  </Button>
                </>
              ) : (
                <p className="whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-sm">
                  {plan.causa_raiz}
                </p>
              )}
            </div>

            {/* Items */}
            <div className="space-y-2">
              <Label>Acciones ({items.length})</Label>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin acciones cargadas.</p>
              ) : (
                items.map((it) => (
                  <div
                    key={it.id}
                    className="space-y-2 rounded-md border bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 text-sm font-medium">{it.accion}</p>
                      {!cerrado && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-red-500"
                          onClick={() => handleItemDelete(it.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Responsable: <span className="font-medium">{it.responsable}</span>
                      {" · "}
                      Compromiso: {it.fecha_compromiso}
                      {it.fecha_completado && ` · Completado: ${it.fecha_completado}`}
                    </p>
                    {!cerrado ? (
                      <Select
                        value={it.estado}
                        onValueChange={(v: string | null) =>
                          v && handleItemEstado(it.id, v as PlanTmlItemEstado)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendiente">Pendiente</SelectItem>
                          <SelectItem value="en_progreso">En progreso</SelectItem>
                          <SelectItem value="completado">Completado</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        className={`${
                          it.estado === "completado"
                            ? "bg-green-100 text-green-700"
                            : it.estado === "en_progreso"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {it.estado}
                      </Badge>
                    )}
                  </div>
                ))
              )}

              {!cerrado && (
                <div className="space-y-2 rounded-md border border-dashed bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nueva acción
                  </p>
                  <Input
                    placeholder="Qué hay que hacer"
                    value={newAccion}
                    onChange={(e) => setNewAccion(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Responsable"
                      value={newResp}
                      onChange={(e) => setNewResp(e.target.value)}
                    />
                    <Input
                      type="date"
                      value={newFecha}
                      onChange={(e) => setNewFecha(e.target.value)}
                    />
                  </div>
                  <Button size="sm" onClick={handleAddItem} disabled={busy}>
                    <Plus className="mr-1 h-4 w-4" /> Agregar
                  </Button>
                </div>
              )}
            </div>

            {/* Cierre */}
            {cerrado ? (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  Cerrado el {plan.fecha_cierre}
                </p>
                <p className="mt-1 text-sm">{plan.resultado_cierre}</p>
              </div>
            ) : closingMode ? (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <Label>Resultado del cierre</Label>
                <Textarea
                  rows={3}
                  placeholder="Qué se logró con el plan, qué mejoró"
                  value={resultadoCierre}
                  onChange={(e) => setResultadoCierre(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setClosingMode(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleCerrarPlan} disabled={busy}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Confirmar cierre
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500"
                  onClick={handleDeletePlan}
                  disabled={busy}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Eliminar plan
                </Button>
                <Button size="sm" onClick={() => setClosingMode(true)}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Cerrar plan
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
