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
import { createReporte } from "@/actions/reportes-seguridad"
import {
  REPORTE_SEGURIDAD_TIPO_LABELS,
  REPORTE_SEGURIDAD_LOCALIDAD_LABELS,
  REPORTE_SEGURIDAD_AREA_LABELS,
  REPORTE_SEGURIDAD_PUESTO_LABELS,
  type ReporteSeguridadTipo,
  type ReporteSeguridadLocalidad,
  type ReporteSeguridadArea,
  type ReporteSeguridadPuesto,
} from "@/types/database"

const TIPOS: ReporteSeguridadTipo[] = [
  "accidente",
  "incidente",
  "acto_inseguro",
  "ruta_riesgo",
  "acto_seguro",
]

const LOCALIDADES: ReporteSeguridadLocalidad[] = [
  "san_nicolas",
  "ramallo",
  "pergamino",
  "colon",
  "otro",
]

const AREAS: ReporteSeguridadArea[] = [
  "deposito",
  "distribucion",
  "ventas",
  "administracion",
]

const PUESTOS: ReporteSeguridadPuesto[] = [
  "ayudante_distribucion",
  "chofer_distribucion",
  "operario_deposito",
  "promotor_ventas",
  "repositor",
  "administracion",
  "mando_medio",
  "otro",
]

const MAX_FILE_BYTES = 10 * 1024 * 1024

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

type DentroCD = "" | "dentro" | "fuera"
type SifValue = "" | "si" | "no"

export function NuevoReporteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [tipo, setTipo] = useState<ReporteSeguridadTipo>("incidente")
  const [fecha, setFecha] = useState<string>(todayISO())
  const [hora, setHora] = useState<string>("")
  const [lugar, setLugar] = useState<string>("")
  const [localidad, setLocalidad] = useState<ReporteSeguridadLocalidad | "">("")
  const [area, setArea] = useState<ReporteSeguridadArea | "">("")
  const [descripcion, setDescripcion] = useState<string>("")
  const [accionTomada, setAccionTomada] = useState<string>("")

  // accidente / incidente
  const [damnificadoNombre, setDamnificadoNombre] = useState<string>("")
  const [damnificadoPuesto, setDamnificadoPuesto] = useState<
    ReporteSeguridadPuesto | ""
  >("")
  const [dentroCD, setDentroCD] = useState<DentroCD>("")
  const [sif, setSif] = useState<SifValue>("")

  // acto inseguro / ruta riesgo / acto seguro
  const [quienQue, setQuienQue] = useState<string>("")

  const [files, setFiles] = useState<File[]>([])

  const esAccIncid = tipo === "accidente" || tipo === "incidente"

  function reset() {
    setTipo("incidente")
    setFecha(todayISO())
    setHora("")
    setLugar("")
    setLocalidad("")
    setArea("")
    setDescripcion("")
    setAccionTomada("")
    setDamnificadoNombre("")
    setDamnificadoPuesto("")
    setDentroCD("")
    setSif("")
    setQuienQue("")
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleFilesPick(picked: FileList | null) {
    if (!picked) return
    const arr = Array.from(picked)
    const validos: File[] = []
    for (const f of arr) {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`"${f.name}" supera 10MB`)
        continue
      }
      validos.push(f)
    }
    setFiles((prev) => [...prev, ...validos])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleSubmit() {
    if (!fecha) {
      toast.error("Seleccioná la fecha")
      return
    }
    if (!descripcion.trim()) {
      toast.error("Completá la descripción")
      return
    }

    const input = {
      tipo,
      fecha,
      hora: hora || null,
      descripcion,
      accion_tomada: accionTomada || null,
      lugar: lugar || null,
      localidad: (localidad || null) as ReporteSeguridadLocalidad | null,
      area: (area || null) as ReporteSeguridadArea | null,
      damnificado_nombre: esAccIncid ? damnificadoNombre || null : null,
      damnificado_puesto: esAccIncid
        ? ((damnificadoPuesto || null) as ReporteSeguridadPuesto | null)
        : null,
      dentro_cd: esAccIncid
        ? dentroCD === "dentro"
          ? true
          : dentroCD === "fuera"
            ? false
            : null
        : null,
      sif: esAccIncid ? (sif === "si" ? true : sif === "no" ? false : null) : null,
      quien_que: !esAccIncid ? quienQue || null : null,
    }

    const formData = new FormData()
    formData.append("input", JSON.stringify(input))
    for (const f of files) formData.append("files", f)

    startTransition(async () => {
      const res = await createReporte(formData)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Reporte creado")
      reset()
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo reporte de seguridad</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo + Fecha + Hora */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <Label>Tipo *</Label>
              <Select
                value={tipo}
                onValueChange={(v) =>
                  setTipo((v ?? "incidente") as ReporteSeguridadTipo)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {REPORTE_SEGURIDAD_TIPO_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha *</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div>
              <Label>Hora</Label>
              <Input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>
          </div>

          {/* Lugar / Localidad / Área */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <Label>Lugar</Label>
              <Input
                value={lugar}
                onChange={(e) => setLugar(e.target.value)}
                placeholder="Dirección o referencia"
              />
            </div>
            <div>
              <Label>Localidad</Label>
              <Select
                value={localidad}
                onValueChange={(v) =>
                  setLocalidad((v ?? "") as ReporteSeguridadLocalidad | "")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {LOCALIDADES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {REPORTE_SEGURIDAD_LOCALIDAD_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Área</Label>
              <Select
                value={area}
                onValueChange={(v) =>
                  setArea((v ?? "") as ReporteSeguridadArea | "")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {REPORTE_SEGURIDAD_AREA_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Campos específicos */}
          {esAccIncid ? (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Datos del damnificado
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Nombre</Label>
                  <Input
                    value={damnificadoNombre}
                    onChange={(e) => setDamnificadoNombre(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Puesto</Label>
                  <Select
                    value={damnificadoPuesto}
                    onValueChange={(v) =>
                      setDamnificadoPuesto(
                        (v ?? "") as ReporteSeguridadPuesto | ""
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {PUESTOS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {REPORTE_SEGURIDAD_PUESTO_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>¿Dentro del CD?</Label>
                  <Select
                    value={dentroCD}
                    onValueChange={(v) => setDentroCD((v ?? "") as DentroCD)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dentro">Dentro del CD</SelectItem>
                      <SelectItem value="fuera">Fuera del CD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Potencial SIF (lesión grave / fatalidad)</Label>
                  <Select
                    value={sif}
                    onValueChange={(v) => setSif((v ?? "") as SifValue)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="si">Sí</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Label>A quién / qué ves *</Label>
              <Input
                value={quienQue}
                onChange={(e) => setQuienQue(e.target.value)}
                placeholder="Persona, patente, número de cliente, zona, etc."
              />
            </div>
          )}

          {/* Descripción */}
          <div>
            <Label>Descripción / ¿qué pasó? *</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
              placeholder="Describí lo sucedido u observado"
            />
          </div>

          {/* Acción tomada */}
          <div>
            <Label>Acción tomada / para que no se repita</Label>
            <Textarea
              value={accionTomada}
              onChange={(e) => setAccionTomada(e.target.value)}
              rows={3}
              placeholder="Qué se hizo o qué se propone hacer"
            />
          </div>

          {/* Adjuntos */}
          <div className="space-y-2">
            <Label>Adjuntos (imagen / audio / video, máx 10MB c/u)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
              >
                <Paperclip className="mr-2 size-4" />
                Agregar archivos
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,audio/*,video/*"
                className="hidden"
                onChange={(e) => handleFilesPick(e.target.files)}
              />
              <span className="text-xs text-muted-foreground">
                {files.length} archivo{files.length === 1 ? "" : "s"} seleccionado
                {files.length === 1 ? "" : "s"}
              </span>
            </div>

            {files.length > 0 && (
              <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-sm">
                {files.map((f, idx) => (
                  <li
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(f.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
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
              {isPending ? "Creando..." : "Crear reporte"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
