"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Camera, Loader2, PackageCheck, PackageOpen, Search, X } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { comprimirImagen } from "@/lib/comprimir-imagen"
import { buscarClientePorCodigo, createMovimientoHeladera } from "@/actions/heladeras"
import {
  HELADERA_FOTO_AYUDA,
  HELADERA_TIPO_LABELS,
  type HeladeraTipoMov,
} from "@/types/heladeras"

const BUCKET = "heladeras"
const MAX_FILE_BYTES = 25 * 1024 * 1024
const OTRA_PATENTE = "__otra__"

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

export function NuevoMovimientoHeladeraDialog({
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
  const [tipo, setTipo] = useState<HeladeraTipoMov>("colocacion")
  const [codCliente, setCodCliente] = useState("")
  const [nombreCliente, setNombreCliente] = useState("")
  const [localidad, setLocalidad] = useState("")
  const [buscando, setBuscando] = useState(false)
  const [codActivo, setCodActivo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [patenteSel, setPatenteSel] = useState("")
  const [patenteOtra, setPatenteOtra] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [files, setFiles] = useState<File[]>([])

  function reset() {
    setFecha(todayISO())
    setTipo("colocacion")
    setCodCliente("")
    setNombreCliente("")
    setLocalidad("")
    setCodActivo("")
    setDescripcion("")
    setPatenteSel("")
    setPatenteOtra("")
    setObservaciones("")
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function buscarCliente() {
    const codigo = Number(codCliente.trim())
    if (!Number.isFinite(codigo) || codigo <= 0) {
      toast.error("Escribí el código de cliente")
      return
    }
    setBuscando(true)
    try {
      const res = await buscarClientePorCodigo(codigo)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      if (!res.data) {
        toast.warning("No encontramos ese código. Escribí el nombre del cliente a mano.")
        return
      }
      setNombreCliente(res.data.nombre_cliente ?? "")
      setLocalidad(res.data.localidad ?? "")
    } finally {
      setBuscando(false)
    }
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

  async function uploadFiles(movimientoId: string) {
    const supabase = createClient()
    const uploaded: { storage_path: string; mime_type: string; tamano_bytes: number }[] = []
    for (const raw of files) {
      const file = await comprimirImagen(raw)
      const path = `${movimientoId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
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
    const codigo = Number(codCliente.trim())
    const patente = patenteSel === OTRA_PATENTE ? patenteOtra.trim() : patenteSel
    if (!fecha) return toast.error("Seleccioná la fecha")
    if (!Number.isFinite(codigo) || codigo <= 0) return toast.error("Escribí el código de cliente")
    // La foto es el registro: sin foto no hay evidencia de dónde quedó la heladera.
    if (files.length === 0) return toast.error("Sacá al menos una foto de la heladera")

    startTransition(async () => {
      try {
        const res = await createMovimientoHeladera({
          fecha,
          hora: null,
          tipo,
          id_cliente: codigo,
          nombre_cliente: nombreCliente || null,
          localidad: localidad || null,
          cod_activo: codActivo || null,
          descripcion: descripcion || null,
          patente: patente || null,
          observaciones: observaciones || null,
        })
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        const movimientoId = res.data.id
        const uploaded = await uploadFiles(movimientoId)
        const supabase = createClient()
        const rows = uploaded.map((u) => ({
          movimiento_id: movimientoId,
          storage_path: u.storage_path,
          mime_type: u.mime_type,
          "tamaño_bytes": u.tamano_bytes,
        }))
        const { error } = await supabase.from("heladeras_movimientos_adjuntos").insert(rows)
        if (error) {
          await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.storage_path))
          toast.error(`Error registrando las fotos: ${error.message}`)
          return
        }
        toast.success(tipo === "colocacion" ? "Heladera colocada registrada" : "Retiro de heladera registrado")
        reset()
        onOpenChange(false)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar movimiento de heladera</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo: lo primero que decide el chofer */}
          <div className="space-y-2">
            <Label>¿Qué hiciste con la heladera? *</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["colocacion", "retiro"] as HeladeraTipoMov[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors",
                    tipo === t
                      ? t === "colocacion"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-amber-500 bg-amber-50"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  {t === "colocacion" ? (
                    <PackageCheck className="size-5 shrink-0 text-emerald-600" />
                  ) : (
                    <PackageOpen className="size-5 shrink-0 text-amber-600" />
                  )}
                  <span className="text-sm font-medium">{HELADERA_TIPO_LABELS[t]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cliente */}
          <div className="space-y-2">
            <Label>Código de cliente *</Label>
            <div className="flex gap-2">
              <Input
                value={codCliente}
                onChange={(e) => setCodCliente(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void buscarCliente()
                  }
                }}
                placeholder="Ej: 10351"
                inputMode="numeric"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={buscarCliente} disabled={buscando}>
                {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                <span className="ml-2 hidden sm:inline">Buscar</span>
              </Button>
            </div>
            <Input
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              placeholder="Nombre del cliente (se completa solo al buscar)"
            />
            <Input
              value={localidad}
              onChange={(e) => setLocalidad(e.target.value)}
              placeholder="Localidad (opcional)"
            />
          </div>

          {/* Datos de la heladera */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Nº de activo de la heladera</Label>
              <Input
                value={codActivo}
                onChange={(e) => setCodActivo(e.target.value)}
                placeholder="El de la chapita (opcional)"
              />
            </div>
            <div>
              <Label>Equipo</Label>
              <Input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Marca / modelo / puertas (opcional)"
              />
            </div>
          </div>

          {/* Fecha / Patente */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Fecha *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Camión</Label>
              <Select value={patenteSel} onValueChange={(v) => setPatenteSel(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar patente" />
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

          {/* Fotos */}
          <div className="space-y-2">
            <Label>Foto de la heladera *</Label>
            <p className="text-xs text-muted-foreground">{HELADERA_FOTO_AYUDA[tipo]}</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
              >
                <Camera className="mr-2 size-4" />
                Sacar / adjuntar foto
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                capture="environment"
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

          {/* Observaciones */}
          <div>
            <Label>Observaciones</Label>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              placeholder="Estado del equipo, quién lo recibió, motivo del retiro…"
            />
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
              {isPending ? "Registrando…" : "Registrar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
