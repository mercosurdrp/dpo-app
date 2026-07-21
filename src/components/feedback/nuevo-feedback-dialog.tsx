"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Paperclip, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { comprimirImagen } from "@/lib/comprimir-imagen"
import { createFeedback } from "@/actions/feedback-empleados"
import {
  CATEGORIA_LABEL,
  CRITICIDAD_LABEL,
  type FeedbackCategoria,
  type FeedbackCriticidad,
  type UploadedFeedbackFoto,
} from "@/types/feedback-empleados"

const BUCKET = "feedback-empleados"
const MAX_FILE_BYTES = 25 * 1024 * 1024

const CATEGORIAS: FeedbackCategoria[] = ["seguridad", "cliente", "vehiculo", "proceso", "otro"]
const CRITICIDADES: FeedbackCriticidad[] = ["alta", "media", "baja"]

/** Ayuda concreta por categoría: sin esto la gente escribe "estuvo mal" y el
 * tema no es accionable en la matinal. */
const AYUDA: Record<FeedbackCategoria, string> = {
  seguridad: "Un riesgo en el PDV, en la ruta o en el CD (piso, acceso, maniobra, agresión).",
  cliente: "Un problema con un cliente o con la recepción de la mercadería.",
  vehiculo: "Algo del camión, autoelevador o equipamiento.",
  proceso: "Carga, ruteo, liquidación, sistema o documentación.",
  otro: "Cualquier otra cosa que quieras plantear.",
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
}

export function NuevoFeedbackDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated?: () => void
}) {
  const [fecha, setFecha] = useState(todayISO())
  const [categoria, setCategoria] = useState<FeedbackCategoria>("proceso")
  const [criticidad, setCriticidad] = useState<FeedbackCriticidad>("media")
  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFecha(todayISO())
    setCategoria("proceso")
    setCriticidad("media")
    setTitulo("")
    setDescripcion("")
    setFiles([])
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const nuevos = Array.from(e.target.files ?? [])
    const validos: File[] = []
    for (const f of nuevos) {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`"${f.name}" supera los 25 MB.`)
        continue
      }
      validos.push(f)
    }
    setFiles((prev) => [...prev, ...validos])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  /** Se sube al bucket desde el cliente (evita el límite de body de Vercel) y
   * recién después se guardan los paths con la server action. */
  async function subirFotos(): Promise<UploadedFeedbackFoto[]> {
    if (files.length === 0) return []
    const supabase = createClient()
    const subidas: UploadedFeedbackFoto[] = []
    for (const raw of files) {
      const file = await comprimirImagen(raw)
      const path = `${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
      const mime = file.type || "application/octet-stream"
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: mime, upsert: false })
      if (error) {
        if (subidas.length > 0) {
          await supabase.storage.from(BUCKET).remove(subidas.map((s) => s.storage_path))
        }
        throw new Error(`"${raw.name}": ${error.message}`)
      }
      subidas.push({
        storage_path: path,
        nombre_original: file.name,
        mime_type: mime,
        tamaño_bytes: file.size,
      })
    }
    return subidas
  }

  function handleSubmit() {
    if (!titulo.trim()) return toast.error("Contá en una línea de qué se trata.")
    if (!descripcion.trim()) return toast.error("Escribí un poco más de detalle.")

    startTransition(async () => {
      try {
        const fotos = await subirFotos()
        const res = await createFeedback(
          { fecha, categoria, criticidad, titulo, descripcion },
          fotos
        )
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        reset()
        onOpenChange(false)
        onCreated?.()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo enviar el feedback.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar feedback</DialogTitle>
          <DialogDescription>
            Se trata en la matinal del día siguiente. Queda con tu nombre, así te
            podemos responder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fb-fecha">¿Cuándo pasó?</Label>
              <Input
                id="fb-fecha"
                type="date"
                value={fecha}
                max={todayISO()}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>¿Qué tan urgente es?</Label>
              <Select
                value={criticidad}
                onValueChange={(v) => setCriticidad(v as FeedbackCriticidad)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRITICIDADES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CRITICIDAD_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>¿De qué se trata?</Label>
            <Select
              value={categoria}
              onValueChange={(v) => setCategoria(v as FeedbackCategoria)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORIA_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{AYUDA[categoria]}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fb-titulo">En una línea</Label>
            <Input
              id="fb-titulo"
              placeholder="Ej: El acceso al depósito del cliente está roto"
              value={titulo}
              maxLength={140}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fb-desc">Contanos qué pasó</Label>
            <Textarea
              id="fb-desc"
              rows={5}
              placeholder="Qué pasó, dónde y qué creés que se podría hacer."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
              Agregar foto
            </Button>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded-md border px-2 py-1 text-sm"
                  >
                    <span className="truncate">{f.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-4 text-red-500" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
