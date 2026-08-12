"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Calendar,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Target,
  Trash2,
  User,
} from "lucide-react"
import { abrirArchivo } from "@/lib/abrir-archivo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
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
import { AdjuntosInput } from "@/components/adjuntos-input"
import {
  agregarAvancePlanClima,
  eliminarAvancePlanClima,
  eliminarPlanClima,
  getAvanceClimaSignedUrl,
  listarAvancesPlanClima,
} from "@/actions/clima-planes"
import {
  ESTADO_CLIMA_LABEL,
  PRIORIDAD_CLIMA_LABEL,
  type ClimaPlan,
  type ClimaPlanAvance,
  type EstadoClimaPlan,
} from "@/actions/clima-tipos"

const SIN_CAMBIO = "__sin_cambio__"
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"]

const ESTADO_BADGE: Record<EstadoClimaPlan, string> = {
  pendiente: "border-amber-200 bg-amber-100 text-amber-800",
  en_progreso: "border-blue-200 bg-blue-100 text-blue-800",
  completado: "border-emerald-200 bg-emerald-100 text-emerald-800",
}

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: "border-red-200 bg-red-100 text-red-800",
  media: "border-amber-200 bg-amber-100 text-amber-800",
  baja: "border-slate-200 bg-slate-100 text-slate-700",
}

const FMT_HORA = new Intl.DateTimeFormat("es-AR", {
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

function esImagen(mime: string | null, nombre: string | null): boolean {
  if (mime?.startsWith("image/")) return true
  if (!nombre) return false
  return IMAGE_EXTS.includes(nombre.split(".").pop()?.toLowerCase() ?? "")
}

function formatBytes(b: number | null): string {
  if (!b || b <= 0) return ""
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

interface Props {
  plan: ClimaPlan | null
  open: boolean
  onOpenChange: (o: boolean) => void
  puedeEditar: boolean
  onEditar: (p: ClimaPlan) => void
  onCambio: () => void
}

export function PlanDetalleDialog({
  plan,
  open,
  onOpenChange,
  puedeEditar,
  onEditar,
  onCambio,
}: Props) {
  const [avances, setAvances] = useState<ClimaPlanAvance[]>([])
  // Arranca en true: el diálogo se monta recién cuando hay un plan que abrir
  // (el padre lo remonta por `key`), así que la carga empieza con él.
  const [cargando, setCargando] = useState(true)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [comentario, setComentario] = useState("")
  const [archivos, setArchivos] = useState<File[]>([])
  const [nuevoEstado, setNuevoEstado] = useState(SIN_CAMBIO)
  const [enviando, startEnviar] = useTransition()
  const [eliminando, startEliminar] = useTransition()

  useEffect(() => {
    if (!open || !plan) return
    let cancelado = false
    ;(async () => {
      const r = await listarAvancesPlanClima(plan.id)
      if (cancelado) return
      setCargando(false)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setAvances(r.data)
    })()
    return () => {
      cancelado = true
    }
  }, [open, plan])

  // Miniaturas firmadas de los adjuntos que son imágenes.
  useEffect(() => {
    const pendientes = avances
      .flatMap((a) => a.archivos)
      .filter((a) => esImagen(a.mime, a.nombre) && !imageUrls[a.path])
    if (!pendientes.length) return
    let cancelado = false
    ;(async () => {
      const nuevos: Record<string, string> = {}
      for (const arch of pendientes) {
        const r = await getAvanceClimaSignedUrl(arch.path)
        if ("data" in r) nuevos[arch.path] = r.data.url
      }
      if (!cancelado && Object.keys(nuevos).length) {
        setImageUrls((prev) => ({ ...prev, ...nuevos }))
      }
    })()
    return () => {
      cancelado = true
    }
  }, [avances, imageUrls])

  if (!plan) return null

  const recargar = async () => {
    const r = await listarAvancesPlanClima(plan.id)
    if ("data" in r) setAvances(r.data)
  }

  const abrir = async (path: string, nombre: string | null) => {
    const r = await getAvanceClimaSignedUrl(path)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    abrirArchivo(r.data.url, nombre ?? undefined)
  }

  const guardarAvance = () => {
    if (!comentario.trim() && !archivos.length) {
      toast.error("Cargá un comentario o adjuntá evidencia")
      return
    }
    const fd = new FormData()
    fd.append("comentario", comentario.trim())
    for (const f of archivos) fd.append("archivo", f)
    if (nuevoEstado !== SIN_CAMBIO) fd.append("nuevo_estado", nuevoEstado)

    startEnviar(async () => {
      const r = await agregarAvancePlanClima(plan.id, fd)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Avance registrado")
      setComentario("")
      setArchivos([])
      setNuevoEstado(SIN_CAMBIO)
      await recargar()
      onCambio()
    })
  }

  const borrarAvance = (id: string) => {
    if (!confirm("¿Eliminar este avance? No se puede deshacer.")) return
    startEnviar(async () => {
      const r = await eliminarAvancePlanClima(id, plan.id)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setAvances((prev) => prev.filter((a) => a.id !== id))
      onCambio()
    })
  }

  const borrarPlan = () => {
    if (!confirm("¿Eliminar el plan y todos sus avances? No se puede deshacer."))
      return
    startEliminar(async () => {
      const r = await eliminarPlanClima(plan.id)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Plan eliminado")
      onOpenChange(false)
      onCambio()
    })
  }

  const campos: Array<[string, string | null]> = [
    ["Foco", plan.foco],
    ["Eje / Driver", plan.eje],
    ["Dimensión", plan.dimension],
    ["Plazo", plan.plazo],
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 text-left">{plan.accion}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className={ESTADO_BADGE[plan.estado]}>
            {ESTADO_CLIMA_LABEL[plan.estado]}
          </Badge>
          <Badge className={PRIORIDAD_BADGE[plan.prioridad]}>
            Prioridad {PRIORIDAD_CLIMA_LABEL[plan.prioridad].toLowerCase()}
          </Badge>
          {plan.ola_codigo && (
            <Badge className="border-slate-200 bg-slate-100 text-slate-700">
              {plan.ola_codigo}
            </Badge>
          )}
        </div>

        {plan.hallazgo && (
          <div className="rounded-md border-l-4 border-blue-400 bg-blue-50/60 px-3 py-2">
            <p className="text-xs font-semibold uppercase text-blue-800">
              Hallazgo
            </p>
            <p className="text-sm text-slate-800">{plan.hallazgo}</p>
          </div>
        )}

        {plan.indicador_exito && (
          <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50/60 px-3 py-2">
            <p className="text-xs font-semibold uppercase text-emerald-800">
              Indicador de éxito / Meta
            </p>
            <p className="text-sm text-slate-800">{plan.indicador_exito}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {campos
            .filter(([, v]) => !!v)
            .map(([k, v]) => (
              <div key={k} className="flex items-start gap-2">
                <Target className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <span>
                  <span className="font-medium text-slate-700">{k}: </span>
                  {v}
                </span>
              </div>
            ))}
          <div className="flex items-center gap-2">
            <User className="size-4 shrink-0 text-slate-400" />
            <span>
              <span className="font-medium text-slate-700">Responsable: </span>
              {plan.responsable_nombre ?? plan.responsable_texto ?? "Sin asignar"}
            </span>
          </div>
          {plan.fecha_objetivo && (
            <div className="flex items-center gap-2">
              <Calendar className="size-4 shrink-0 text-slate-400" />
              <span>
                <span className="font-medium text-slate-700">
                  Fecha objetivo:{" "}
                </span>
                {FMT_DIA.format(new Date(`${plan.fecha_objetivo}T00:00:00`))}
              </span>
            </div>
          )}
        </div>

        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onEditar(plan)}>
              <Pencil className="mr-1 size-4" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={borrarPlan}
              disabled={eliminando}
            >
              {eliminando ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 size-4" />
              )}
              Eliminar
            </Button>
          </div>
        )}

        <Separator />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">
            Seguimiento ({avances.length})
          </h3>

          {cargando ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" /> Cargando avances…
            </div>
          ) : avances.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              Sin avances todavía. Sumá el primero abajo.
            </p>
          ) : (
            <ol className="space-y-3">
              {avances.map((a) => (
                <li
                  key={a.id}
                  className="rounded-md border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {a.autor_nombre ?? "—"}
                    </span>
                    <span>·</span>
                    <span>{FMT_HORA.format(new Date(a.created_at))}</span>
                    {a.estado_resultante && (
                      <Badge
                        className={`ml-auto text-[10px] ${
                          ESTADO_BADGE[a.estado_resultante]
                        }`}
                      >
                        {ESTADO_CLIMA_LABEL[a.estado_resultante]}
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => borrarAvance(a.id)}
                      className={`text-slate-400 hover:text-red-500 ${
                        a.estado_resultante ? "" : "ml-auto"
                      }`}
                      title="Eliminar avance"
                    >
                      <Trash2 className="size-3.5" />
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
                        const img = esImagen(arch.mime, arch.nombre)
                        const url = imageUrls[arch.path]
                        return img && url ? (
                          <button
                            key={arch.path}
                            type="button"
                            onClick={() => abrir(arch.path, arch.nombre)}
                            className="overflow-hidden rounded-md border border-slate-200 transition-opacity hover:opacity-80"
                            title={`${arch.nombre} · ${formatBytes(arch.bytes)}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={arch.nombre}
                              className="size-20 object-cover"
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
                            onClick={() => abrir(arch.path, arch.nombre)}
                          >
                            {img ? (
                              <ImageIcon className="size-3.5" />
                            ) : (
                              <FileText className="size-3.5" />
                            )}
                            <span className="max-w-56 truncate">
                              {arch.nombre}
                            </span>
                            <Download className="ml-1 size-3" />
                          </Button>
                        )
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}

          <Separator />

          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
            <div className="space-y-1">
              <Label htmlFor="clima-avance">Nuevo avance</Label>
              <Textarea
                id="clima-avance"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Qué se hizo, qué falta, contexto…"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Evidencia (opcional — podés pegar con Ctrl+V)</Label>
                <AdjuntosInput
                  archivos={archivos}
                  onChange={setArchivos}
                  activo={open}
                  disabled={enviando}
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
              <Button size="sm" onClick={guardarAvance} disabled={enviando}>
                {enviando && <Loader2 className="mr-1 size-4 animate-spin" />}
                Guardar avance
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
