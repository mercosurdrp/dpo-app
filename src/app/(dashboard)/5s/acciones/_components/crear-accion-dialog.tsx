"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Paperclip } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient as createBrowserSupabase } from "@/lib/supabase/client"
import { crearAccion } from "@/actions/s5-acciones"
import {
  S5_TIPO_LABELS,
  type S5SectorAlmacen,
  type S5Tipo,
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

interface Props {
  tipo: S5Tipo
  open: boolean
  onOpenChange: (open: boolean) => void
  responsables: { id: string; nombre: string; email: string }[]
  vehiculos: { id: string; dominio: string }[]
  sectoresAlmacen?: S5SectorAlmacen[]
  onSaved: () => void
}

const SECTORES_FALLBACK: S5SectorAlmacen[] = [1, 2, 3, 4].map((n) => ({
  numero: n,
  nombre: `Sector ${n}`,
  updated_at: "",
  updated_by: null,
}))

export function CrearAccionDialog({
  tipo,
  open,
  onOpenChange,
  responsables,
  vehiculos,
  sectoresAlmacen,
  onSaved,
}: Props) {
  const sectoresOpts = (sectoresAlmacen?.length
    ? sectoresAlmacen
    : SECTORES_FALLBACK
  )
    .slice()
    .sort((a, b) => a.numero - b.numero)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [sectorNumero, setSectorNumero] = useState<string>("1")
  const [vehiculoId, setVehiculoId] = useState<string>("none")
  const [descripcion, setDescripcion] = useState("")
  const [responsableId, setResponsableId] = useState<string>("")
  const [fechaCompromiso, setFechaCompromiso] = useState<string>("")
  const [comentarioInicial, setComentarioInicial] = useState("")
  const [fileInicial, setFileInicial] = useState<File | null>(null)

  function reset() {
    setError(null)
    setSectorNumero("1")
    setVehiculoId("none")
    setDescripcion("")
    setResponsableId("")
    setFechaCompromiso("")
    setComentarioInicial("")
    setFileInicial(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!descripcion.trim()) {
      setError("La descripción es obligatoria.")
      return
    }
    if (!responsableId) {
      setError("Asigná un responsable.")
      return
    }
    if (fileInicial && fileInicial.size > MAX_BYTES) {
      setError("El archivo inicial supera 15MB.")
      return
    }

    startTransition(async () => {
      // Generamos el id client-side para usarlo como folder del archivo.
      const accionId = crypto.randomUUID()

      let archivoPath: string | null = null
      let archivoNombre: string | null = null
      let archivoMime: string | null = null
      let archivoBytes: number | null = null

      if (fileInicial) {
        const supabase = createBrowserSupabase()
        const safe = sanitizeFileName(fileInicial.name || "estado-inicial")
        const path = `acciones/${accionId}/${crypto.randomUUID()}-${safe}`
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, fileInicial, {
            contentType: fileInicial.type || "application/octet-stream",
            upsert: false,
          })
        if (upErr) {
          setError(`Error subiendo archivo: ${upErr.message}`)
          return
        }
        archivoPath = path
        archivoNombre = fileInicial.name
        archivoMime = fileInicial.type || null
        archivoBytes = fileInicial.size
      }

      const res = await crearAccion({
        id: accionId,
        tipo,
        sectorNumero:
          tipo === "almacen" ? parseInt(sectorNumero, 10) : null,
        vehiculoId:
          tipo === "flota" && vehiculoId !== "none" ? vehiculoId : null,
        descripcion: descripcion.trim(),
        responsableId,
        fechaCompromiso: fechaCompromiso || null,
        evidenciaInicialComentario: comentarioInicial.trim() || null,
        evidenciaInicialArchivoPath: archivoPath,
        evidenciaInicialArchivoNombre: archivoNombre,
        evidenciaInicialArchivoMime: archivoMime,
        evidenciaInicialArchivoBytes: archivoBytes,
      })
      if ("error" in res) {
        setError(res.error)
        return
      }
      toast.success("Acción creada")
      reset()
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Nueva acción 5S — {S5_TIPO_LABELS[tipo]}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {tipo === "almacen" ? (
            <div>
              <Label className="mb-1.5">Sector</Label>
              <Select
                value={sectorNumero}
                onValueChange={(v) => v && setSectorNumero(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sectoresOpts.map((s) => (
                    <SelectItem key={s.numero} value={String(s.numero)}>
                      {s.nombre || `Sector ${s.numero}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label className="mb-1.5">Vehículo (opcional)</Label>
              <Select
                value={vehiculoId}
                onValueChange={(v) => v && setVehiculoId(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin vehículo</SelectItem>
                  {vehiculos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.dominio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1.5">Descripción</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="¿Qué hay que hacer?"
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5">Responsable</Label>
              <Select
                value={responsableId}
                onValueChange={(v) => v && setResponsableId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir..." />
                </SelectTrigger>
                <SelectContent>
                  {responsables.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5">Fecha de compromiso</Label>
              <Input
                type="date"
                value={fechaCompromiso}
                onChange={(e) => setFechaCompromiso(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Estado inicial (opcional)
              </h3>
              <p className="text-xs text-muted-foreground">
                Foto + comentario para registrar cómo está la situación
                antes de empezar. Se guarda como primera fila del historial
                de evidencia.
              </p>
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Comentario inicial</Label>
              <Textarea
                value={comentarioInicial}
                onChange={(e) => setComentarioInicial(e.target.value)}
                rows={2}
                placeholder="¿Cómo está hoy?"
              />
            </div>
            <div>
              <Label className="mb-1.5 text-xs">
                Foto del estado inicial (hasta 15MB)
              </Label>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
                  <Paperclip className="size-3.5" />
                  {fileInicial ? "Cambiar" : "Seleccionar"}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf"
                    onChange={(e) =>
                      setFileInicial(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                {fileInicial && (
                  <span className="text-xs text-muted-foreground">
                    {fileInicial.name} (
                    {(fileInicial.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
