"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  CheckCircle2,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  agregarAvancePlan,
  eliminarAvancePlan,
  getAvancePlanSignedUrl,
  listarAvancesPlan,
  type PlanAvanceConAutor,
} from "@/actions/plan-avances"
import { ESTADO_PLAN_COLORS, ESTADO_PLAN_LABELS } from "@/lib/constants"
import type { EstadoPlan } from "@/types/database"

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp"]
function esImagen(mime: string | null, nombre: string | null): boolean {
  if (mime?.startsWith("image/")) return true
  if (!nombre) return false
  const ext = nombre.split(".").pop()?.toLowerCase() ?? ""
  return IMAGE_EXTS.includes(ext)
}

function initials(name: string | null | undefined): string {
  if (!name) return "??"
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function formatBytes(b: number | null): string {
  if (!b || b <= 0) return ""
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

interface Props {
  planId: string
  avancesIniciales: PlanAvanceConAutor[]
  estadoActual: EstadoPlan
  puedeIntervenir: boolean
}

export function AvancesSection({
  planId,
  avancesIniciales,
  estadoActual,
  puedeIntervenir,
}: Props) {
  const [avances, setAvances] = useState(avancesIniciales)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, startSubmit] = useTransition()
  const [comentario, setComentario] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [cerrarPlan, setCerrarPlan] = useState(false)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [lightbox, setLightbox] = useState<{
    url: string
    titulo: string
  } | null>(null)

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
        const r = await getAvancePlanSignedUrl(a.archivo_path)
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

  useEffect(() => {
    if (!dialogOpen) return
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return
      const items = Array.from(e.clipboardData.items)
      const img = items.find((it) => it.type.startsWith("image/"))
      if (!img) return
      const blob = img.getAsFile()
      if (!blob) return
      const ext = blob.type.split("/")[1] || "png"
      const file = new File([blob], `captura-${Date.now()}.${ext}`, {
        type: blob.type,
      })
      setArchivo(file)
      toast.success("Captura pegada como archivo")
      e.preventDefault()
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [dialogOpen])

  function resetForm() {
    setComentario("")
    setArchivo(null)
    setCerrarPlan(false)
  }

  async function handleAbrirArchivo(path: string) {
    const r = await getAvancePlanSignedUrl(path)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    window.open(r.data.url, "_blank")
  }

  async function refrescarAvances() {
    const r = await listarAvancesPlan(planId)
    if ("data" in r) setAvances(r.data)
  }

  async function handleSubmit() {
    if (!comentario.trim() && !archivo) {
      toast.error("Adjuntá un archivo o escribí un comentario")
      return
    }
    if (cerrarPlan && !comentario.trim()) {
      toast.error("Para cerrar el plan tenés que escribir un comentario")
      return
    }
    const fd = new FormData()
    fd.append("comentario", comentario.trim())
    if (archivo) fd.append("archivo", archivo)
    if (cerrarPlan) fd.append("nuevo_estado", "completado")
    startSubmit(async () => {
      const r = await agregarAvancePlan(planId, fd)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Avance registrado")
      await refrescarAvances()
      setDialogOpen(false)
      resetForm()
    })
  }

  async function handleEliminar(id: string) {
    if (!confirm("¿Eliminar este avance? No se puede deshacer.")) return
    const r = await eliminarAvancePlan(id)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    toast.success("Avance eliminado")
    setAvances((prev) => prev.filter((a) => a.id !== id))
  }

  const planCerrado = estadoActual === "completado"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Avances ({avances.length})
          </span>
          {puedeIntervenir && !planCerrado && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Cargar avance
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="border-t pt-4">
        {avances.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Sin avances cargados todavía.
            {puedeIntervenir && !planCerrado
              ? ' Usá "Cargar avance" para responder con comentario, archivo o foto.'
              : ""}
          </p>
        ) : (
          <ol className="space-y-4">
            {avances.map((a) => {
              const isImg = esImagen(a.archivo_mime, a.archivo_nombre)
              const thumbUrl = imageUrls[a.id]
              return (
                <li key={a.id} className="flex gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="text-xs">
                      {initials(a.autor_nombre)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {a.autor_nombre ?? "—"}
                      </span>
                      <span>·</span>
                      <span
                        title={format(new Date(a.created_at), "Pp", { locale: es })}
                      >
                        {formatDistanceToNow(new Date(a.created_at), {
                          locale: es,
                          addSuffix: true,
                        })}
                      </span>
                      {a.estado_resultante && (
                        <Badge
                          variant="outline"
                          className="ml-auto text-[10px]"
                          style={{
                            backgroundColor:
                              ESTADO_PLAN_COLORS[a.estado_resultante] + "20",
                            color: ESTADO_PLAN_COLORS[a.estado_resultante],
                            borderColor:
                              ESTADO_PLAN_COLORS[a.estado_resultante] + "40",
                          }}
                        >
                          {a.estado_resultante === "completado" && (
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                          )}
                          {ESTADO_PLAN_LABELS[a.estado_resultante] ?? a.estado_resultante}
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEliminar(a.id)}
                        className="text-slate-400 hover:text-red-500"
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
                              setLightbox({
                                url: thumbUrl,
                                titulo: a.archivo_nombre ?? "Imagen",
                              })
                            }
                            className="overflow-hidden rounded-md border border-slate-200 transition-opacity hover:opacity-80"
                            title="Ver imagen"
                          >
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
                            onClick={() => handleAbrirArchivo(a.archivo_path!)}
                          >
                            {isImg ? (
                              <ImageIcon className="h-3.5 w-3.5" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" />
                            )}
                            {a.archivo_nombre ?? "Descargar archivo"}
                            <Download className="ml-1 h-3 w-3" />
                          </Button>
                        )}
                        {isImg && thumbUrl && (
                          <div className="text-xs text-slate-500">
                            <p className="truncate">{a.archivo_nombre}</p>
                            <p>{formatBytes(a.archivo_bytes)}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) resetForm()
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargar avance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="avance-comentario">
                Comentario {cerrarPlan && <span className="text-red-500">*</span>}
              </Label>
              <Textarea
                id="avance-comentario"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Qué se hizo, qué falta, contexto…"
                rows={4}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Archivo o foto (opcional — podés pegar con Ctrl+V)</Label>
              {archivo ? (
                <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
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
                <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 py-4 text-sm text-slate-500 hover:bg-slate-100">
                  <Upload className="h-4 w-4" />
                  Elegí un archivo o pegá una captura
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
            {!planCerrado && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={cerrarPlan}
                  onCheckedChange={(c) => setCerrarPlan(c === true)}
                />
                <span>Cerrar el plan con este avance (estado = Completado)</span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setDialogOpen(false)
                resetForm()
              }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Guardar avance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </Card>
  )
}
