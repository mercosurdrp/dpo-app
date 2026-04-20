"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Shield,
  FileText,
  Image as ImageIcon,
  Mic,
  Video,
  Paperclip,
  Download,
  Trash2,
  User,
  Calendar,
  MapPin,
  Plus,
  ExternalLink,
  CheckCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  actualizarEstado,
  subirAdjuntoTratamiento,
  eliminarAdjunto,
  crearPlanAccionDenuncia,
} from "@/actions/linea-etica"
import {
  LINEA_ETICA_ESTADO_COLORS,
  LINEA_ETICA_ESTADO_LABELS,
  LINEA_ETICA_TIPO_LABELS,
  REPORTE_SEGURIDAD_AREA_LABELS,
  REPORTE_SEGURIDAD_LOCALIDAD_LABELS,
  type DenunciaLineaEticaDetalle,
  type LineaEticaEstado,
} from "@/types/database"

const ESTADOS: LineaEticaEstado[] = [
  "nueva",
  "en_revision",
  "en_tratamiento",
  "cerrada",
]

const PRIORIDADES = ["baja", "media", "alta", "critica"] as const

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function iconForMime(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon
  if (mime.startsWith("audio/")) return Mic
  if (mime.startsWith("video/")) return Video
  return FileText
}

export function DenunciaDetalleClient({
  denuncia,
}: {
  denuncia: DenunciaLineaEticaDetalle
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [estado, setEstado] = useState<LineaEticaEstado>(denuncia.estado)
  const [resumen, setResumen] = useState<string>(
    denuncia.resumen_tratamiento ?? ""
  )

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [planDesc, setPlanDesc] = useState("")
  const [planResponsable, setPlanResponsable] = useState("")
  const [planFecha, setPlanFecha] = useState("")
  const [planPrioridad, setPlanPrioridad] =
    useState<(typeof PRIORIDADES)[number]>("alta")

  const adjuntosDenuncia = denuncia.adjuntos.filter((a) => a.origen === "denuncia")
  const adjuntosTratamiento = denuncia.adjuntos.filter(
    (a) => a.origen === "tratamiento"
  )

  function handleGuardarEstado() {
    startTransition(async () => {
      const res = await actualizarEstado({
        id: denuncia.id,
        estado,
        resumen_tratamiento: resumen || null,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Estado actualizado")
      router.refresh()
    })
  }

  function handleUploadTratamiento(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    const fd = new FormData()
    fd.append("denuncia_id", denuncia.id)
    fd.append("file", file)
    startTransition(async () => {
      const res = await subirAdjuntoTratamiento(fd)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Evidencia adjuntada")
      if (fileInputRef.current) fileInputRef.current.value = ""
      router.refresh()
    })
  }

  function handleDeleteAdjunto(id: string) {
    if (!confirm("¿Eliminar este adjunto?")) return
    startTransition(async () => {
      const res = await eliminarAdjunto(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Adjunto eliminado")
      router.refresh()
    })
  }

  function handleCrearPlan() {
    if (!planDesc.trim() || !planResponsable.trim()) {
      toast.error("Descripción y responsable son obligatorios")
      return
    }
    startTransition(async () => {
      const res = await crearPlanAccionDenuncia({
        denuncia_id: denuncia.id,
        descripcion: planDesc,
        responsable: planResponsable,
        fecha_limite: planFecha || null,
        prioridad: planPrioridad,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Plan de acción creado")
      setPlanOpen(false)
      setPlanDesc("")
      setPlanResponsable("")
      setPlanFecha("")
      setPlanPrioridad("alta")
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <CardContent className="py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Shield className="size-5 text-slate-900" />
                <Badge
                  style={{
                    backgroundColor: LINEA_ETICA_ESTADO_COLORS[denuncia.estado],
                    color: "white",
                  }}
                >
                  {LINEA_ETICA_ESTADO_LABELS[denuncia.estado]}
                </Badge>
                <Badge variant="outline" className="text-sm">
                  {LINEA_ETICA_TIPO_LABELS[denuncia.tipo]}
                </Badge>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">
                {denuncia.descripcion}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3" />
                  Recibida: {formatDateTime(denuncia.created_at)}
                </span>
                {denuncia.fecha_hecho && (
                  <span>
                    Fecha del hecho:{" "}
                    {new Date(denuncia.fecha_hecho).toLocaleDateString("es-AR")}
                  </span>
                )}
                {denuncia.lugar && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {denuncia.lugar}
                  </span>
                )}
                {denuncia.localidad && (
                  <span>
                    {REPORTE_SEGURIDAD_LOCALIDAD_LABELS[denuncia.localidad]}
                  </span>
                )}
                {denuncia.area && (
                  <span>{REPORTE_SEGURIDAD_AREA_LABELS[denuncia.area]}</span>
                )}
              </div>
            </div>
          </div>

          {denuncia.identificarse && (
            <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="size-4 text-slate-700" />
                <span className="font-semibold text-slate-900">
                  El denunciante se identificó
                </span>
              </div>
              <p className="mt-1 text-slate-700">
                <span className="font-medium">Nombre:</span>{" "}
                {denuncia.denunciante_nombre || "—"}
              </p>
              {denuncia.denunciante_contacto && (
                <p className="text-slate-700">
                  <span className="font-medium">Contacto:</span>{" "}
                  {denuncia.denunciante_contacto}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjuntos de la denuncia */}
      {adjuntosDenuncia.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Evidencia aportada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {adjuntosDenuncia.map((a) => {
              const Icon = iconForMime(a.mime_type)
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-md border p-2"
                >
                  <Icon className="size-5 text-slate-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {a.storage_path.split("/").pop()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(a.tamaño_bytes / 1024).toFixed(0)} KB · {a.mime_type}
                    </p>
                  </div>
                  {a.mime_type.startsWith("image/") ? (
                    <a href={a.url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="size-4" />
                      </Button>
                    </a>
                  ) : (
                    <a href={a.url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline">
                        <Download className="size-4" />
                      </Button>
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteAdjunto(a.id)}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Tratamiento */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tratamiento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Estado</Label>
              <Select
                value={estado}
                onValueChange={(v) => setEstado((v ?? "nueva") as LineaEticaEstado)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {LINEA_ETICA_ESTADO_LABELS[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Button
                onClick={handleGuardarEstado}
                disabled={isPending}
                className="w-full sm:w-auto"
              >
                {isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>

          <div>
            <Label>Resumen del tratamiento / conclusiones</Label>
            <Textarea
              value={resumen}
              onChange={(e) => setResumen(e.target.value)}
              rows={5}
              placeholder="Investigación realizada, responsables entrevistados, conclusiones, medidas tomadas..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Planes de acción */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Planes de acción</CardTitle>
          <Button size="sm" onClick={() => setPlanOpen(true)}>
            <Plus className="mr-1 size-4" /> Nuevo plan
          </Button>
        </CardHeader>
        <CardContent>
          {denuncia.planes.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Sin planes de acción vinculados todavía.
            </p>
          ) : (
            <div className="space-y-2">
              {denuncia.planes.map((p) => (
                <Link
                  key={p.id}
                  href={`/planes`}
                  className="block rounded-md border p-3 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {p.descripcion}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Resp: {p.responsable} ·{" "}
                        {p.fecha_limite
                          ? `Vence ${new Date(p.fecha_limite).toLocaleDateString(
                              "es-AR"
                            )}`
                          : "Sin fecha"}{" "}
                        · Progreso {p.progreso}%
                      </p>
                    </div>
                    <Badge
                      variant={
                        p.estado === "completado" ? "secondary" : "outline"
                      }
                    >
                      {p.estado}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evidencia de tratamiento */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Evidencia de tratamiento</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
          >
            <Paperclip className="mr-1 size-4" /> Adjuntar
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleUploadTratamiento(e.target.files)}
          />
        </CardHeader>
        <CardContent>
          {adjuntosTratamiento.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Sin evidencia de tratamiento cargada.
            </p>
          ) : (
            <div className="space-y-2">
              {adjuntosTratamiento.map((a) => {
                const Icon = iconForMime(a.mime_type)
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-md border p-2"
                  >
                    <Icon className="size-5 text-slate-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {a.storage_path.split("/").pop()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(a.created_at)} ·{" "}
                        {(a.tamaño_bytes / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <a href={a.url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline">
                        <Download className="size-4" />
                      </Button>
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteAdjunto(a.id)}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {denuncia.estado === "cerrada" && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-3">
            <p className="flex items-center gap-2 text-sm text-green-800">
              <CheckCircle className="size-4" />
              Denuncia cerrada
              {denuncia.cerrada_at &&
                ` el ${formatDateTime(denuncia.cerrada_at)}`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialog nuevo plan */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo plan de acción</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Descripción *</Label>
              <Textarea
                value={planDesc}
                onChange={(e) => setPlanDesc(e.target.value)}
                rows={3}
                placeholder="Qué se va a hacer"
              />
            </div>
            <div>
              <Label>Responsable *</Label>
              <Input
                value={planResponsable}
                onChange={(e) => setPlanResponsable(e.target.value)}
                placeholder="Nombre de la persona"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha límite</Label>
                <Input
                  type="date"
                  value={planFecha}
                  onChange={(e) => setPlanFecha(e.target.value)}
                />
              </div>
              <div>
                <Label>Prioridad</Label>
                <Select
                  value={planPrioridad}
                  onValueChange={(v) =>
                    setPlanPrioridad(
                      (v ?? "alta") as (typeof PRIORIDADES)[number]
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORIDADES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p[0].toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setPlanOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button onClick={handleCrearPlan} disabled={isPending}>
                {isPending ? "Creando..." : "Crear plan"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
