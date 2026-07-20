"use client"

import { abrirArchivo as abrirArchivoEnVisor } from "@/lib/abrir-archivo"
import { useState, useEffect, useRef } from "react"
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
  ClipboardCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  FileText,
  ExternalLink,
  AlertCircle,
  Eye,
  FileDown,
  Loader2,
  Upload,
  X,
  FolderOpen,
  GraduationCap,
  Calendar,
  User,
  Users,
  CheckCircle,
  Clock,
} from "lucide-react"

function pilarSlug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
}
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
  ESTADO_CAPACITACION_COLORS,
  ESTADO_CAPACITACION_LABELS,
  TIPO_EVIDENCIA_LABELS,
} from "@/lib/constants"
import { createClient } from "@/lib/supabase/client"
import type { TipoEvidencia } from "@/types/database"
import {
  createIndicador,
  updateIndicador,
  deleteIndicador,
  createPlanAccion,
  updatePlanAccion,
  deletePlanAccion,
  createEvidencia,
} from "@/actions/gestion"
import { getDownloadUrl } from "@/actions/dpo-evidencia"
import {
  listarArchivosDeRespuestas,
  type ArchivoRespuesta,
} from "@/actions/plan-avances"
import {
  TareaForm,
  type PuntoFijo,
  type Operador,
} from "@/components/planes/tarea-form"
import { PlanHerramientasInline } from "@/components/herramientas-gestion/plan-herramientas-inline"
import { EvidenciaPlanDialog } from "@/components/planes/evidencia-plan-dialog"
import type { PreguntaGestionFull } from "@/actions/gestion"
import type {
  Pilar,
  Indicador,
  PlanAccion,
  Tendencia,
  EstadoPlan,
  PrioridadPlan,
  CapacitacionParaPregunta,
  DpoArchivo,
  OwdTemplate,
} from "@/types/database"
import { OwdTab, type OwdKpisMini } from "./owd-tab"
import { VentanasHorariasTab } from "./ventanas-horarias-tab"
import type { CoberturaVh } from "@/lib/mercosur-dashboard"

const SCORE_COLORS: Record<number, string> = {
  0: "#EF4444",
  1: "#F97316",
  3: "#EAB308",
  5: "#22C55E",
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
  operadores,
  puntoFijo,
  puedeCrear,
}: {
  preguntaId: string
  planes: PlanAccion[]
  operadores: Operador[]
  puntoFijo: PuntoFijo
  puedeCrear: boolean
}) {
  const router = useRouter()
  const [planes, setPlanes] = useState(initialPlanes)
  const [createOpen, setCreateOpen] = useState(false)
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
        {puedeCrear && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Nueva acción
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Nueva acción / tarea</DialogTitle>
                </DialogHeader>
                {createOpen && (
                  <TareaForm
                    operadores={operadores}
                    puntoFijo={puntoFijo}
                    submitLabel="Crear acción"
                    onCancel={() => setCreateOpen(false)}
                    onCreated={(id) => router.push(`/planes/${id}`)}
                  />
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
        {/* Edición rápida de un plan existente (form clásico) */}
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) resetForm()
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Plan</DialogTitle>
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
                      <EvidenciaPlanDialog
                        planId={plan.id}
                        estado={plan.estado}
                        onEstadoChange={(estado) =>
                          setPlanes((prev) =>
                            prev.map((p) =>
                              p.id === plan.id ? { ...p, estado } : p,
                            ),
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        render={<Link href={`/planes/${plan.id}`} />}
                        title="Ver detalle"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
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
                  <PlanHerramientasInline
                    planId={plan.id}
                    tituloSugerido={plan.descripcion}
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ==================== EVIDENCIAS TAB (historial de archivos de respuestas) ====================

function EvidenciasTab({ preguntaId }: { preguntaId: string }) {
  const [archivos, setArchivos] = useState<ArchivoRespuesta[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<{ url: string; titulo: string } | null>(
    null
  )

  // --- Formulario "Agregar evidencia" (archivo subido o link) ---
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [tipo, setTipo] = useState<TipoEvidencia>("documento")
  const [url, setUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const r = await listarArchivosDeRespuestas(preguntaId)
    if ("data" in r) setArchivos(r.data)
    else toast.error(r.error)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const r = await listarArchivosDeRespuestas(preguntaId)
      if (cancelled) return
      if ("data" in r) setArchivos(r.data)
      else toast.error(r.error)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [preguntaId])

  function resetForm() {
    setTitulo("")
    setDescripcion("")
    setTipo("documento")
    setUrl("")
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function onPickFile(f: File | null) {
    setFile(f)
    if (f && !titulo.trim()) setTitulo(f.name.replace(/\.[^.]+$/, ""))
    if (f && f.type.startsWith("image/")) setTipo("foto")
  }

  // Pegar captura con Ctrl+V (regla global de uploads de imágenes)
  function onPasteImagen(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) =>
      i.type.startsWith("image/")
    )
    if (!item) return
    const f = item.getAsFile()
    if (f) {
      onPickFile(new File([f], `captura-${Date.now()}.png`, { type: f.type }))
      toast.success("Imagen pegada")
    }
  }

  async function handleSave() {
    if (!titulo.trim()) {
      toast.error("El título es obligatorio")
      return
    }
    if (!file && !url.trim()) {
      toast.error("Adjuntá un archivo o pegá un link")
      return
    }
    setSaving(true)
    try {
      let filePath: string | undefined
      if (file) {
        const supabase = createClient()
        const safe = file.name
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-zA-Z0-9._-]+/g, "_")
        const path = `${preguntaId}/${crypto.randomUUID()}-${safe}`
        const { error: upErr } = await supabase.storage
          .from("evidencias")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          })
        if (upErr) {
          toast.error(`Error al subir: ${upErr.message}`)
          setSaving(false)
          return
        }
        filePath = path
      }
      const res = await createEvidencia({
        pregunta_id: preguntaId,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        url: url.trim() || undefined,
        file_path: filePath,
        tipo,
      })
      if ("error" in res) {
        toast.error(res.error)
        setSaving(false)
        return
      }
      toast.success("Evidencia agregada")
      setDialogOpen(false)
      resetForm()
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setSaving(false)
    }
  }

  function esImg(mime: string | null, nombre: string | null): boolean {
    if (mime?.startsWith("image/")) return true
    const ext = (nombre ?? "").split(".").pop()?.toLowerCase() ?? ""
    return ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext)
  }
  function fmtBytes(b: number | null): string {
    if (!b || b <= 0) return ""
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${(b / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="space-y-3 pt-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Archivos subidos en las respuestas de las tareas de este punto, más las
          evidencias que cargues manualmente acá.
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
              <Button variant="outline" size="sm" className="shrink-0">
                <Plus className="mr-1 h-3 w-3" />
                Agregar evidencia
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md" onPaste={onPasteImagen}>
            <DialogHeader>
              <DialogTitle>Nueva evidencia</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Archivo</Label>
                <div
                  className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-muted-foreground transition-colors hover:border-slate-400"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const f = e.dataTransfer.files?.[0]
                    if (f) onPickFile(f)
                  }}
                >
                  <Upload className="mb-2 h-5 w-5" />
                  {file ? (
                    <span className="font-medium text-slate-900">{file.name}</span>
                  ) : (
                    <span>
                      Arrastrá, hacé click o pegá una captura (Ctrl+V)
                    </span>
                  )}
                </div>
                {file && (
                  <button
                    type="button"
                    onClick={() => onPickFile(null)}
                    className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:underline"
                  >
                    <X className="h-3 w-3" /> Quitar archivo
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div>
                <Label htmlFor="ev-titulo">Título *</Label>
                <Input
                  id="ev-titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej: Frente de estiba"
                />
              </div>
              <div>
                <Label htmlFor="ev-desc">Descripción</Label>
                <Textarea
                  id="ev-desc"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Descripción opcional…"
                  className="min-h-12"
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select
                  value={tipo}
                  onValueChange={(v) => setTipo((v as TipoEvidencia) ?? "documento")}
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
                <Label htmlFor="ev-url">O pegá un link (opcional)</Label>
                <Input
                  id="ev-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancelar
              </DialogClose>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Guardando…" : "Agregar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : archivos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <FileCheck className="mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">Sin archivos todavía</p>
          <p className="text-xs">
            Usá &quot;Agregar evidencia&quot; o adjuntá archivos al responder
            tareas y aparecen acá.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {archivos.map((a) => {
            const isImg = esImg(a.archivo_mime, a.archivo_nombre)
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                {isImg && a.url ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox({
                        url: a.url,
                        titulo: a.archivo_nombre ?? "Imagen",
                      })
                    }
                    className="shrink-0 overflow-hidden rounded-md border border-slate-200 hover:opacity-80"
                    title="Ver imagen"
                  >
                    <img
                      src={a.url}
                      alt={a.archivo_nombre ?? ""}
                      className="h-12 w-12 object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100">
                    <FileText className="h-4 w-4 text-slate-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {a.archivo_nombre ?? "Archivo"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.plan_titulo} · {a.autor_nombre ?? "—"} ·{" "}
                    {format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}
                    {fmtBytes(a.archivo_bytes)
                      ? ` · ${fmtBytes(a.archivo_bytes)}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {a.plan_id && (
                    <Link
                      href={`/planes/${a.plan_id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver tarea
                    </Link>
                  )}
                  {a.url && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => abrirArchivoEnVisor(a.url)}
                      title="Abrir / descargar"
                    >
                      <FileDown className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog
        open={lightbox !== null}
        onOpenChange={(o) => !o && setLightbox(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{lightbox?.titulo ?? "Vista previa"}</DialogTitle>
          </DialogHeader>
          {lightbox && (
            <img
              src={lightbox.url}
              alt={lightbox.titulo}
              className="h-auto max-h-[80vh] w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ==================== CAPACITACIONES TAB ====================

function CapacitacionesTab({
  capacitaciones,
}: {
  capacitaciones: CapacitacionParaPregunta[]
}) {
  if (capacitaciones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <GraduationCap className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">Sin capacitaciones vinculadas</p>
        <p className="text-xs">
          Vincula capacitaciones desde la seccion Capacitaciones
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 pt-4">
      <p className="text-sm text-muted-foreground">
        {capacitaciones.length} capacitacion{capacitaciones.length !== 1 ? "es" : ""} vinculada{capacitaciones.length !== 1 ? "s" : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {capacitaciones.map((cap) => {
          const pctAprobados = cap.total_asistentes > 0
            ? Math.round((cap.aprobados / cap.total_asistentes) * 100)
            : 0

          return (
            <Link key={cap.id} href={`/capacitaciones/${cap.id}`}>
              <Card size="sm" className="group cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800 group-hover:text-blue-600">
                      {cap.titulo}
                    </p>
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-[10px]"
                      style={{
                        backgroundColor: ESTADO_CAPACITACION_COLORS[cap.estado] + "20",
                        color: ESTADO_CAPACITACION_COLORS[cap.estado],
                      }}
                    >
                      {ESTADO_CAPACITACION_LABELS[cap.estado]}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {cap.instructor}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(cap.fecha + "T12:00:00").toLocaleDateString("es-AR")}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
                    <span className="flex items-center gap-1 text-slate-600">
                      <Users className="h-3 w-3" />
                      {cap.total_asistentes} inscriptos
                    </span>
                    <span className="flex items-center gap-1 text-slate-600">
                      {cap.presentes} presentes
                    </span>
                    <span className="flex items-center gap-1 font-medium" style={{
                      color: cap.estado === "completada" && cap.total_asistentes > 0
                        ? pctAprobados >= 80 ? "#22C55E" : pctAprobados >= 50 ? "#F59E0B" : "#EF4444"
                        : "#64748B"
                    }}>
                      <CheckCircle className="h-3 w-3" />
                      {cap.aprobados} aprobados
                      {cap.total_asistentes > 0 && (
                        <span className="text-[10px] opacity-70">({pctAprobados}%)</span>
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ==================== MAIN COMPONENT ====================

export function PreguntaGestionClient({
  pilar,
  pregunta,
  capacitaciones = [],
  archivos = [],
  operadores = [],
  puedeCrearTareas = false,
  owdTemplate = null,
  owdKpis = null,
  isAdmin = false,
  mostrarVentanasHorarias = false,
  coberturaVh = null,
  coberturaVhError = null,
}: {
  pilar: Pilar
  pregunta: PreguntaGestionFull
  capacitaciones?: CapacitacionParaPregunta[]
  archivos?: DpoArchivo[]
  operadores?: Operador[]
  puedeCrearTareas?: boolean
  owdTemplate?: OwdTemplate | null
  owdKpis?: OwdKpisMini | null
  isAdmin?: boolean
  /** Sólo el punto Entrega 4.4 muestra el tab de ventanas horarias. */
  mostrarVentanasHorarias?: boolean
  coberturaVh?: CoberturaVh | null
  coberturaVhError?: string | null
}) {
  const [guiaOpen, setGuiaOpen] = useState(false)
  const [verificarOpen, setVerificarOpen] = useState(false)
  const [archivoLoadingId, setArchivoLoadingId] = useState<string | null>(null)

  async function abrirArchivo(archivo_id: string) {
    setArchivoLoadingId(archivo_id)
    try {
      const result = await getDownloadUrl({ archivo_id })
      if ("error" in result) {
        alert(`Error abriendo archivo: ${result.error}`)
        return
      }
      abrirArchivoEnVisor(result.data.url)
    } finally {
      setArchivoLoadingId(null)
    }
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }

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
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
          render={
            <Link
              href={`/evidencia/${pilarSlug(pilar.nombre)}/${pregunta.numero.replace(/\./g, "-")}?from=pilar&pilarId=${pilar.id}&preguntaId=${pregunta.id}`}
            />
          }
        >
          <FolderOpen className="mr-1.5 h-4 w-4" />
          Subir archivos
        </Button>
      </div>

      {/* DPO Requirements - always visible */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">
            Que requiere DPO
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 border-t pt-3">
          {/* Requerimientos - always visible */}
          {pregunta.requerimiento && (
            <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-500">
                Requerimientos
              </p>
              <p className="whitespace-pre-line leading-relaxed">{pregunta.requerimiento}</p>
            </div>
          )}

          {/* Criterio de Puntaje - always visible */}
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
                      <p className="text-slate-700 leading-relaxed">{desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Guia - collapsible */}
          {pregunta.guia && (
            <div className="rounded-md bg-blue-50/50 p-3 text-sm text-blue-900">
              <button
                type="button"
                onClick={() => setGuiaOpen((v) => !v)}
                className="flex w-full items-center justify-between"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
                  Guia
                </p>
                {guiaOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-blue-400" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-blue-400" />
                )}
              </button>
              {guiaOpen && (
                <p className="mt-2 whitespace-pre-line leading-relaxed">{pregunta.guia}</p>
              )}
            </div>
          )}

          {/* Como verificar - collapsible */}
          {pregunta.como_verificar && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-900">
              <button
                type="button"
                onClick={() => setVerificarOpen((v) => !v)}
                className="flex w-full items-center justify-between"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-green-600">
                  Como verificar
                </p>
                {verificarOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-green-400" />
                )}
              </button>
              {verificarOpen && (
                <p className="mt-2 whitespace-pre-line leading-relaxed">{pregunta.como_verificar}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archivos DPO cargados (vista rápida) */}
      <Card size="sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FolderOpen className="h-4 w-4 text-amber-600" />
            Archivos cargados
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-600">
              {archivos.length}
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            render={
              <Link
                href={`/evidencia/${pilarSlug(pilar.nombre)}/${pregunta.numero.replace(/\./g, "-")}?from=pilar&pilarId=${pilar.id}&preguntaId=${pregunta.id}`}
              />
            }
          >
            Gestionar
            <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="border-t pt-3">
          {archivos.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              No hay archivos cargados para este punto.
            </p>
          ) : (
            <ul className="divide-y">
              {archivos.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {a.titulo}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {a.file_name} · {formatBytes(a.current_file_size)} · v
                        {a.current_version}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => abrirArchivo(a.id)}
                    disabled={archivoLoadingId === a.id}
                    title="Ver archivo"
                  >
                    {archivoLoadingId === a.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
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
          </TabsTrigger>
          <TabsTrigger value="capacitaciones">
            <GraduationCap className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Capacitaciones</span>
            <span className="sm:hidden">Cap.</span>
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({capacitaciones.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="owd">
            <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
            OWD
            {owdTemplate && owdKpis && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({owdKpis.obsMesActual}/{owdKpis.metaMensual})
              </span>
            )}
          </TabsTrigger>
          {mostrarVentanasHorarias && (
            <TabsTrigger value="ventanas-horarias">
              <Clock className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ventanas Horarias</span>
              <span className="sm:hidden">VH</span>
              {coberturaVh && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({coberturaVh.cobertura_pct.toFixed(0)}%)
                </span>
              )}
            </TabsTrigger>
          )}
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
            operadores={operadores}
            puedeCrear={puedeCrearTareas}
            puntoFijo={{
              pregunta_id: pregunta.id,
              numero: pregunta.numero,
              texto: pregunta.texto,
              pilar_nombre: pilar.nombre,
              pilar_color: pilar.color,
            }}
          />
        </TabsContent>
        <TabsContent value="evidencias">
          <EvidenciasTab preguntaId={pregunta.id} />
        </TabsContent>
        <TabsContent value="capacitaciones">
          <CapacitacionesTab capacitaciones={capacitaciones} />
        </TabsContent>
        <TabsContent value="owd">
          <OwdTab
            preguntaId={pregunta.id}
            template={owdTemplate}
            kpis={owdKpis}
            isAdmin={isAdmin}
          />
        </TabsContent>
        {mostrarVentanasHorarias && (
          <TabsContent value="ventanas-horarias">
            <VentanasHorariasTab
              cobertura={coberturaVh}
              error={coberturaVhError}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
