"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Send, User, Clock, AlertTriangle } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  addComentario,
  getSugerencia,
  setPrioridad,
  updateEstado,
} from "@/actions/sugerencias"
import {
  SUGERENCIA_ESTADO_LABELS,
  SUGERENCIA_ESTADO_COLORS,
  SUGERENCIA_TIPO_LABELS,
  SUGERENCIA_TIPO_COLORS,
  SUGERENCIA_PRIORIDAD_LABELS,
  SUGERENCIA_PRIORIDAD_COLORS,
  type SugerenciaConAutor,
  type SugerenciaDetalle,
  type SugerenciaComentarioConAutor,
  type SugerenciaEstado,
  type SugerenciaPrioridad,
  type UserRole,
} from "@/types/database"

const ESTADOS_KANBAN: SugerenciaEstado[] = [
  "nuevo",
  "en_analisis",
  "en_desarrollo",
  "en_testeo",
  "ok",
  "rechazado",
]

const PRIORIDADES: SugerenciaPrioridad[] = ["baja", "media", "alta"]

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SugerenciaDetalleDialog({
  sugerencia,
  open,
  onOpenChange,
  currentProfileId,
  currentRole,
}: {
  sugerencia: SugerenciaConAutor
  open: boolean
  onOpenChange: (v: boolean) => void
  currentProfileId: string
  currentRole: UserRole
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [detalle, setDetalle] = useState<SugerenciaDetalle | null>(null)
  const [nuevoComentario, setNuevoComentario] = useState("")
  const [motivoRechazo, setMotivoRechazo] = useState("")
  const [estadoSeleccionado, setEstadoSeleccionado] =
    useState<SugerenciaEstado | null>(null)

  const isAdmin = currentRole === "admin"
  const isAutor = sugerencia.creado_por === currentProfileId
  const loadingDetalle = detalle === null

  useEffect(() => {
    if (!open) return

    let cancelled = false
    getSugerencia(sugerencia.id).then((res) => {
      if (cancelled) return
      if ("error" in res) {
        toast.error(res.error)
      } else {
        setDetalle(res.data)
        setEstadoSeleccionado(res.data.estado)
      }
    })

    return () => {
      cancelled = true
    }
  }, [open, sugerencia.id])

  function puedeMoverEstado(nuevo: SugerenciaEstado): boolean {
    if (isAdmin) return true
    if (!detalle) return false
    if (isAutor && detalle.estado === "en_testeo" && nuevo === "ok") return true
    return false
  }

  function handleEstadoChange(nuevo: SugerenciaEstado) {
    if (!detalle) return
    if (!puedeMoverEstado(nuevo)) {
      toast.error("No tenés permisos para ese cambio de estado.")
      return
    }

    if (nuevo === "rechazado" && !motivoRechazo.trim()) {
      toast.error("Ingresá un motivo de rechazo antes de aplicar.")
      return
    }

    startTransition(async () => {
      const res = await updateEstado(
        detalle.id,
        nuevo,
        nuevo === "rechazado" ? motivoRechazo : undefined
      )
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Estado → ${SUGERENCIA_ESTADO_LABELS[nuevo]}`)
      setDetalle({ ...detalle, estado: nuevo, motivo_rechazo: res.data.motivo_rechazo })
      setEstadoSeleccionado(nuevo)
      router.refresh()
    })
  }

  function handlePrioridadChange(prioridad: SugerenciaPrioridad) {
    if (!detalle || !isAdmin) return
    startTransition(async () => {
      const res = await setPrioridad(detalle.id, prioridad)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Prioridad actualizada")
      setDetalle({ ...detalle, prioridad })
      router.refresh()
    })
  }

  function handleAddComentario() {
    if (!detalle) return
    if (!nuevoComentario.trim()) return

    startTransition(async () => {
      const res = await addComentario(detalle.id, nuevoComentario)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      const nuevo: SugerenciaComentarioConAutor = res.data
      setDetalle({
        ...detalle,
        comentarios: [...detalle.comentarios, nuevo],
      })
      setNuevoComentario("")
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{sugerencia.titulo}</DialogTitle>
        </DialogHeader>

        {loadingDetalle ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : !detalle ? (
          <p className="text-sm text-muted-foreground">No se pudo cargar.</p>
        ) : (
          <div className="space-y-4">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                style={{
                  backgroundColor:
                    SUGERENCIA_ESTADO_COLORS[detalle.estado] + "20",
                  color: SUGERENCIA_ESTADO_COLORS[detalle.estado],
                }}
              >
                {SUGERENCIA_ESTADO_LABELS[detalle.estado]}
              </Badge>
              <Badge
                variant="secondary"
                style={{
                  backgroundColor:
                    SUGERENCIA_TIPO_COLORS[detalle.tipo] + "20",
                  color: SUGERENCIA_TIPO_COLORS[detalle.tipo],
                }}
              >
                {SUGERENCIA_TIPO_LABELS[detalle.tipo]}
              </Badge>
              <Badge
                variant="secondary"
                style={{
                  backgroundColor:
                    SUGERENCIA_PRIORIDAD_COLORS[detalle.prioridad] + "20",
                  color: SUGERENCIA_PRIORIDAD_COLORS[detalle.prioridad],
                }}
              >
                Prioridad {SUGERENCIA_PRIORIDAD_LABELS[detalle.prioridad]}
              </Badge>
              {detalle.modulo && (
                <Badge variant="outline">{detalle.modulo}</Badge>
              )}
            </div>

            {/* Autor y fecha */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="size-3" />
                {detalle.autor_nombre}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                Creado {formatDateTime(detalle.created_at)}
              </span>
            </div>

            {/* Descripción */}
            <div>
              <Label className="text-xs text-muted-foreground">Descripción</Label>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                {detalle.descripcion}
              </p>
            </div>

            {/* Motivo rechazo */}
            {detalle.estado === "rechazado" && detalle.motivo_rechazo && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <p className="flex items-center gap-1 text-xs font-semibold text-red-700">
                  <AlertTriangle className="size-3.5" />
                  Motivo de rechazo
                </p>
                <p className="mt-1 text-sm text-red-700 whitespace-pre-wrap">
                  {detalle.motivo_rechazo}
                </p>
              </div>
            )}

            {/* Controles de estado / prioridad */}
            {(isAdmin || isAutor) && (
              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Gestión
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Estado</Label>
                    <Select
                      value={estadoSeleccionado ?? detalle.estado}
                      onValueChange={(v) => {
                        const nuevo = (v ?? detalle.estado) as SugerenciaEstado
                        setEstadoSeleccionado(nuevo)
                        if (nuevo !== "rechazado") {
                          handleEstadoChange(nuevo)
                        }
                      }}
                    >
                      <SelectTrigger className="w-full" disabled={isPending}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS_KANBAN.map((e) => {
                          const allowed =
                            isAdmin ||
                            (isAutor &&
                              detalle.estado === "en_testeo" &&
                              e === "ok") ||
                            e === detalle.estado
                          return (
                            <SelectItem
                              key={e}
                              value={e}
                              disabled={!allowed}
                            >
                              <span
                                className="mr-1 inline-block size-2 rounded-full"
                                style={{
                                  backgroundColor: SUGERENCIA_ESTADO_COLORS[e],
                                }}
                              />
                              {SUGERENCIA_ESTADO_LABELS[e]}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {isAdmin && (
                    <div>
                      <Label className="text-xs">Prioridad</Label>
                      <Select
                        value={detalle.prioridad}
                        onValueChange={(v) =>
                          handlePrioridadChange((v ?? "media") as SugerenciaPrioridad)
                        }
                      >
                        <SelectTrigger className="w-full" disabled={isPending}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORIDADES.map((p) => (
                            <SelectItem key={p} value={p}>
                              <span
                                className="mr-1 inline-block size-2 rounded-full"
                                style={{
                                  backgroundColor: SUGERENCIA_PRIORIDAD_COLORS[p],
                                }}
                              />
                              {SUGERENCIA_PRIORIDAD_LABELS[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Si el estado elegido es rechazado, pedir motivo */}
                {isAdmin && estadoSeleccionado === "rechazado" &&
                  detalle.estado !== "rechazado" && (
                    <div className="space-y-2">
                      <Label className="text-xs">Motivo de rechazo *</Label>
                      <Textarea
                        value={motivoRechazo}
                        onChange={(e) => setMotivoRechazo(e.target.value)}
                        placeholder="Explicá por qué se rechaza esta sugerencia"
                        rows={2}
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending || !motivoRechazo.trim()}
                        onClick={() => handleEstadoChange("rechazado")}
                      >
                        Confirmar rechazo
                      </Button>
                    </div>
                  )}

                {isAutor && !isAdmin && detalle.estado === "en_testeo" && (
                  <p className="text-xs text-muted-foreground">
                    Podés confirmar que está funcionando moviendo el estado a &quot;OK&quot;.
                  </p>
                )}
              </div>
            )}

            {/* Comentarios */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Comentarios ({detalle.comentarios.length})
              </p>

              {detalle.comentarios.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aún no hay comentarios.
                </p>
              )}

              <div className="space-y-2">
                {detalle.comentarios.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border bg-card p-2.5 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-slate-700">
                        {c.autor_nombre}
                      </span>
                      <span>{formatDateTime(c.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{c.texto}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Textarea
                  value={nuevoComentario}
                  onChange={(e) => setNuevoComentario(e.target.value)}
                  placeholder="Escribí un comentario..."
                  rows={2}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  disabled={isPending || !nuevoComentario.trim()}
                  onClick={handleAddComentario}
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
