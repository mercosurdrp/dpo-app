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
  Pencil,
  Target,
  Trash2,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  agregarAvancePlanNps,
  eliminarAvancePlanNps,
  eliminarPlanNps,
  getAvanceNpsSignedUrl,
  listarAvancesPlanNps,
  type EstadoNpsPlan,
  type NpsPlan,
  type NpsPlanAvance,
} from "@/actions/nps-planes"
import { AdjuntosInput } from "@/components/adjuntos-input"

const ESTADO_LABELS: Record<EstadoNpsPlan, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}

const ESTADO_BADGE: Record<EstadoNpsPlan, string> = {
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
  plan: NpsPlan
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
  const [avances, setAvances] = useState<NpsPlanAvance[]>([])
  const [cargandoAvances, setCargandoAvances] = useState(false)
  /** Miniaturas firmadas, cacheadas por path (un avance puede traer varias). */
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})

  const [comentario, setComentario] = useState("")
  const [archivos, setArchivos] = useState<File[]>([])
  const [nuevoEstado, setNuevoEstado] = useState<string>(SIN_CAMBIO)

  const [submitting, startSubmit] = useTransition()
  const [eliminando, startEliminar] = useTransition()

  async function recargarAvances() {
    setCargandoAvances(true)
    const r = await listarAvancesPlanNps(plan.id)
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

  // Preview de imágenes con signed URL (una por path).
  useEffect(() => {
    const pendientes = avances
      .flatMap((a) => a.archivos)
      .filter(
        (arch) => esImagen(arch.mime, arch.nombre) && !imageUrls[arch.path],
      )
    if (pendientes.length === 0) return
    let cancelled = false
    ;(async () => {
      const updates: Record<string, string> = {}
      for (const arch of pendientes) {
        const r = await getAvanceNpsSignedUrl(arch.path)
        if ("data" in r) updates[arch.path] = r.data.url
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
    setArchivos([])
    setNuevoEstado(SIN_CAMBIO)
  }

  async function handleAbrirArchivo(path: string, nombre: string | null) {
    const r = await getAvanceNpsSignedUrl(path)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    abrirArchivo(r.data.url, nombre ?? undefined)
  }

  function handleAgregarAvance() {
    if (!comentario.trim() && archivos.length === 0) {
      toast.error("Cargá un comentario o adjuntá un archivo de evidencia")
      return
    }
    const fd = new FormData()
    fd.append("comentario", comentario.trim())
    for (const f of archivos) fd.append("archivo", f)
    if (nuevoEstado !== SIN_CAMBIO) fd.append("nuevo_estado", nuevoEstado)

    startSubmit(async () => {
      const r = await agregarAvancePlanNps(plan.id, fd)
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
      const r = await eliminarAvancePlanNps(id)
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
      const r = await eliminarPlanNps(plan.id)
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
          <Badge variant="outline" className={ESTADO_BADGE[plan.estado]}>
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
          <p className="whitespace-pre-wrap rounded-md border-l-4 border-slate-400 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
            {plan.descripcion}
          </p>
        )}

        <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {(plan.foco_driver ||
            plan.foco_cliente_nombre ||
            plan.foco_promotor) && (
            <div className="flex items-start gap-2">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>
                <span className="font-medium text-slate-700">Foco: </span>
                {[plan.foco_driver, plan.foco_cliente_nombre, plan.foco_promotor]
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

        {/* Recuperación del cliente foco (fase 1 + señal RMD fase 2) */}
        {plan.foco_cliente_id != null && (
          <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm">
            <p className="font-semibold text-slate-800">
              Recuperación del cliente
            </p>
            <p className="text-slate-600">
              Punto de partida:{" "}
              <span className="font-medium">
                score {plan.baseline_score ?? "—"}
                {plan.baseline_categoria
                  ? ` (${plan.baseline_categoria === "Detractor" ? "Detractor" : plan.baseline_categoria === "Passive" ? "Pasivo" : "Promotor"})`
                  : ""}
              </span>
              {plan.baseline_fecha &&
                ` el ${fechaDia(plan.baseline_fecha.slice(0, 10))}`}
            </p>
            <p className="text-slate-600">
              {plan.re_score != null ? (
                <>
                  Re-encuesta:{" "}
                  <span
                    className={`font-medium ${
                      plan.re_score >= 9
                        ? "text-emerald-700"
                        : plan.baseline_score != null &&
                            plan.re_score > plan.baseline_score
                          ? "text-amber-700"
                          : "text-red-700"
                    }`}
                  >
                    score {plan.baseline_score ?? "?"} → {plan.re_score}
                  </span>{" "}
                  el {plan.re_fecha && fechaDia(plan.re_fecha.slice(0, 10))}
                  {plan.re_score >= 9 &&
                    " — 🟢 el cliente pasó a promotor: evaluar completar el plan."}
                </>
              ) : (
                <>
                  ⏳ BEES todavía no volvió a encuestar al cliente (la
                  encuesta NPS es trimestral y la dispara BEES).
                </>
              )}
            </p>
            <p className="text-slate-600">
              {plan.rmd_post_n > 0 ? (
                <>
                  Señal temprana — RMD desde el plan:{" "}
                  <span
                    className={`font-medium ${
                      (plan.rmd_post_avg ?? 0) >= 4.5
                        ? "text-emerald-700"
                        : (plan.rmd_post_avg ?? 0) >= 4
                          ? "text-amber-700"
                          : "text-red-700"
                    }`}
                  >
                    {plan.rmd_post_avg?.toFixed(2)} / 5
                  </span>{" "}
                  ({plan.rmd_post_n}{" "}
                  {plan.rmd_post_n === 1
                    ? "entrega puntuada"
                    : "entregas puntuadas"}
                  )
                </>
              ) : (
                <>
                  Señal temprana — RMD: el cliente todavía no puntuó entregas
                  desde que existe el plan.
                </>
              )}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onEditar}>
            <Pencil className="mr-1 h-4 w-4" />
            Editar
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

                    {a.archivos.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {a.archivos.map((arch) => {
                          const isImg = esImagen(arch.mime, arch.nombre)
                          const thumbUrl = imageUrls[arch.path]
                          return isImg && thumbUrl ? (
                            <button
                              key={arch.path}
                              type="button"
                              onClick={() =>
                                handleAbrirArchivo(arch.path, arch.nombre)
                              }
                              className="overflow-hidden rounded-md border border-slate-200 transition-opacity hover:opacity-80"
                              title={`${arch.nombre} · ${formatBytes(arch.bytes)}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={thumbUrl}
                                alt={arch.nombre}
                                className="h-20 w-20 object-cover"
                              />
                            </button>
                          ) : (
                            <Button
                              key={arch.path}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              title={formatBytes(arch.bytes)}
                              onClick={() =>
                                handleAbrirArchivo(arch.path, arch.nombre)
                              }
                            >
                              {isImg ? (
                                <ImageIcon className="h-3.5 w-3.5" />
                              ) : (
                                <FileText className="h-3.5 w-3.5" />
                              )}
                              <span className="max-w-[14rem] truncate">
                                {arch.nombre}
                              </span>
                              <Download className="ml-1 h-3 w-3" />
                            </Button>
                          )
                        })}
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
              <Label htmlFor="nav-comentario">Nuevo avance</Label>
              <Textarea
                id="nav-comentario"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Qué se hizo, qué falta, contexto…"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>
                  Evidencia (opcional — podés pegar con Ctrl+V)
                </Label>
                <AdjuntosInput
                  archivos={archivos}
                  onChange={setArchivos}
                  activo={open}
                  disabled={submitting}
                />
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
