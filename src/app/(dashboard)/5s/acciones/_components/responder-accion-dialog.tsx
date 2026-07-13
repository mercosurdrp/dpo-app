"use client"

import { abrirArchivo } from "@/lib/abrir-archivo"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { createClient as createBrowserSupabase } from "@/lib/supabase/client"
import { AdjuntosInput } from "@/components/adjuntos-input"
import {
  agregarEvidencia,
  cerrarAccion,
  getAccionDetalle,
  getEvidenciaSignedUrl,
  reabrirAccion,
  type S5AccionEvidenciaConArchivos,
} from "@/actions/s5-acciones"
import type { ArchivoAvance } from "@/lib/adjuntos-avance"
import {
  S5_ACCION_ESTADO_COLORS,
  S5_ACCION_ESTADO_LABELS,
  type S5AccionConMeta,
  type UserRole,
} from "@/types/database"

const BUCKET = "s5-auditorias"
const MAX_BYTES = 15 * 1024 * 1024

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
}

function formatFechaHora(iso: string) {
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, "0")
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const y = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${day}/${m}/${y} ${hh}:${mm}`
}

interface Props {
  accionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId: string
  currentRole: UserRole
  onSaved: () => void
}

export function ResponderAccionDialog({
  accionId,
  open,
  onOpenChange,
  currentUserId,
  currentRole,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [submitting, startSubmit] = useTransition()
  const [closing, startClose] = useTransition()
  const [reopening, startReopen] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [accion, setAccion] = useState<S5AccionConMeta | null>(null)
  const [evidencias, setEvidencias] = useState<S5AccionEvidenciaConArchivos[]>(
    []
  )

  const [comentario, setComentario] = useState("")
  const [archivos, setArchivos] = useState<File[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getAccionDetalle(accionId).then((res) => {
      if (cancelled) return
      if ("error" in res) {
        setError(res.error)
        setLoading(false)
        return
      }
      setAccion(res.data.accion)
      setEvidencias(res.data.evidencias)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, accionId])

  const isAdminOrAuditor =
    currentRole === "admin" || currentRole === "auditor"

  const canAddEvidence =
    accion !== null &&
    accion.estado !== "cerrada" &&
    (accion.responsable_id === currentUserId ||
      accion.creado_por === currentUserId ||
      isAdminOrAuditor)

  const canClose =
    accion !== null &&
    accion.estado !== "cerrada" &&
    evidencias.length > 0 &&
    (accion.responsable_id === currentUserId ||
      accion.creado_por === currentUserId ||
      isAdminOrAuditor)

  const canReopen =
    accion !== null && accion.estado === "cerrada" && isAdminOrAuditor

  async function handleAgregarEvidencia() {
    if (!accion) return
    if (!comentario.trim() && archivos.length === 0) {
      setError("Agregá un comentario o un archivo.")
      return
    }
    const pesado = archivos.find((f) => f.size > MAX_BYTES)
    if (pesado) {
      setError(`El archivo "${pesado.name}" supera 15MB`)
      return
    }
    setError(null)

    startSubmit(async () => {
      const supabase = createBrowserSupabase()
      const subidos: ArchivoAvance[] = []

      for (const file of archivos) {
        const safe = sanitizeFileName(file.name || "evidencia")
        const path = `acciones/${accion.id}/${crypto.randomUUID()}-${safe}`
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          })
        if (upErr) {
          // Limpiar los ya subidos para no dejar huérfanos.
          if (subidos.length > 0) {
            await supabase.storage
              .from(BUCKET)
              .remove(subidos.map((a) => a.path))
          }
          setError(`Error subiendo ${file.name}: ${upErr.message}`)
          return
        }
        subidos.push({
          path,
          nombre: file.name,
          mime: file.type || null,
          bytes: file.size,
        })
      }

      const res = await agregarEvidencia({
        accionId: accion.id,
        comentario: comentario.trim() || null,
        archivos: subidos,
      })
      if ("error" in res) {
        setError(res.error)
        return
      }
      toast.success("Evidencia agregada")

      // Refrescar detalle local
      const refreshed = await getAccionDetalle(accion.id)
      if (!("error" in refreshed)) {
        setAccion(refreshed.data.accion)
        setEvidencias(refreshed.data.evidencias)
      }
      setComentario("")
      setArchivos([])
      onSaved()
    })
  }

  function handleCerrar() {
    if (!accion) return
    startClose(async () => {
      const res = await cerrarAccion(accion.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Acción cerrada")
      onSaved()
      onOpenChange(false)
    })
  }

  function handleReabrir() {
    if (!accion) return
    startReopen(async () => {
      const res = await reabrirAccion(accion.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Acción reabierta")
      onSaved()
      onOpenChange(false)
    })
  }

  async function handleAbrirArchivo(path: string) {
    const res = await getEvidenciaSignedUrl(path)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    abrirArchivo(res.data.url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {accion?.estado === "cerrada" ? "Ver acción" : "Responder acción"}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
            Cargando...
          </div>
        )}

        {!loading && accion && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm">
                  <div className="font-medium text-slate-900">
                    {accion.descripcion}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Responsable: {accion.responsable_nombre ?? "—"} ·
                    Vencimiento: {accion.fecha_compromiso ?? "—"}
                  </div>
                </div>
                <Badge
                  style={{
                    backgroundColor: S5_ACCION_ESTADO_COLORS[accion.estado],
                    color: "white",
                  }}
                >
                  {S5_ACCION_ESTADO_LABELS[accion.estado]}
                </Badge>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Historial de evidencia
              </h3>
              {evidencias.length === 0 ? (
                <p className="rounded border border-dashed py-6 text-center text-xs text-muted-foreground">
                  Todavía no hay evidencia cargada.
                </p>
              ) : (
                <ol className="space-y-2">
                  {evidencias.map((e) => (
                    <li
                      key={e.id}
                      className="rounded border bg-white p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          {e.autor_nombre ?? "—"} ·{" "}
                          {formatFechaHora(e.created_at)}
                        </div>
                      </div>
                      {e.comentario && (
                        <p className="mt-1 whitespace-pre-wrap text-slate-800">
                          {e.comentario}
                        </p>
                      )}
                      {e.archivos.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {e.archivos.map((arch) => (
                            <button
                              key={arch.path}
                              type="button"
                              onClick={() => handleAbrirArchivo(arch.path)}
                              className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-slate-50"
                            >
                              {arch.mime?.startsWith("image/") ? (
                                <ImageIcon className="size-3.5" />
                              ) : (
                                <FileText className="size-3.5" />
                              )}
                              {arch.nombre || "Archivo"}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {canAddEvidence && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Agregar evidencia
                  </h3>
                  <div>
                    <Label className="mb-1.5 text-xs">Comentario</Label>
                    <Textarea
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      rows={3}
                      placeholder="¿Qué se hizo?"
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 text-xs">
                      Archivos (fotos o documentos, hasta 15MB cada uno)
                    </Label>
                    <AdjuntosInput
                      archivos={archivos}
                      onChange={setArchivos}
                      activo={open}
                      disabled={submitting}
                      accept="image/*,application/pdf"
                    />
                  </div>
                </div>
              </>
            )}

            {error && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        )}

        {!loading && accion && (
          <DialogFooter className="gap-2 sm:gap-2">
            {canReopen && (
              <Button
                variant="outline"
                onClick={handleReabrir}
                disabled={reopening}
              >
                {reopening ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 size-4" />
                )}
                Reabrir
              </Button>
            )}
            {canAddEvidence && (
              <Button
                onClick={handleAgregarEvidencia}
                disabled={submitting}
                variant="outline"
              >
                {submitting && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Agregar evidencia
              </Button>
            )}
            {canClose && (
              <Button onClick={handleCerrar} disabled={closing}>
                {closing ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 size-4" />
                )}
                Cerrar acción
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
