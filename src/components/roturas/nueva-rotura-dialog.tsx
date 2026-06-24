"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Paperclip, Plus, Trash2, X } from "lucide-react"
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
import { comprimirImagen } from "@/lib/comprimir-imagen"
import { createRotura } from "@/actions/roturas-calle"
import {
  ROTURA_MOTIVO_LABELS,
  ROTURA_TIPO_LABELS,
  type RoturaMotivo,
  type RoturaTipo,
} from "@/types/roturas"

const BUCKET = "roturas-calle"
const MAX_FILE_BYTES = 25 * 1024 * 1024
const OTRA_PATENTE = "__otra__"

const TIPOS: RoturaTipo[] = ["rotura", "faltante"]

const MOTIVOS: RoturaMotivo[] = [
  "manipulacion",
  "transporte",
  "carga_descarga",
  "mal_estado_previo",
  "accidente_vial",
  "otro",
]

interface LineaSku {
  codigo: string
  descripcion: string
  cantidad: string
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

export function NuevaRoturaDialog({
  open,
  onOpenChange,
  patentes,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  patentes: string[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [fecha, setFecha] = useState(todayISO())
  const [patenteSel, setPatenteSel] = useState("")
  const [patenteOtra, setPatenteOtra] = useState("")
  const [tipo, setTipo] = useState<RoturaTipo>("rotura")
  const [motivo, setMotivo] = useState<RoturaMotivo>("manipulacion")
  const [observaciones, setObservaciones] = useState("")
  const [lineas, setLineas] = useState<LineaSku[]>([{ codigo: "", descripcion: "", cantidad: "" }])
  const [files, setFiles] = useState<File[]>([])

  function reset() {
    setFecha(todayISO())
    setPatenteSel("")
    setPatenteOtra("")
    setTipo("rotura")
    setMotivo("manipulacion")
    setObservaciones("")
    setLineas([{ codigo: "", descripcion: "", cantidad: "" }])
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function setLinea(idx: number, patch: Partial<LineaSku>) {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  function addLinea() {
    setLineas((prev) => [...prev, { codigo: "", descripcion: "", cantidad: "" }])
  }
  function removeLinea(idx: number) {
    setLineas((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))
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

  async function uploadFiles(roturaId: string) {
    if (files.length === 0) return []
    const supabase = createClient()
    const uploaded: { storage_path: string; mime_type: string; tamano_bytes: number }[] = []
    for (const raw of files) {
      const file = await comprimirImagen(raw)
      const path = `${roturaId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
      const mime = file.type || "application/octet-stream"
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: mime, upsert: false })
      if (error) {
        if (uploaded.length > 0) {
          await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.storage_path))
        }
        throw new Error(`"${raw.name}": ${error.message}`)
      }
      uploaded.push({ storage_path: path, mime_type: mime, tamano_bytes: file.size })
    }
    return uploaded
  }

  function handleSubmit() {
    const patente = patenteSel === OTRA_PATENTE ? patenteOtra.trim() : patenteSel
    if (!fecha) return toast.error("Seleccioná la fecha")
    if (!patente) return toast.error("Seleccioná o escribí la patente")
    const items = lineas
      .filter((l) => (l.codigo.trim() || l.descripcion.trim()) && Number(l.cantidad) > 0)
      .map((l) => {
        const codigoNum = Number(l.codigo.trim())
        return {
          id_articulo: l.codigo.trim() && Number.isFinite(codigoNum) ? codigoNum : null,
          des_articulo: l.descripcion.trim() || null,
          cantidad: Number(l.cantidad),
        }
      })
    if (items.length === 0)
      return toast.error("Agregá al menos un SKU (código o descripción) con cantidad")

    startTransition(async () => {
      try {
        const res = await createRotura(
          {
            fecha,
            hora: null,
            patente,
            tipo,
            motivo,
            localidad: null,
            observaciones: observaciones || null,
            items,
          },
          [] // las fotos se suben después, bajo el id de la rotura
        )
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        const roturaId = res.data.id
        if (files.length > 0) {
          const uploaded = await uploadFiles(roturaId)
          const supabase = createClient()
          const rows = uploaded.map((u) => ({
            rotura_id: roturaId,
            storage_path: u.storage_path,
            mime_type: u.mime_type,
            "tamaño_bytes": u.tamano_bytes,
          }))
          const { error } = await supabase.from("roturas_calle_adjuntos").insert(rows)
          if (error) {
            await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.storage_path))
            toast.error(`Error registrando fotos: ${error.message}`)
            return
          }
        }
        toast.success(tipo === "faltante" ? "Faltante reportado" : "Rotura reportada")
        reset()
        onOpenChange(false)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al reportar")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reportar rotura o faltante en distribución</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Fecha / Patente */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Fecha *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Patente *</Label>
              <Select value={patenteSel} onValueChange={(v) => setPatenteSel(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {patentes.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTRA_PATENTE}>Otra (escribir)…</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {patenteSel === OTRA_PATENTE && (
            <div>
              <Label>Patente (manual)</Label>
              <Input
                value={patenteOtra}
                onChange={(e) => setPatenteOtra(e.target.value)}
                placeholder="Ej: AB123CD"
              />
            </div>
          )}

          {/* Tipo / Motivo */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as RoturaTipo)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ROTURA_TIPO_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motivo *</Label>
              <Select value={motivo} onValueChange={(v) => setMotivo(v as RoturaMotivo)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {ROTURA_MOTIVO_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Líneas de SKU (carga manual) */}
          <div className="space-y-2">
            <Label>SKU {tipo === "faltante" ? "faltantes" : "rotos"} *</Label>
            <p className="text-xs text-muted-foreground">
              Escribí el código y/o el nombre del producto. El código es opcional.
            </p>
            <div className="space-y-2">
              {lineas.map((linea, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <Input
                      value={linea.codigo}
                      onChange={(e) => setLinea(idx, { codigo: e.target.value })}
                      placeholder="Código (opcional)"
                      inputMode="numeric"
                      className="sm:w-32"
                    />
                    <Input
                      value={linea.descripcion}
                      onChange={(e) => setLinea(idx, { descripcion: e.target.value })}
                      placeholder="Producto / descripción"
                      className="flex-1"
                    />
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={linea.cantidad}
                    onChange={(e) => setLinea(idx, { cantidad: e.target.value })}
                    placeholder="Cant."
                    className="w-24 shrink-0"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLinea(idx)}
                    disabled={lineas.length === 1}
                    aria-label="Quitar SKU"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addLinea} className="gap-2">
              <Plus className="size-4" />
              Agregar SKU
            </Button>
          </div>

          {/* Observaciones */}
          <div>
            <Label>Observaciones</Label>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              placeholder="Detalle de lo ocurrido"
            />
          </div>

          {/* Fotos */}
          <div className="space-y-2">
            <Label>Fotos (se comprimen automáticamente)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
              >
                <Paperclip className="mr-2 size-4" />
                Agregar fotos
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFilesPick(e.target.files)}
              />
              <span className="text-xs text-muted-foreground">
                {files.length} foto{files.length === 1 ? "" : "s"}
              </span>
            </div>
            {files.length > 0 && (
              <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-sm">
                {files.map((f, idx) => (
                  <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Quitar foto"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Reportando…" : "Reportar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
