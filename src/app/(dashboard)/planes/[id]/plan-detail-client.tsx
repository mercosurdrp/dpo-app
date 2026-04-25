"use client"

import { useState, useRef, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { format } from "date-fns"
import {
  ArrowLeft,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronDown,
  MessageSquare,
  History,
  FileCheck,
  Plus,
  Trash2,
  Camera,
  Send,
  Loader2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  StickyNote,
  Unlink,
  LinkIcon as Link2Icon,
  Paperclip,
  Download,
  Users,
  CalendarClock,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  ESTADO_PLAN_COLORS,
  ESTADO_PLAN_LABELS,
  PRIORIDAD_COLORS,
  PRIORIDAD_LABELS,
  TIPO_EVIDENCIA_LABELS,
} from "@/lib/constants"
import {
  updatePlanEstado,
  updatePlanProgreso,
  updatePlanNotas,
  createPlanComentario,
  deletePlanComentario,
  linkEvidenciaToPlan,
  unlinkEvidenciaFromPlan,
  getUnlinkedEvidencias,
  linkArchivoToPlan,
  unlinkArchivoFromPlan,
  searchArchivos,
} from "@/actions/planes"
import { getDownloadUrl } from "@/actions/dpo-evidencia"
import { createEvidencia } from "@/actions/gestion"
import { createClient } from "@/lib/supabase/client"
import { ResponsablesMultiPicker } from "@/components/planes/responsables-multi-picker"
import { ReprogramarDialog } from "@/components/planes/reprogramar-dialog"
import { CerrarPlanDialog } from "@/components/planes/cerrar-plan-dialog"
import type {
  PlanAccionFull,
  PlanComentarioConAutor,
  PlanHistorialConAutor,
  PlanReprogramacionConAutor,
  Evidencia,
  EstadoPlan,
  TipoEvidencia,
  DpoArchivo,
  UserRole,
} from "@/types/database"

const TIPO_EVIDENCIA_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  documento: FileText,
  foto: ImageIcon,
  link: LinkIcon,
  nota: StickyNote,
}

// ==================== INFO SECTION ====================

function InfoSection({
  plan,
  onEstadoChange,
  onProgresoChange,
  onNotasChange,
}: {
  plan: PlanAccionFull
  onEstadoChange: (estado: EstadoPlan) => void
  onProgresoChange: (progreso: number) => void
  onNotasChange: (notas: string) => void
}) {
  const [progreso, setProgreso] = useState(plan.progreso)
  const [notas, setNotas] = useState(plan.notas ?? "")
  const [savingNotas, setSavingNotas] = useState(false)
  const [savingProgreso, setSavingProgreso] = useState(false)
  const now = new Date()
  const overdue =
    plan.fecha_limite &&
    plan.estado !== "completado" &&
    new Date(plan.fecha_limite) < now

  const progresoColor =
    progreso >= 67 ? "#22C55E" : progreso >= 34 ? "#F59E0B" : "#EF4444"

  async function handleProgresoSave() {
    setSavingProgreso(true)
    onProgresoChange(progreso)
    setSavingProgreso(false)
  }

  async function handleNotasSave() {
    setSavingNotas(true)
    onNotasChange(notas)
    setSavingNotas(false)
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        {/* Estado + Prioridad row */}
        <div className="flex flex-wrap items-center gap-3">
          <EstadoDropdown
            estado={plan.estado}
            onChange={onEstadoChange}
          />
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: PRIORIDAD_COLORS[plan.prioridad] }}
          >
            {PRIORIDAD_LABELS[plan.prioridad]}
          </span>
        </div>

        {/* Details grid */}
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Responsable</p>
            <p className="font-medium text-slate-800">{plan.responsable}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fecha inicio</p>
            <p className="font-medium text-slate-800">
              {plan.fecha_inicio
                ? format(new Date(plan.fecha_inicio), "dd/MM/yyyy")
                : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fecha limite</p>
            <p
              className={`font-medium ${
                overdue ? "text-red-600" : "text-slate-800"
              }`}
            >
              {plan.fecha_limite
                ? format(new Date(plan.fecha_limite), "dd/MM/yyyy")
                : "-"}
              {overdue && (
                <AlertCircle className="ml-1 inline h-3.5 w-3.5 text-red-500" />
              )}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Progreso</p>
            <span className="text-sm font-bold" style={{ color: progresoColor }}>
              {progreso}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progreso}
              onChange={(e) => setProgreso(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleProgresoSave}
              disabled={savingProgreso || progreso === plan.progreso}
            >
              Guardar
            </Button>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progreso}%`, backgroundColor: progresoColor }}
            />
          </div>
        </div>

        {/* Notas */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Notas</p>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas del plan..."
            className="min-h-16"
          />
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNotasSave}
              disabled={savingNotas || notas === (plan.notas ?? "")}
            >
              Guardar notas
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ==================== COMENTARIOS SECTION ====================

function ComentariosSection({
  planId,
  comentarios: initialComentarios,
}: {
  planId: string
  comentarios: PlanComentarioConAutor[]
}) {
  const [comentarios, setComentarios] = useState(initialComentarios)
  const [texto, setTexto] = useState("")
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setFotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  function clearFoto() {
    setFotoFile(null)
    setFotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleSend() {
    if (!texto.trim() && !fotoFile) {
      toast.error("Escribe un comentario o adjunta una foto")
      return
    }

    setSending(true)

    let foto_url: string | undefined

    // Upload photo if present
    if (fotoFile) {
      try {
        const supabase = createClient()
        const ext = fotoFile.name.split(".").pop() ?? "jpg"
        const path = `comentarios/${planId}/${Date.now()}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from("evidencias")
          .upload(path, fotoFile)

        if (uploadErr) {
          toast.error("Error subiendo foto: " + uploadErr.message)
          setSending(false)
          return
        }

        const { data: urlData } = supabase.storage
          .from("evidencias")
          .getPublicUrl(path)

        foto_url = urlData.publicUrl
      } catch {
        toast.error("Error subiendo foto")
        setSending(false)
        return
      }
    }

    const result = await createPlanComentario({
      plan_id: planId,
      texto: texto.trim() || "(foto adjunta)",
      foto_url,
    })

    if ("error" in result) {
      toast.error(result.error)
    } else {
      setComentarios((prev) => [result.data, ...prev])
      setTexto("")
      clearFoto()
      toast.success("Comentario agregado")
    }

    setSending(false)
  }

  async function handleDelete(id: string) {
    const result = await deletePlanComentario(id)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setComentarios((prev) => prev.filter((c) => c.id !== id))
      toast.success("Comentario eliminado")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4" />
          Comentarios ({comentarios.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 border-t pt-4">
        {/* New comment form */}
        <div className="space-y-2 rounded-lg bg-muted/30 p-3">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe un comentario..."
            className="min-h-16 bg-white"
          />
          {fotoPreview && (
            <div className="relative inline-block">
              <img
                src={fotoPreview}
                alt="Preview"
                className="h-20 w-20 rounded-lg object-cover"
              />
              <button
                onClick={clearFoto}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs"
              >
                x
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="mr-1 h-3.5 w-3.5" />
                Foto
              </Button>
            </div>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sending || (!texto.trim() && !fotoFile)}
            >
              {sending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Enviar
            </Button>
          </div>
        </div>

        {/* Comments list */}
        {comentarios.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin comentarios aun
          </p>
        ) : (
          <div className="space-y-3">
            {comentarios.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border bg-white p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-slate-800">
                      {c.autor_nombre}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {format(new Date(c.created_at), "dd/MM/yyyy HH:mm")}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDelete(c.id)}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-line">
                  {c.texto}
                </p>
                {c.foto_url && (
                  <a
                    href={c.foto_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src={c.foto_url}
                      alt="Foto adjunta"
                      className="mt-1 max-h-48 rounded-lg object-cover"
                    />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ==================== HISTORIAL SECTION ====================

function HistorialSection({
  historial,
}: {
  historial: PlanHistorialConAutor[]
}) {
  if (historial.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" />
            Historial de Estados
          </CardTitle>
        </CardHeader>
        <CardContent className="border-t pt-4">
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin cambios de estado registrados
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          Historial de Estados ({historial.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="border-t pt-4">
        <div className="space-y-3">
          {historial.map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-3 text-sm"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{
                    backgroundColor: ESTADO_PLAN_COLORS[h.estado_anterior],
                  }}
                >
                  {ESTADO_PLAN_LABELS[h.estado_anterior]}
                </span>
                <span className="text-muted-foreground">→</span>
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{
                    backgroundColor: ESTADO_PLAN_COLORS[h.estado_nuevo],
                  }}
                >
                  {ESTADO_PLAN_LABELS[h.estado_nuevo]}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {h.autor_nombre} -{" "}
                {format(new Date(h.changed_at), "dd/MM/yyyy HH:mm")}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ==================== EVIDENCIAS SECTION ====================

function EvidenciasSection({
  planId,
  preguntaId,
  evidencias: initialEvidencias,
}: {
  planId: string
  preguntaId: string
  evidencias: Evidencia[]
}) {
  const router = useRouter()
  const [evidencias, setEvidencias] = useState(initialEvidencias)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [unlinkedEvidencias, setUnlinkedEvidencias] = useState<Evidencia[]>([])
  const [loadingUnlinked, setLoadingUnlinked] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState<string | null>(null)

  // New evidencia form
  const [newForm, setNewForm] = useState({
    titulo: "",
    descripcion: "",
    url: "",
    tipo: "documento" as TipoEvidencia,
  })
  const [newFotoFile, setNewFotoFile] = useState<File | null>(null)
  const [savingNew, setSavingNew] = useState(false)
  const newFileRef = useRef<HTMLInputElement>(null)

  async function loadUnlinked() {
    setLoadingUnlinked(true)
    const result = await getUnlinkedEvidencias(planId, preguntaId)
    if ("data" in result) {
      setUnlinkedEvidencias(result.data)
    }
    setLoadingUnlinked(false)
  }

  async function handleLink(evidenciaId: string) {
    setLinking(evidenciaId)
    const result = await linkEvidenciaToPlan(evidenciaId, planId)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      const ev = unlinkedEvidencias.find((e) => e.id === evidenciaId)
      if (ev) {
        setEvidencias((prev) => [ev, ...prev])
        setUnlinkedEvidencias((prev) =>
          prev.filter((e) => e.id !== evidenciaId)
        )
      }
      toast.success("Evidencia vinculada")
    }
    setLinking(null)
  }

  async function handleUnlink(evidenciaId: string) {
    setUnlinking(evidenciaId)
    const result = await unlinkEvidenciaFromPlan(evidenciaId, planId)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setEvidencias((prev) => prev.filter((e) => e.id !== evidenciaId))
      toast.success("Evidencia desvinculada")
    }
    setUnlinking(null)
  }

  async function handleCreateNew() {
    if (!newForm.titulo) {
      toast.error("El titulo es requerido")
      return
    }

    setSavingNew(true)

    let url = newForm.url || undefined
    let file_path: string | undefined

    // Upload file if foto type and file selected
    if (newFotoFile) {
      try {
        const supabase = createClient()
        const ext = newFotoFile.name.split(".").pop() ?? "jpg"
        const path = `evidencias/${preguntaId}/${Date.now()}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from("evidencias")
          .upload(path, newFotoFile)

        if (uploadErr) {
          toast.error("Error subiendo archivo: " + uploadErr.message)
          setSavingNew(false)
          return
        }

        const { data: urlData } = supabase.storage
          .from("evidencias")
          .getPublicUrl(path)

        url = urlData.publicUrl
        file_path = path
      } catch {
        toast.error("Error subiendo archivo")
        setSavingNew(false)
        return
      }
    }

    const result = await createEvidencia({
      pregunta_id: preguntaId,
      titulo: newForm.titulo,
      descripcion: newForm.descripcion || undefined,
      url,
      file_path,
      tipo: newForm.tipo,
      plan_ids: [planId],
    })

    if ("error" in result) {
      toast.error(result.error)
    } else {
      setEvidencias((prev) => [result.data, ...prev])
      setNewForm({ titulo: "", descripcion: "", url: "", tipo: "documento" })
      setNewFotoFile(null)
      setNewDialogOpen(false)
      toast.success("Evidencia creada y vinculada")
    }

    setSavingNew(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileCheck className="h-4 w-4" />
            Evidencias ({evidencias.length})
          </CardTitle>
          <div className="flex gap-2">
            {/* Link existing */}
            <Dialog
              open={linkDialogOpen}
              onOpenChange={(open) => {
                setLinkDialogOpen(open)
                if (open) loadUnlinked()
              }}
            >
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    <Link2Icon className="mr-1 h-3 w-3" />
                    Vincular
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Vincular Evidencia Existente</DialogTitle>
                </DialogHeader>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {loadingUnlinked ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : unlinkedEvidencias.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No hay evidencias disponibles para vincular
                    </p>
                  ) : (
                    unlinkedEvidencias.map((ev) => {
                      const TipoIcon = TIPO_EVIDENCIA_ICONS[ev.tipo] ?? FileText
                      return (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <TipoIcon className="h-4 w-4 shrink-0 text-slate-500" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {ev.titulo}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {TIPO_EVIDENCIA_LABELS[ev.tipo]}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={linking === ev.id}
                            onClick={() => handleLink(ev.id)}
                          >
                            {linking === ev.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Vincular"
                            )}
                          </Button>
                        </div>
                      )
                    })
                  )}
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cerrar
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Create new */}
            <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    <Plus className="mr-1 h-3 w-3" />
                    Nueva
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Nueva Evidencia</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div>
                    <Label htmlFor="new-ev-titulo">Titulo</Label>
                    <Input
                      id="new-ev-titulo"
                      value={newForm.titulo}
                      onChange={(e) =>
                        setNewForm((f) => ({ ...f, titulo: e.target.value }))
                      }
                      placeholder="Titulo de la evidencia"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-ev-desc">Descripcion</Label>
                    <Textarea
                      id="new-ev-desc"
                      value={newForm.descripcion}
                      onChange={(e) =>
                        setNewForm((f) => ({ ...f, descripcion: e.target.value }))
                      }
                      placeholder="Descripcion opcional..."
                      className="min-h-12"
                    />
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select
                      value={newForm.tipo}
                      onValueChange={(val) =>
                        setNewForm((f) => ({ ...f, tipo: val as TipoEvidencia }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["documento", "foto", "link", "nota"] as const).map(
                          (t) => (
                            <SelectItem key={t} value={t}>
                              {TIPO_EVIDENCIA_LABELS[t]}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {newForm.tipo === "foto" ? (
                    <div>
                      <Label>Archivo</Label>
                      <input
                        ref={newFileRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setNewFotoFile(e.target.files?.[0] ?? null)
                        }
                        className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                      />
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="new-ev-url">URL</Label>
                      <Input
                        id="new-ev-url"
                        value={newForm.url}
                        onChange={(e) =>
                          setNewForm((f) => ({ ...f, url: e.target.value }))
                        }
                        placeholder="https://..."
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancelar
                  </DialogClose>
                  <Button onClick={handleCreateNew} disabled={savingNew}>
                    {savingNew ? "Guardando..." : "Crear y Vincular"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="border-t pt-4">
        {evidencias.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin evidencias vinculadas
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {evidencias.map((ev) => {
              const TipoIcon = TIPO_EVIDENCIA_ICONS[ev.tipo] ?? FileText
              return (
                <div
                  key={ev.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                        <TipoIcon className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="min-w-0">
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
                      disabled={unlinking === ev.id}
                      onClick={() => handleUnlink(ev.id)}
                      title="Desvincular"
                    >
                      {unlinking === ev.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Unlink className="h-3 w-3 text-red-500" />
                      )}
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
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ==================== ESTADO DROPDOWN ====================

function EstadoDropdown({
  estado,
  onChange,
}: {
  estado: EstadoPlan
  onChange: (estado: EstadoPlan) => void
}) {
  const estados: EstadoPlan[] = ["pendiente", "en_progreso", "completado"]
  const icons: Record<EstadoPlan, React.ReactNode> = {
    pendiente: <AlertCircle className="size-3.5" />,
    en_progreso: <Clock className="size-3.5" />,
    completado: <CheckCircle2 className="size-3.5" />,
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white cursor-pointer transition-opacity hover:opacity-80"
        style={{ backgroundColor: ESTADO_PLAN_COLORS[estado] }}
      >
        {icons[estado]}
        {ESTADO_PLAN_LABELS[estado]}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {estados.map((e) => (
          <DropdownMenuItem
            key={e}
            onClick={() => onChange(e)}
            className="gap-2"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: ESTADO_PLAN_COLORS[e] }}
            />
            {ESTADO_PLAN_LABELS[e]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ==================== MAIN COMPONENT ====================

export function PlanDetailClient({
  plan: initialPlan,
  currentRole,
}: {
  plan: PlanAccionFull
  currentRole: UserRole
}) {
  const router = useRouter()
  const [plan, setPlan] = useState(initialPlan)
  const [reprogramarOpen, setReprogramarOpen] = useState(false)
  const [cerrarOpen, setCerrarOpen] = useState(false)

  const canEditResponsables =
    currentRole === "admin" || currentRole === "auditor"
  const isAdmin = currentRole === "admin"
  const totalEvidencias =
    (plan.evidencias?.length ?? 0) + (plan.archivos_dpo?.length ?? 0)

  async function handleEstadoChange(nuevoEstado: EstadoPlan) {
    const result = await updatePlanEstado(plan.id, nuevoEstado)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setPlan((prev) => ({ ...prev, estado: nuevoEstado }))
      toast.success(`Estado actualizado a ${ESTADO_PLAN_LABELS[nuevoEstado]}`)
      router.refresh()
    }
  }

  async function handleProgresoChange(progreso: number) {
    const result = await updatePlanProgreso(plan.id, progreso)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setPlan((prev) => ({ ...prev, progreso }))
      toast.success("Progreso actualizado")
    }
  }

  async function handleNotasChange(notas: string) {
    const result = await updatePlanNotas(plan.id, notas)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setPlan((prev) => ({ ...prev, notas: notas || null }))
      toast.success("Notas guardadas")
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/planes" />}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: plan.pilar_color || "#64748B" }}
            >
              {plan.pilar_nombre}
            </span>
            <span>/</span>
            <span>{plan.bloque_nombre}</span>
            <span>/</span>
            <Link
              href={`/pilares/${plan.pilar_id}/pregunta/${plan.pregunta_id}`}
              className="hover:underline"
            >
              {plan.pregunta_numero}
            </Link>
          </div>
          <h1 className="mt-1 text-lg font-bold text-slate-900 leading-snug">
            {plan.descripcion}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
            {plan.pregunta_texto}
          </p>
        </div>
      </div>

      {/* Info */}
      <InfoSection
        plan={plan}
        onEstadoChange={handleEstadoChange}
        onProgresoChange={handleProgresoChange}
        onNotasChange={handleNotasChange}
      />

      {/* Responsables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" />
            Responsables ({plan.responsables?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="border-t pt-4">
          <ResponsablesMultiPicker
            planId={plan.id}
            responsables={plan.responsables ?? []}
            canEdit={canEditResponsables}
            onChange={() => router.refresh()}
          />
        </CardContent>
      </Card>

      {/* Acciones del plan */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-slate-800">
                Acciones del plan
              </p>
              <p className="text-xs text-muted-foreground">
                Reprogramar fecha límite o cerrar el plan.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReprogramarOpen(true)}
              >
                <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                Reprogramar
              </Button>
              <Button
                size="sm"
                onClick={() => setCerrarOpen(true)}
                disabled={plan.estado === "completado"}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                {plan.estado === "completado" ? "Plan cerrado" : "Cerrar plan"}
              </Button>
            </div>
          </div>

          {/* Evidencia obligatoria switch (solo admin, deshabilitado por ahora) */}
          {isAdmin && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2"
              title="Próximamente"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs font-medium text-slate-700">
                    Evidencia obligatoria
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {plan.evidencia_obligatoria
                      ? "Activada — no se puede cerrar sin evidencia"
                      : "Desactivada — se puede cerrar sin evidencia"}
                  </p>
                </div>
              </div>
              {/* TODO: implementar togglePlanEvidenciaObligatoria server action */}
              <label
                className="inline-flex cursor-not-allowed items-center gap-2 opacity-60"
                title="Próximamente"
              >
                <span className="text-[11px] text-muted-foreground">
                  Próximamente
                </span>
                <span
                  role="switch"
                  aria-checked={plan.evidencia_obligatoria}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    plan.evidencia_obligatoria ? "bg-blue-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      plan.evidencia_obligatoria ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comentarios */}
      <ComentariosSection
        planId={plan.id}
        comentarios={plan.comentarios}
      />

      {/* Historial */}
      <HistorialSection historial={plan.historial} />

      {/* Historial de reprogramaciones */}
      <ReprogramacionesSection reprogramaciones={plan.reprogramaciones ?? []} />

      {/* Evidencias */}
      <EvidenciasSection
        planId={plan.id}
        preguntaId={plan.pregunta_id}
        evidencias={plan.evidencias}
      />

      {/* Archivos DPO vinculados */}
      <ArchivosDpoSection
        planId={plan.id}
        archivos={plan.archivos_dpo}
      />

      {/* Dialogs */}
      <ReprogramarDialog
        planId={plan.id}
        fechaActual={plan.fecha_limite}
        open={reprogramarOpen}
        onOpenChange={setReprogramarOpen}
        onDone={() => router.refresh()}
      />
      <CerrarPlanDialog
        planId={plan.id}
        evidenciaObligatoria={plan.evidencia_obligatoria}
        totalEvidencias={totalEvidencias}
        esAdmin={isAdmin}
        open={cerrarOpen}
        onOpenChange={setCerrarOpen}
        onDone={() => router.refresh()}
      />
    </div>
  )
}

// ==================== REPROGRAMACIONES SECTION ====================

function ReprogramacionesSection({
  reprogramaciones,
}: {
  reprogramaciones: PlanReprogramacionConAutor[]
}) {
  if (reprogramaciones.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4" />
            Historial de reprogramaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="border-t pt-4">
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin reprogramaciones registradas
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarClock className="h-4 w-4" />
          Historial de reprogramaciones ({reprogramaciones.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="border-t pt-4">
        <div className="space-y-3">
          {reprogramaciones.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                  {r.fecha_anterior
                    ? format(new Date(r.fecha_anterior), "dd/MM/yyyy")
                    : "—"}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                  {format(new Date(r.fecha_nueva), "dd/MM/yyyy")}
                </span>
              </div>
              {r.motivo && (
                <p className="mt-2 text-xs text-slate-700 whitespace-pre-line">
                  {r.motivo}
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {r.autor_nombre} ·{" "}
                {format(new Date(r.reprogramado_at), "dd/MM/yyyy HH:mm")}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ArchivosDpoSection({
  planId,
  archivos: initialArchivos,
}: {
  planId: string
  archivos: DpoArchivo[]
}) {
  const router = useRouter()
  const [archivos, setArchivos] = useState(initialArchivos)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DpoArchivo[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, startLinking] = useTransition()

  async function runSearch(q: string) {
    setSearching(true)
    const r = await searchArchivos(q, planId)
    setSearching(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    setResults(r.data)
  }

  function handleOpen(v: boolean) {
    setPickerOpen(v)
    if (v) {
      setQuery("")
      runSearch("")
    }
  }

  function handleLink(arch: DpoArchivo) {
    startLinking(async () => {
      const r = await linkArchivoToPlan(planId, arch.id)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setArchivos((prev) => [arch, ...prev])
      setResults((prev) => prev.filter((a) => a.id !== arch.id))
      toast.success("Evidencia vinculada")
    })
  }

  function handleUnlink(archivoId: string) {
    if (!confirm("¿Desvincular esta evidencia del plan?")) return
    startLinking(async () => {
      const r = await unlinkArchivoFromPlan(planId, archivoId)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setArchivos((prev) => prev.filter((a) => a.id !== archivoId))
      toast.success("Evidencia desvinculada")
    })
  }

  async function handleDownload(archivoId: string) {
    const r = await getDownloadUrl({ archivo_id: archivoId })
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    window.open(r.data.url, "_blank")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            Evidencias DPO vinculadas ({archivos.length})
          </span>
          <Button size="sm" variant="outline" onClick={() => handleOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Vincular evidencia
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="border-t pt-4">
        {archivos.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-6">
            No hay evidencias DPO vinculadas a este plan
          </p>
        ) : (
          <div className="space-y-2">
            {archivos.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-1 items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{a.titulo}</p>
                    <p className="truncate text-xs text-slate-500">
                      {a.pilar_codigo} · {a.punto_codigo}
                      {a.requisito_codigo ? ` · ${a.requisito_codigo}` : ""}
                      {a.categoria ? ` · ${a.categoria}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload(a.id)}
                    title="Descargar"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUnlink(a.id)}
                    disabled={linking}
                    title="Desvincular"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={pickerOpen} onOpenChange={handleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular evidencia DPO</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar por título, archivo o categoría..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                runSearch(e.target.value)
              }}
            />
            <p className="text-xs text-slate-500">
              ¿No la ves?{" "}
              <Link href="/evidencia" className="text-blue-600 hover:underline">
                Subila desde Evidencia
              </Link>{" "}
              y volvé a vincularla.
            </p>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {searching ? (
                <p className="py-4 text-center text-sm text-slate-400">Buscando...</p>
              ) : results.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">
                  No se encontraron archivos
                </p>
              ) : (
                results.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleLink(a)}
                    disabled={linking}
                    className="flex w-full items-start gap-3 rounded-md border border-slate-200 p-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{a.titulo}</p>
                      <p className="truncate text-xs text-slate-500">
                        {a.pilar_codigo} · {a.punto_codigo}
                        {a.requisito_codigo ? ` · ${a.requisito_codigo}` : ""}
                        {a.categoria ? ` · ${a.categoria}` : ""}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
