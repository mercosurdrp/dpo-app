"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Paperclip, X } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { createComunicacion } from "@/actions/portal-comunicaciones"
import {
  COMUNICACION_CATEGORIA_LABELS,
  COMUNICACION_CATEGORIA_ORDEN,
  COMUNICACION_PRIORIDAD_LABELS,
  type ComunicacionCategoria,
  type ComunicacionPrioridad,
} from "@/types/database"

const BUCKET = "portal-comunicaciones"
const MAX_FILE_BYTES = 25 * 1024 * 1024
const PRIORIDADES: ComunicacionPrioridad[] = ["baja", "media", "alta"]

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120)
}

export function NuevaComunicacionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [titulo, setTitulo] = useState("")
  const [cuerpo, setCuerpo] = useState("")
  const [categoria, setCategoria] = useState<ComunicacionCategoria>("rrhh")
  const [prioridad, setPrioridad] = useState<ComunicacionPrioridad>("media")
  const [files, setFiles] = useState<File[]>([])

  function reset() {
    setTitulo("")
    setCuerpo("")
    setCategoria("rrhh")
    setPrioridad("media")
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleFilesPick(picked: FileList | null) {
    if (!picked) return
    const validos: File[] = []
    for (const f of Array.from(picked)) {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`"${f.name}" supera 25MB`)
        continue
      }
      validos.push(f)
    }
    setFiles((prev) => [...prev, ...validos])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function uploadFiles(comunicacionId: string) {
    if (files.length === 0) return []
    const supabase = createClient()
    const uploaded: { storage_path: string; nombre_original: string; mime_type: string; tamano: number }[] = []
    for (const file of files) {
      const path = `${comunicacionId}/${crypto.randomUUID()}-${sanitizeFileName(file.name || "archivo")}`
      const mime = file.type || "application/octet-stream"
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: mime,
        upsert: false,
      })
      if (error) {
        if (uploaded.length > 0) {
          await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.storage_path))
        }
        throw new Error(`"${file.name}": ${error.message}`)
      }
      uploaded.push({ storage_path: path, nombre_original: file.name || "archivo", mime_type: mime, tamano: file.size })
    }
    return uploaded
  }

  function handleSubmit() {
    if (!titulo.trim()) {
      toast.error("Indicá un asunto")
      return
    }
    if (!cuerpo.trim()) {
      toast.error("Escribí el mensaje")
      return
    }

    startTransition(async () => {
      try {
        const res = await createComunicacion({ titulo, cuerpo, categoria, prioridad })
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        if (files.length > 0) {
          const uploaded = await uploadFiles(res.data.id)
          const supabase = createClient()
          const rows = uploaded.map((a) => ({
            comunicacion_id: res.data.id,
            storage_path: a.storage_path,
            nombre_original: a.nombre_original,
            mime_type: a.mime_type,
            "tamaño_bytes": a.tamano,
          }))
          const { error } = await supabase.from("comunicacion_adjuntos").insert(rows)
          if (error) {
            await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.storage_path))
            toast.error(`Error subiendo adjuntos: ${error.message}`)
            return
          }
        }
        toast.success(`Comunicación #${res.data.numero} enviada`)
        reset()
        onOpenChange(false)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al enviar")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva comunicación</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Categoría *</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria((v ?? "rrhh") as ComunicacionCategoria)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMUNICACION_CATEGORIA_ORDEN.map((c) => (
                    <SelectItem key={c} value={c}>
                      {COMUNICACION_CATEGORIA_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad((v ?? "media") as ComunicacionPrioridad)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {COMUNICACION_PRIORIDAD_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Asunto *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Tema de la comunicación" />
          </div>

          <div>
            <Label>Mensaje *</Label>
            <Textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={6} placeholder="Contanos lo que necesitás comunicar..." />
          </div>

          <div className="space-y-2">
            <Label>Adjuntos (opcional, máx 25MB c/u)</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
                <Paperclip className="mr-2 size-4" />
                Agregar archivos
              </Button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFilesPick(e.target.files)} />
              <span className="text-xs text-muted-foreground">
                {files.length} archivo{files.length === 1 ? "" : "s"}
              </span>
            </div>
            {files.length > 0 && (
              <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-sm">
                {files.map((f, idx) => (
                  <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Quitar archivo"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
