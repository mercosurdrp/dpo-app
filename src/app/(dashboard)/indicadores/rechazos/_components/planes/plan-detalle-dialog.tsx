"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { abrirArchivo } from "@/lib/abrir-archivo"
import {
  Calendar,
  Download,
  FileEdit,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Target,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
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
  agregarAvancePlanRechazos,
  eliminarAvancePlanRechazos,
  eliminarPlanRechazos,
  getAvanceRechazoSignedUrl,
  listarAvancesPlanRechazos,
  type EstadoRechazoPlan,
  type RechazoPlan,
  type RechazoPlanAvance,
} from "@/actions/rechazos-planes"

const ESTADO_LABELS: Record<EstadoRechazoPlan, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}

const ESTADO_BADGE: Record<EstadoRechazoPlan, string> = {
  pendiente: "bg-amber-100 text-amber-800 border-amber-200",
  en_progreso: "bg-blue-100 text-blue-800 border-blue-200",
  completado: "bg-emerald-100 text-emerald-800 border-emerald-200",
}

const PRIORIDAD_LABELS: Record<string, string> = {
  alta: "Prioridad alta",
  media: "Prioridad media",
  baja: "Prioridad baja",
}

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-800 border-red-200",
  media: "bg-amber-100 text-amber-800 border-amber-200",
  baja: "bg-slate-100 text-slate-700 border-slate-200",
}

const SIN_CAMBIO = "__sin_cambio__"
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"]

function esImagen(mime: string | null, nombre: string | null): boolean {
  if (mime?.startsWith("image/")) return true
  if (!nombre) return false
  const ext = nombre.split(".").pop()?.toLowerCase() ?? ""
  return IMAGE_EXTS.includes(ext)
}

function formatBytes(b: number | null): string {
  if (!b || b <= 0) return ""
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

const FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
})

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

function fechaHora(iso: string): string {
  try {
    return FMT.format(new Date(iso))
  } catch {
    return iso
  }
}

function fechaDia(iso: string | null): string {
  if (!iso) return "—"
  try {
    return FMT_DIA.format(new Date(iso + "T00:00:00"))
  } catch {
    return iso
  }
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  plan: RechazoPlan
  responsables: { id: string; nombre: string }[]
  onChanged: () => void
  onEditar: () => void
}

export function PlanDetalleDialog({
  open,
  onOpenChange,
  plan,
  onChanged,
  onEditar,
}: Props) {
  const [avances, setAvances] = useState<RechazoPlanAvance[]>([])
  const [cargandoAvances, setCargandoAvances] = useState(false)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})

  const [comentario, setComentario] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nuevoEstado, setNuevoEstado] = useState<string>(SIN_CAMBIO)

  const [submitting, startSubmit] = useTransition()
  const [eliminando, startEliminar] = useTransition()

  async function recargarAvances() {
    setCargandoAvances(true)
    const r = await listarAvancesPlanRechazos(plan.id)
    setCargandoAvances(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    setAvances(r.data)
  }

  useEffect(() => {
    if (!open) return
    recargarAvances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan.id])

  // Preview de imágenes con signed URL.
  useEffect(() => {
    const pendientes = avances.filter(
      (a) =>
        a.archivo_path &&
        esImagen(a.archivo_mime, a.archivo_nombre) &&
        !imageUrls[a.id],
    )
    if (pendientes.length === 0) return
    let cancelled = false
    ;(async () => {
      const updates: Record<string, string> = {}
      for (const a of pendientes) {
        if (!a.archivo_path) continue
        const r = await getAvanceRechazoSignedUrl(a.archivo_path)
        if ("data" in r) updates[a.id] = r.data.url
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setImageUrls((prev) => ({ ...prev, ...updates }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [avances, imageUrls])

  function resetForm() {
    setComentario("")
    setArchivo(null)
    setNuevoEstado(SIN_CAMBIO)
  }

  async function handleAbrirArchivo(path: string, nombre: string | null) {
    const r = await getAvanceRechazoSignedUrl(path)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    abrirArchivo(r.data.url, nombre ?? undefined)
  }

  function handleAgregarAvance() {
    if (!comentario.trim() && !archivo) {
      toast.error("Cargá un comentario o adjuntá un archivo de evidencia")
      return
    }
    const fd = new FormData()
    fd.append("comentario", comentario.trim())
    if (archivo) fd.append("archivo", archivo)
    if (nuevoEstado !== SIN_CAMBIO) fd.append("nuevo_estado", nuevoEstado)

    startSubmit(async () => {
      const r = await agregarAvancePlanRechazos(plan.id, fd)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Avance registrado")
      resetForm()
      await recargarAvances()
      onChanged()
    })
  }

  function handleEliminarAvance(id: string) {
    if (!confirm("¿Eliminar este avance? No se puede deshacer.")) return
    startSubmit(async () => {
      const r = await eliminarAvancePlanRechazos(id)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Avance eliminado")
      setAvances((prev) => prev.filter((a) => a.id !== id))
      onChanged()
    })
  }

  function handleEliminarPlan() {
    if (
      !confirm(
        "¿Eliminar este plan de acción y todos sus avances? No se puede deshacer.",
      )
    )
      return
    startEliminar(async () => {
      const r = await eliminarPlanRechazos(plan.id)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Plan eliminado")
      onOpenChange(false)
      onChanged()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 text-left">{plan.titulo}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={ESTADO_BADGE[plan.estado]}
          >
            {ESTADO_LABELS[plan.estado]}
          </Badge>
          <Badge
            variant="outline"
            className={PRIORIDAD_BADGE[plan.prioridad] ?? ""}
          >
            {PRIORIDAD_LABELS[plan.prioridad] ?? plan.prioridad}
          </Badge>
        </div>

        {plan.descripcion && (
          <p className="whitespace-pre-wrap text-sm text-slate-700">
            {plan.descripcion}
          </p>
        )}

        <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {(plan.foco_motivo_ds || plan.foco_cliente_nombre) && (
            <div className="flex items-start gap-2">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>
                <span className="font-medium text-slate-700">Foco: </span>
                {[plan.foco_motivo_ds, plan.foco_cliente_nombre]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 shrink-0 text-slate-400" />
            <span>
              <span className="font-medium text-slate-700">Responsable: </span>
              {plan.responsable_nombre ?? "Sin asignar"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            <span>
              <span className="font-medium text-slate-700">
                Fecha objetivo:{" "}
              </span>
              {fechaDia(plan.fecha_objetivo)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FileEdit className="h-4 w-4 shrink-0 text-slate-400" />
            <span>
              <span className="font-medium text-slate-700">Creado por: </span>
              {plan.created_by_nombre ?? "—"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onEditar}>
            <Pencil className="mr-1 h-4 w-4" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                `/api/rechazos/plan-pdf?id=${plan.id}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <FileText className="mr-1 h-4 w-4" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={handleEliminarPlan}
            disabled={eliminando}
          >
            {eliminando ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            Eliminar
          </Button>
        </div>

        <Separator />

        {/* Seguimiento */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">
            Seguimiento ({avances.length})
          </h3>

          {cargandoAvances ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando avances…
            </div>
          ) : avances.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              Sin avances todavía. Sumá el primero abajo.
            </p>
          ) : (
            <ol className="space-y-4">
              {avances.map((a) => {
                const isImg = esImagen(a.archivo_mime, a.archivo_nombre)
                const thumbUrl = imageUrls[a.id]
                return (
                  <li
                    key={a.id}
                    className="rounded-md border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {a.autor_nombre ?? "—"}
                      </span>
                      <span>·</span>
                      <span>{fechaHora(a.created_at)}</span>
                      {a.estado_resultante && (
                        <Badge
                          variant="outline"
                          className={`ml-auto text-[10px] ${
                            ESTADO_BADGE[a.estado_resultante]
                          }`}
                        >
                          {ESTADO_LABELS[a.estado_resultante]}
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEliminarAvance(a.id)}
                        className={`text-slate-400 hover:text-red-500 ${
                          a.estado_resultante ? "" : "ml-auto"
                        }`}
                        title="Eliminar avance"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {a.comentario && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                        {a.comentario}
                      </p>
                    )}

                    {a.archivo_path && (
                      <div className="mt-2 flex items-center gap-2">
                        {isImg && thumbUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleAbrirArchivo(
                                a.archivo_path!,
                                a.archivo_nombre,
                              )
                            }
                            className="overflow-hidden rounded-md border border-slate-200 transition-opacity hover:opacity-80"
                            title="Ver evidencia"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbUrl}
                              alt={a.archivo_nombre ?? ""}
                              className="h-20 w-20 object-cover"
                            />
                          </button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() =>
                              handleAbrirArchivo(
                                a.archivo_path!,
                                a.archivo_nombre,
                              )
                            }
                          >
                            {isImg ? (
                              <ImageIcon className="h-3.5 w-3.5" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" />
                            )}
                            Ver evidencia
                            <Download className="ml-1 h-3 w-3" />
                          </Button>
                        )}
                        <div className="min-w-0 text-xs text-slate-500">
                          <p className="truncate">{a.archivo_nombre}</p>
                          <p>{formatBytes(a.archivo_bytes)}</p>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}

          <Separator />

          {/* Form para agregar avance */}
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
            <div className="space-y-1">
              <Label htmlFor="av-comentario">Nuevo avance</Label>
              <Textarea
                id="av-comentario"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Qué se hizo, qué falta, contexto…"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Evidencia (opcional)</Label>
                {archivo ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <Paperclip className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="truncate">{archivo.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {formatBytes(archivo.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setArchivo(null)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white py-3 text-sm text-slate-500 hover:bg-slate-100">
                    <Upload className="h-4 w-4" />
                    Adjuntar archivo o foto
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) setArchivo(f)
                      }}
                    />
                  </label>
                )}
              </div>

              <div className="space-y-1">
                <Label>Cambiar estado a (opcional)</Label>
                <Select
                  value={nuevoEstado}
                  onValueChange={(v) => v && setNuevoEstado(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_CAMBIO}>Sin cambio</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="en_progreso">En progreso</SelectItem>
                    <SelectItem value="completado">Completado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleAgregarAvance}
                disabled={submitting}
              >
                {submitting && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                Guardar avance
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
