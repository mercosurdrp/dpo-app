"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  User,
  Clock,
  MapPin,
  AlertTriangle,
  Trash2,
  Pencil,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { deleteReporte, getReporte } from "@/actions/reportes-seguridad"
import { NuevoReporteDialog } from "@/components/reportes-seguridad/nuevo-reporte-dialog"
import { PlanAccionSection } from "@/components/reportes-seguridad/plan-accion-section"
import {
  REPORTE_SEGURIDAD_TIPO_LABELS,
  REPORTE_SEGURIDAD_TIPO_COLORS,
  REPORTE_SEGURIDAD_LOCALIDAD_LABELS,
  REPORTE_SEGURIDAD_AREA_LABELS,
  REPORTE_SEGURIDAD_PUESTO_LABELS,
  type ReporteSeguridadDetalle,
  type UserRole,
} from "@/types/database"

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

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export function ReporteDetalleDialog({
  reporteId,
  open,
  onOpenChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  currentProfileId,
  currentRole,
}: {
  reporteId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  currentProfileId: string
  currentRole: UserRole
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [detalle, setDetalle] = useState<ReporteSeguridadDetalle | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const isAdmin = currentRole === "admin"
  const loading = detalle === null

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getReporte(reporteId).then((res) => {
      if (cancelled) return
      if ("error" in res) {
        toast.error(res.error)
      } else {
        setDetalle(res.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, reporteId, refreshKey])

  function handleDelete() {
    if (!detalle) return
    if (!confirm("¿Seguro que querés eliminar este reporte? Esta acción no se puede deshacer.")) {
      return
    }
    startTransition(async () => {
      const res = await deleteReporte(detalle.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Reporte eliminado")
      onOpenChange(false)
      router.refresh()
    })
  }

  const esAccIncid =
    detalle?.tipo === "accidente" || detalle?.tipo === "incidente"

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reporte de seguridad</DialogTitle>
          </DialogHeader>

          {loading ? (
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
                      REPORTE_SEGURIDAD_TIPO_COLORS[detalle.tipo] + "20",
                    color: REPORTE_SEGURIDAD_TIPO_COLORS[detalle.tipo],
                  }}
                >
                  {REPORTE_SEGURIDAD_TIPO_LABELS[detalle.tipo]}
                </Badge>
                {detalle.localidad && (
                  <Badge variant="outline">
                    {REPORTE_SEGURIDAD_LOCALIDAD_LABELS[detalle.localidad]}
                  </Badge>
                )}
                {detalle.area && (
                  <Badge variant="outline">
                    {REPORTE_SEGURIDAD_AREA_LABELS[detalle.area]}
                  </Badge>
                )}
                {esAccIncid && detalle.sif && (
                  <Badge
                    variant="secondary"
                    className="bg-red-100 text-red-700"
                  >
                    <AlertTriangle className="mr-1 size-3" />
                    Potencial SIF
                  </Badge>
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
                  Reportado {formatDateTime(detalle.created_at)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  Ocurrió {formatDate(detalle.fecha)}
                  {detalle.hora ? ` ${detalle.hora.slice(0, 5)}` : ""}
                </span>
                {detalle.lugar && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {detalle.lugar}
                  </span>
                )}
              </div>

              {/* Descripción */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  Descripción / ¿qué pasó?
                </Label>
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                  {detalle.descripcion}
                </p>
              </div>

              {/* Acción tomada */}
              {detalle.accion_tomada && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Acción tomada
                  </Label>
                  <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                    {detalle.accion_tomada}
                  </p>
                </div>
              )}

              {/* Campos específicos */}
              {esAccIncid ? (
                <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Datos del damnificado
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Nombre:</span>{" "}
                      <span>{detalle.damnificado_nombre ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Puesto:</span>{" "}
                      <span>
                        {detalle.damnificado_puesto
                          ? REPORTE_SEGURIDAD_PUESTO_LABELS[
                              detalle.damnificado_puesto
                            ]
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Ubicación:</span>{" "}
                      <span>
                        {detalle.dentro_cd === null || detalle.dentro_cd === undefined
                          ? "—"
                          : detalle.dentro_cd
                            ? "Dentro del CD"
                            : "Fuera del CD"}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Potencial SIF:
                      </span>{" "}
                      <span>
                        {detalle.sif === null || detalle.sif === undefined
                          ? "—"
                          : detalle.sif
                            ? "Sí"
                            : "No"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : detalle.quien_que ? (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    A quién / qué ves
                  </Label>
                  <p className="mt-1 rounded-md bg-muted/40 p-3 text-sm">
                    {detalle.quien_que}
                  </p>
                </div>
              ) : null}

              {/* Adjuntos */}
              {detalle.adjuntos.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Evidencia ({detalle.adjuntos.length})
                  </Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {detalle.adjuntos.map((a) => {
                      const mime = a.mime_type || ""
                      if (mime.startsWith("image/")) {
                        return (
                          <a
                            key={a.id}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block overflow-hidden rounded-md border"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={a.url}
                              alt="Adjunto"
                              className="h-48 w-full object-cover"
                            />
                          </a>
                        )
                      }
                      if (mime.startsWith("video/")) {
                        return (
                          <video
                            key={a.id}
                            src={a.url}
                            controls
                            className="w-full rounded-md border"
                          />
                        )
                      }
                      if (mime.startsWith("audio/")) {
                        return (
                          <audio
                            key={a.id}
                            src={a.url}
                            controls
                            className="w-full"
                          />
                        )
                      }
                      return (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border bg-muted/30 p-3 text-sm text-blue-600 underline"
                        >
                          Ver adjunto ({mime || "archivo"})
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Plan de acción */}
              <PlanAccionSection
                reporteId={detalle.id}
                plan={detalle.plan}
                isAdmin={isAdmin}
                onChanged={() => setRefreshKey((k) => k + 1)}
              />

              {/* Acciones admin */}
              {isAdmin && (
                <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditOpen(true)}
                    disabled={isPending}
                  >
                    <Pencil className="mr-2 size-4" />
                    Editar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isPending}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Eliminar reporte
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {detalle && (
        <NuevoReporteDialog
          open={editOpen}
          onOpenChange={(v) => {
            setEditOpen(v)
            if (!v) setRefreshKey((k) => k + 1)
          }}
          reporte={detalle}
        />
      )}
    </>
  )
}
