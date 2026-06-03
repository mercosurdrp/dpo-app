"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Download,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { abrirArchivo } from "@/lib/abrir-archivo"
import { createClient } from "@/lib/supabase/client"
import {
  addSlaAdjunto,
  deleteSla,
  deleteSlaAdjunto,
  updateSla,
} from "@/actions/sla"
import {
  SLA_ESTADO_LABELS,
  SLA_PILAR_LABELS,
  type SlaConAutor,
  type SlaEstado,
} from "@/types/database"

const BUCKET = "sla"

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120)
}

function formatBytes(b: number | null): string {
  if (!b || b <= 0) return ""
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function SlaDetalleDialog({
  sla,
  canGestionar,
  open,
  onOpenChange,
}: {
  sla: SlaConAutor | null
  canGestionar: boolean
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const [savingMeta, startSaveMeta] = useTransition()
  const [uploading, startUpload] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [borrandoSla, startBorrarSla] = useTransition()

  const [estado, setEstado] = useState<SlaEstado>("pendiente")
  const [fechaFirma, setFechaFirma] = useState("")
  const [fechaVencimiento, setFechaVencimiento] = useState("")
  const [notas, setNotas] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)

  // Sincronizar los campos editables cuando cambia el SLA mostrado.
  useEffect(() => {
    if (!sla) return
    setEstado(sla.estado)
    setFechaFirma(sla.fecha_firma ?? "")
    setFechaVencimiento(sla.fecha_vencimiento ?? "")
    setNotas(sla.notas ?? "")
    setArchivo(null)
  }, [sla?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pegar captura con Ctrl+V (regla global del proyecto).
  useEffect(() => {
    if (!open || !canGestionar) return
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return
      const items = Array.from(e.clipboardData.items)
      const img = items.find((it) => it.type.startsWith("image/"))
      if (!img) return
      const blob = img.getAsFile()
      if (!blob) return
      const ext = blob.type.split("/")[1] || "png"
      const file = new File([blob], `acuerdo-${Date.now()}.${ext}`, {
        type: blob.type,
      })
      setArchivo(file)
      toast.success("Captura pegada como archivo")
      e.preventDefault()
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [open, canGestionar])

  if (!sla) return null

  function handleGuardarMeta() {
    const slaId = sla!.id
    startSaveMeta(async () => {
      const r = await updateSla(slaId, {
        estado,
        fecha_firma: fechaFirma || null,
        fecha_vencimiento: fechaVencimiento || null,
        notas: notas.trim() || null,
      })
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("SLA actualizado")
      router.refresh()
    })
  }

  function handleSubir() {
    if (!archivo) return
    const slaId = sla!.id
    const file = archivo
    startUpload(async () => {
      try {
        const supabase = createClient()
        const safeName = sanitizeFileName(file.name || "acuerdo")
        const path = `${slaId}/${crypto.randomUUID()}-${safeName}`
        const mime = file.type || "application/octet-stream"
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: mime, upsert: false })
        if (error) throw new Error(error.message)

        const r = await addSlaAdjunto(slaId, {
          storage_path: path,
          nombre_original: file.name,
          mime_type: mime,
          tamano_bytes: file.size,
        })
        if ("error" in r) {
          await supabase.storage.from(BUCKET).remove([path])
          throw new Error(r.error)
        }
        toast.success("Acuerdo cargado")
        setArchivo(null)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al subir")
      }
    })
  }

  function handleBorrarSla() {
    const slaId = sla!.id
    const nombre = sla!.nombre
    if (
      !confirm(
        `¿Borrar el SLA "${nombre}"? Se eliminan también sus acuerdos cargados. No se puede deshacer.`,
      )
    )
      return
    startBorrarSla(async () => {
      const r = await deleteSla(slaId)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("SLA borrado")
      onOpenChange(false)
      router.refresh()
    })
  }

  function handleEliminarAdjunto(id: string) {
    if (!confirm("¿Eliminar este acuerdo? No se puede deshacer.")) return
    startDelete(async () => {
      const r = await deleteSlaAdjunto(id)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Acuerdo eliminado")
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">{sla.nombre}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Metadatos del manual */}
          <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <Meta label="Pilar" value={SLA_PILAR_LABELS[sla.pilar]} />
            <Meta label="Requisito" value={sla.requisito_manual || "—"} />
            <Meta label="Cliente" value={sla.parte_cliente || "—"} />
            <Meta label="Proveedor" value={sla.parte_proveedor || "—"} />
          </div>
          {sla.descripcion && (
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {sla.descripcion}
            </p>
          )}

          {/* Acuerdos firmados */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Acuerdos firmados ({sla.adjuntos.length})
            </Label>
            {sla.adjuntos.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
                Todavía no se cargó ningún acuerdo.
              </p>
            ) : (
              <ul className="space-y-2">
                {sla.adjuntos.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => abrirArchivo(a.url, a.nombre_original ?? undefined)}
                      className="flex min-w-0 items-center gap-2 text-left text-blue-700 hover:underline"
                    >
                      <FileText className="size-4 shrink-0" />
                      <span className="truncate">
                        {a.nombre_original ?? "Acuerdo"}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {formatBytes(a.tamaño_bytes)}
                      </span>
                      <Download className="size-3.5 shrink-0 text-slate-400" />
                    </button>
                    {canGestionar && (
                      <button
                        type="button"
                        onClick={() => handleEliminarAdjunto(a.id)}
                        disabled={deleting}
                        className="shrink-0 text-slate-400 hover:text-red-500"
                        title="Eliminar acuerdo"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canGestionar && (
            <>
              {/* Subir acuerdo */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Cargar acuerdo firmado{" "}
                  <span className="font-normal text-slate-500">
                    (PDF o imagen — podés pegar con Ctrl+V)
                  </span>
                </Label>
                {archivo ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <Paperclip className="size-4 shrink-0 text-slate-500" />
                      <span className="truncate">{archivo.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {formatBytes(archivo.size)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="sm" onClick={handleSubir} disabled={uploading}>
                        {uploading && (
                          <Loader2 className="mr-1 size-4 animate-spin" />
                        )}
                        Subir
                      </Button>
                      <button
                        type="button"
                        onClick={() => setArchivo(null)}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 py-4 text-sm text-slate-500 hover:bg-slate-100">
                    <Upload className="size-4" />
                    Elegí un archivo o pegá una captura
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) setArchivo(f)
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Editar estado / fechas / notas */}
              <div className="space-y-3 rounded-md border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Estado</Label>
                    <Select
                      value={estado}
                      onValueChange={(v) => setEstado(v as SlaEstado)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.keys(SLA_ESTADO_LABELS) as SlaEstado[]
                        ).map((e) => (
                          <SelectItem key={e} value={e}>
                            {SLA_ESTADO_LABELS[e]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha de firma</Label>
                    <Input
                      type="date"
                      value={fechaFirma}
                      onChange={(e) => setFechaFirma(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vencimiento</Label>
                    <Input
                      type="date"
                      value={fechaVencimiento}
                      onChange={(e) => setFechaVencimiento(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notas</Label>
                  <Textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    rows={2}
                    placeholder="Observaciones internas sobre este SLA…"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleGuardarMeta}
                    disabled={savingMeta}
                  >
                    {savingMeta && (
                      <Loader2 className="mr-1 size-4 animate-spin" />
                    )}
                    Guardar cambios
                  </Button>
                </div>
              </div>

              {/* Zona de riesgo: borrar el SLA del repositorio */}
              <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3">
                <div className="text-sm text-red-700">
                  <div className="font-semibold">Borrar este SLA</div>
                  <div className="text-xs text-red-600">
                    Lo quita del repositorio junto con sus acuerdos. No se puede deshacer.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBorrarSla}
                  disabled={borrandoSla}
                  className="shrink-0"
                >
                  {borrandoSla ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1 size-4" />
                  )}
                  Borrar SLA
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium text-slate-800">{value}</div>
    </div>
  )
}
