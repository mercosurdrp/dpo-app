"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { format } from "date-fns"
import {
  ArrowLeft,
  Star,
  BarChart3,
  ListTodo,
  FileCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  FileText,
  Link as LinkIcon,
  Image,
  StickyNote,
  ExternalLink,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  SCORE_LEVELS,
  ESTADO_PLAN_COLORS,
  ESTADO_PLAN_LABELS,
  PRIORIDAD_COLORS,
  PRIORIDAD_LABELS,
  TENDENCIA_LABELS,
  TIPO_EVIDENCIA_LABELS,
} from "@/lib/constants"
import {
  createIndicador,
  updateIndicador,
  deleteIndicador,
  createPlanAccion,
  updatePlanAccion,
  deletePlanAccion,
  createEvidencia,
  deleteEvidencia,
} from "@/actions/gestion"
import type { PreguntaGestionFull } from "@/actions/gestion"
import type {
  Pilar,
  Indicador,
  PlanAccion,
  Evidencia,
  Tendencia,
  TipoEvidencia,
  EstadoPlan,
  PrioridadPlan,
} from "@/types/database"

const SCORE_COLORS: Record<number, string> = {
  0: "#EF4444",
  1: "#F97316",
  3: "#EAB308",
  5: "#22C55E",
}

const TIPO_EVIDENCIA_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  documento: FileText,
  foto: Image,
  link: LinkIcon,
  nota: StickyNote,
}

function TendenciaIcon({ tendencia }: { tendencia: string }) {
  switch (tendencia) {
    case "mejora":
      return <TrendingUp className="h-4 w-4 text-green-600" />
    case "deterioro":
      return <TrendingDown className="h-4 w-4 text-red-600" />
    case "estable":
      return <Minus className="h-4 w-4 text-amber-600" />
    default:
      return <Minus className="h-4 w-4 text-slate-400" />
  }
}

// ==================== INDICADORES TAB ====================

function IndicadoresTab({
  preguntaId,
  indicadores: initialIndicadores,
}: {
  preguntaId: string
  indicadores: Indicador[]
}) {
  const [indicadores, setIndicadores] = useState(initialIndicadores)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    nombre: "",
    meta: "",
    actual: "",
    unidad: "%",
    tendencia: "neutral" as Tendencia,
    notas: "",
  })
  const [saving, setSaving] = useState(false)

  function resetForm() {
    setForm({ nombre: "", meta: "", actual: "", unidad: "%", tendencia: "neutral", notas: "" })
    setEditingId(null)
  }

  function openEdit(ind: Indicador) {
    setForm({
      nombre: ind.nombre,
      meta: String(ind.meta),
      actual: String(ind.actual),
      unidad: ind.unidad,
      tendencia: ind.tendencia,
      notas: ind.notas ?? "",
    })
    setEditingId(ind.id)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.nombre || !form.meta || !form.actual) {
      toast.error("Nombre, meta y actual son requeridos")
      return
    }
    setSaving(true)
    if (editingId) {
      const result = await updateIndicador(editingId, {
        nombre: form.nombre,
        meta: parseFloat(form.meta),
        actual: parseFloat(form.actual),
        unidad: form.unidad,
        tendencia: form.tendencia,
        notas: form.notas || undefined,
      })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setIndicadores((prev) =>
          prev.map((i) => (i.id === editingId ? result.data : i))
        )
        toast.success("Indicador actualizado")
        setDialogOpen(false)
        resetForm()
      }
    } else {
      const result = await createIndicador({
        pregunta_id: preguntaId,
        nombre: form.nombre,
        meta: parseFloat(form.meta),
        actual: parseFloat(form.actual),
        unidad: form.unidad,
        tendencia: form.tendencia,
        notas: form.notas || undefined,
      })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setIndicadores((prev) => [...prev, result.data])
        toast.success("Indicador creado")
        setDialogOpen(false)
        resetForm()
      }
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const result = await deleteIndicador(id)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setIndicadores((prev) => prev.filter((i) => i.id !== id))
      toast.success("Indicador eliminado")
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {indicadores.length} indicador{indicadores.length !== 1 ? "es" : ""}
        </p>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) resetForm()
          }}
        >
          <DialogTrigger
            render={
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-3 w-3" />
                Agregar Indicador
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar Indicador" : "Nuevo Indicador"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label htmlFor="ind-nombre">Nombre</Label>
                <Input
                  id="ind-nombre"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Tasa de cumplimiento"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor="ind-meta">Meta</Label>
                  <Input
                    id="ind-meta"
                    type="number"
                    value={form.meta}
                    onChange={(e) => setForm((f) => ({ ...f, meta: e.target.value }))}
                    placeholder="100"
                  />
                </div>
                <div>
                  <Label htmlFor="ind-actual">Actual</Label>
                  <Input
                    id="ind-actual"
                    type="number"
                    value={form.actual}
                    onChange={(e) => setForm((f) => ({ ...f, actual: e.target.value }))}
                    placeholder="75"
                  />
                </div>
                <div>
                  <Label htmlFor="ind-unidad">Unidad</Label>
                  <Input
                    id="ind-unidad"
                    value={form.unidad}
                    onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value }))}
                    placeholder="%"
                  />
                </div>
              </div>
              <div>
                <Label>Tendencia</Label>
                <Select
                  value={form.tendencia}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, tendencia: val as Tendencia }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["mejora", "estable", "deterioro", "neutral"] as const).map(
                      (t) => (
                        <SelectItem key={t} value={t}>
                          {TENDENCIA_LABELS[t]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ind-notas">Notas</Label>
                <Textarea
                  id="ind-notas"
                  value={form.notas}
                  onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                  placeholder="Notas adicionales..."
                  className="min-h-12"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancelar
              </DialogClose>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {indicadores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <BarChart3 className="mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">Sin indicadores definidos</p>
          <p className="text-xs">Agrega KPIs para monitorear esta pregunta</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {indicadores.map((ind) => {
            const metOk = ind.actual >= ind.meta
            return (
              <Card key={ind.id} size="sm">
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {ind.nombre}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => openEdit(ind)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(ind.id)}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-baseline gap-1">
                      <span
                        className="text-lg font-bold"
                        style={{ color: metOk ? "#22C55E" : "#EF4444" }}
                      >
                        {ind.actual}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        / {ind.meta} {ind.unidad}
                      </span>
                    </div>
                    <TendenciaIcon tendencia={ind.tendencia} />
                    <span className="text-xs text-muted-foreground">
                      {TENDENCIA_LABELS[ind.tendencia]}
                    </span>
                  </div>
                  {ind.notas && (
                    <p className="text-xs text-muted-foreground">{ind.notas}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ==================== PLANES DE ACCION TAB ====================

function PlanesTab({
  preguntaId,
  planes: initialPlanes,
}: {
  preguntaId: string
  planes: PlanAccion[]
}) {
  const [planes, setPlanes] = useState(initialPlanes)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    descripcion: "",
    responsable: "",
    fecha_inicio: "",
    fecha_limite: "",
    prioridad: "media" as PrioridadPlan,
    notas: "",
  })
  const [saving, setSaving] = useState(false)

  function resetForm() {
    setForm({
      descripcion: "",
      responsable: "",
      fecha_inicio: "",
      fecha_limite: "",
      prioridad: "media",
      notas: "",
    })
    setEditingId(null)
  }

  function openEdit(plan: PlanAccion) {
    setForm({
      descripcion: plan.descripcion,
      responsable: plan.responsable,
      fecha_inicio: plan.fecha_inicio ?? "",
      fecha_limite: plan.fecha_limite ?? "",
      prioridad: plan.prioridad,
      notas: plan.notas ?? "",
    })
    setEditingId(plan.id)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.descripcion || !form.responsable) {
      toast.error("Descripcion y responsable son requeridos")
      return
    }
    setSaving(true)
    if (editingId) {
      const result = await updatePlanAccion(editingId, {
        descripcion: form.descripcion,
        responsable: form.responsable,
        fecha_inicio: form.fecha_inicio || undefined,
        fecha_limite: form.fecha_limite || undefined,
        prioridad: form.prioridad,
        notas: form.notas || undefined,
      })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setPlanes((prev) =>
          prev.map((p) => (p.id === editingId ? result.data : p))
        )
        toast.success("Plan actualizado")
        setDialogOpen(false)
        resetForm()
      }
    } else {
      const result = await createPlanAccion({
        pregunta_id: preguntaId,
        descripcion: form.descripcion,
        responsable: form.responsable,
        fecha_inicio: form.fecha_inicio || undefined,
        fecha_limite: form.fecha_limite || undefined,
        prioridad: form.prioridad,
        notas: form.notas || undefined,
      })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setPlanes((prev) => [...prev, result.data])
        toast.success("Plan creado")
        setDialogOpen(false)
        resetForm()
      }
    }
    setSaving(false)
  }

  async function handleEstadoChange(planId: string, estado: EstadoPlan) {
    const result = await updatePlanAccion(planId, { estado })
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setPlanes((prev) => prev.map((p) => (p.id === planId ? result.data : p)))
      toast.success("Estado actualizado")
    }
  }

  async function handleDelete(id: string) {
    const result = await deletePlanAccion(id)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setPlanes((prev) => prev.filter((p) => p.id !== id))
      toast.success("Plan eliminado")
    }
  }

  const now = new Date()

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {planes.length} plan{planes.length !== 1 ? "es" : ""} de accion
        </p>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) resetForm()
          }}
        >
          <DialogTrigger
            render={
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-3 w-3" />
                Nueva Accion
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar Plan" : "Nuevo Plan de Accion"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label htmlFor="plan-desc">Descripcion</Label>
                <Textarea
                  id="plan-desc"
                  value={form.descripcion}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, descripcion: e.target.value }))
                  }
                  placeholder="Describe la accion a realizar..."
                />
              </div>
              <div>
                <Label htmlFor="plan-resp">Responsable</Label>
                <Input
                  id="plan-resp"
                  value={form.responsable}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, responsable: e.target.value }))
                  }
                  placeholder="Nombre del responsable"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="plan-fi">Fecha inicio</Label>
                  <Input
                    id="plan-fi"
                    type="date"
                    value={form.fecha_inicio}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fecha_inicio: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="plan-fl">Fecha limite</Label>
                  <Input
                    id="plan-fl"
                    type="date"
                    value={form.fecha_limite}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fecha_limite: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Prioridad</Label>
                <Select
                  value={form.prioridad}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, prioridad: val as PrioridadPlan }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["alta", "media", "baja"] as const).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORIDAD_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="plan-notas">Notas</Label>
                <Textarea
                  id="plan-notas"
                  value={form.notas}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notas: e.target.value }))
                  }
                  placeholder="Notas adicionales..."
                  className="min-h-12"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancelar
              </DialogClose>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {planes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <ListTodo className="mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">Sin planes de accion</p>
          <p className="text-xs">Crea acciones correctivas o preventivas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {planes.map((plan) => {
            const isOverdue =
              plan.fecha_limite &&
              plan.estado !== "completado" &&
              new Date(plan.fecha_limite) < now
            return (
              <Card
                key={plan.id}
                size="sm"
                className={isOverdue ? "ring-2 ring-red-200" : ""}
              >
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {plan.descripcion}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => openEdit(plan)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(plan.id)}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      Responsable: <span className="font-medium text-slate-700">{plan.responsable}</span>
                    </span>
                    {plan.fecha_limite && (
                      <span
                        className={`flex items-center gap-1 ${
                          isOverdue ? "font-semibold text-red-600" : "text-muted-foreground"
                        }`}
                      >
                        {isOverdue && <AlertCircle className="h-3 w-3" />}
                        Limite: {format(new Date(plan.fecha_limite), "dd/MM/yyyy")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Estado selector */}
                    <Select
                      value={plan.estado}
                      onValueChange={(val) =>
                        handleEstadoChange(plan.id, val as EstadoPlan)
                      }
                    >
                      <SelectTrigger size="sm" className="h-6 text-xs">
                        <span
                          className="mr-1 h-2 w-2 rounded-full inline-block"
                          style={{
                            backgroundColor: ESTADO_PLAN_COLORS[plan.estado],
                          }}
                        />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["pendiente", "en_progreso", "completado"] as const).map(
                          (e) => (
                            <SelectItem key={e} value={e}>
                              {ESTADO_PLAN_LABELS[e]}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                      style={{
                        backgroundColor: PRIORIDAD_COLORS[plan.prioridad],
                      }}
                    >
                      {PRIORIDAD_LABELS[plan.prioridad]}
                    </span>
                  </div>
                  {plan.notas && (
                    <p className="text-xs text-muted-foreground">{plan.notas}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ==================== EVIDENCIAS TAB ====================

function EvidenciasTab({
  preguntaId,
  evidencias: initialEvidencias,
}: {
  preguntaId: string
  evidencias: Evidencia[]
}) {
  const [evidencias, setEvidencias] = useState(initialEvidencias)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    url: "",
    tipo: "documento" as TipoEvidencia,
  })
  const [saving, setSaving] = useState(false)

  function resetForm() {
    setForm({ titulo: "", descripcion: "", url: "", tipo: "documento" })
  }

  async function handleSave() {
    if (!form.titulo) {
      toast.error("El titulo es requerido")
      return
    }
    setSaving(true)
    const result = await createEvidencia({
      pregunta_id: preguntaId,
      titulo: form.titulo,
      descripcion: form.descripcion || undefined,
      url: form.url || undefined,
      tipo: form.tipo,
    })
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setEvidencias((prev) => [...prev, result.data])
      toast.success("Evidencia agregada")
      setDialogOpen(false)
      resetForm()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const result = await deleteEvidencia(id)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setEvidencias((prev) => prev.filter((e) => e.id !== id))
      toast.success("Evidencia eliminada")
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {evidencias.length} evidencia{evidencias.length !== 1 ? "s" : ""}
        </p>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) resetForm()
          }}
        >
          <DialogTrigger
            render={
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-3 w-3" />
                Agregar Evidencia
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nueva Evidencia</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label htmlFor="ev-titulo">Titulo</Label>
                <Input
                  id="ev-titulo"
                  value={form.titulo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, titulo: e.target.value }))
                  }
                  placeholder="Titulo de la evidencia"
                />
              </div>
              <div>
                <Label htmlFor="ev-desc">Descripcion</Label>
                <Textarea
                  id="ev-desc"
                  value={form.descripcion}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, descripcion: e.target.value }))
                  }
                  placeholder="Descripcion opcional..."
                  className="min-h-12"
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, tipo: val as TipoEvidencia }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["documento", "foto", "link", "nota"] as const).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_EVIDENCIA_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ev-url">URL</Label>
                <Input
                  id="ev-url"
                  value={form.url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, url: e.target.value }))
                  }
                  placeholder="https://..."
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancelar
              </DialogClose>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : "Agregar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {evidencias.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <FileCheck className="mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">Sin evidencias</p>
          <p className="text-xs">Agrega documentos, fotos o links como evidencia</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {evidencias.map((ev) => {
            const TipoIcon = TIPO_EVIDENCIA_ICONS[ev.tipo] ?? FileText
            return (
              <Card key={ev.id} size="sm">
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                        <TipoIcon className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {ev.titulo}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          {TIPO_EVIDENCIA_LABELS[ev.tipo]}
                          {ev.created_at &&
                            ` - ${format(new Date(ev.created_at), "dd/MM/yyyy")}`}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDelete(ev.id)}
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                  {ev.descripcion && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {ev.descripcion}
                    </p>
                  )}
                  {ev.url && (
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver recurso
                    </a>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ==================== MAIN COMPONENT ====================

export function PreguntaGestionClient({
  pilar,
  pregunta,
}: {
  pilar: Pilar
  pregunta: PreguntaGestionFull
}) {
  const [reqOpen, setReqOpen] = useState(false)

  const criterio = pregunta.puntaje_criterio as Record<string, string> | null
  const puntaje = pregunta.puntaje_actual
  const scoreLevel = puntaje !== null ? SCORE_LEVELS.find((l) => l.value === puntaje) : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href={`/pilares/${pilar.id}`} />}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link
              href={`/pilares/${pilar.id}`}
              className="hover:underline"
              style={{ color: pilar.color }}
            >
              {pilar.nombre}
            </Link>
            <span>/</span>
            <span>{pregunta.bloque_nombre}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="font-mono text-sm font-semibold text-muted-foreground">
              {pregunta.numero}
            </span>
            {pregunta.mandatorio && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                <Star className="mr-0.5 h-2.5 w-2.5" />
                Obligatorio
              </span>
            )}
            {puntaje !== null && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: SCORE_COLORS[puntaje] ?? "#6B7280" }}
              >
                {puntaje} - {scoreLevel?.description ?? ""}
              </span>
            )}
          </div>
          <h1 className="mt-1 text-base font-semibold text-slate-900 sm:text-lg leading-snug">
            {pregunta.texto}
          </h1>
        </div>
      </div>

      {/* Requirements collapsible */}
      <Card size="sm">
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setReqOpen((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Que requiere DPO
            </CardTitle>
            {reqOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        {reqOpen && (
          <CardContent className="space-y-3 border-t pt-3">
            {pregunta.requerimiento && (
              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-600">
                  Requerimientos
                </p>
                <p className="whitespace-pre-wrap">{pregunta.requerimiento}</p>
              </div>
            )}
            {criterio && Object.keys(criterio).length > 0 && (
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Criterio de Puntaje
                </p>
                <div className="space-y-2">
                  {Object.entries(criterio).map(([key, desc]) => {
                    const numericKey = parseInt(key, 10)
                    const color = SCORE_COLORS[numericKey] ?? "#6B7280"
                    return (
                      <div key={key} className="flex gap-2">
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: color }}
                        >
                          {key}
                        </span>
                        <p className="text-slate-700">{desc}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {pregunta.guia && (
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-600">
                  Guia
                </p>
                <p className="whitespace-pre-wrap">{pregunta.guia}</p>
              </div>
            )}
            {pregunta.como_verificar && (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-900">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-green-600">
                  Como verificar
                </p>
                <p className="whitespace-pre-wrap">{pregunta.como_verificar}</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* 3 Management tabs */}
      <Tabs defaultValue="indicadores">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="indicadores">
            <BarChart3 className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Indicadores</span>
            <span className="sm:hidden">KPIs</span>
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({pregunta.indicadores.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="planes">
            <ListTodo className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Planes de Accion</span>
            <span className="sm:hidden">Acciones</span>
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({pregunta.planes_accion.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="evidencias">
            <FileCheck className="mr-1 h-3.5 w-3.5" />
            Evidencias
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({pregunta.evidencias.length})
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="indicadores">
          <IndicadoresTab
            preguntaId={pregunta.id}
            indicadores={pregunta.indicadores}
          />
        </TabsContent>
        <TabsContent value="planes">
          <PlanesTab
            preguntaId={pregunta.id}
            planes={pregunta.planes_accion}
          />
        </TabsContent>
        <TabsContent value="evidencias">
          <EvidenciasTab
            preguntaId={pregunta.id}
            evidencias={pregunta.evidencias}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
