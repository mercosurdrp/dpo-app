"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { toast } from "sonner"
import { Shield, Paperclip, X, Lock, Check } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { crearDenunciaPublica } from "@/actions/linea-etica"
import {
  LINEA_ETICA_TIPO_LABELS,
  REPORTE_SEGURIDAD_AREA_LABELS,
  REPORTE_SEGURIDAD_LOCALIDAD_LABELS,
  type LineaEticaTipo,
  type ReporteSeguridadArea,
  type ReporteSeguridadLocalidad,
} from "@/types/database"

const TIPOS: LineaEticaTipo[] = [
  "conducta_indebida",
  "acoso",
  "discriminacion",
  "corrupcion",
  "fraude",
  "conflicto_interes",
  "represalia",
  "otro",
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

const MAX_FILE_BYTES = 10 * 1024 * 1024

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function LineaEticaFormClient() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const [tipo, setTipo] = useState<LineaEticaTipo | "">("")
  const [descripcion, setDescripcion] = useState("")
  const [lugar, setLugar] = useState("")
  const [area, setArea] = useState<ReporteSeguridadArea | "">("")
  const [localidad, setLocalidad] = useState<ReporteSeguridadLocalidad | "">("")
  const [fechaHecho, setFechaHecho] = useState("")
  const [identificarse, setIdentificarse] = useState(false)
  const [nombre, setNombre] = useState("")
  const [contacto, setContacto] = useState("")
  const [files, setFiles] = useState<File[]>([])

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
    if (!tipo) {
      toast.error("Seleccioná un tipo de denuncia")
      return
    }
    if (!descripcion.trim()) {
      toast.error("Contá qué pasó")
      return
    }
    if (identificarse && !nombre.trim()) {
      toast.error("Ingresá tu nombre o dejá la denuncia anónima")
      return
    }

    const input = {
      tipo,
      descripcion,
      lugar: lugar || null,
      area: (area || null) as ReporteSeguridadArea | null,
      localidad: (localidad || null) as ReporteSeguridadLocalidad | null,
      fecha_hecho: fechaHecho || null,
      identificarse,
      denunciante_nombre: identificarse ? nombre : null,
      denunciante_contacto: identificarse ? contacto : null,
    }

    const formData = new FormData()
    formData.append("input", JSON.stringify(input))
    for (const f of files) formData.append("files", f)

    startTransition(async () => {
      const res = await crearDenunciaPublica(formData)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setSubmitted(true)
    })
  }

  if (submitted) {
    return (
      <div className="space-y-6 pt-8">
        <Card className="border-green-300 bg-green-50">
          <CardContent className="py-10 text-center">
            <div className="mx-auto mb-4 inline-flex size-16 items-center justify-center rounded-full bg-green-500">
              <Check className="size-9 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-green-800">Denuncia recibida</h2>
            <p className="mt-3 text-sm text-green-700">
              Gracias por tu reporte. Se revisará con confidencialidad y se tomarán
              las acciones correspondientes.
            </p>
            <Button
              className="mt-6"
              variant="outline"
              onClick={() => {
                router.push("/linea-etica")
                router.refresh()
              }}
            >
              Cargar otra denuncia
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto inline-flex rounded-xl bg-slate-900 px-4 py-2">
          <Image
            src="/logo-mercosur-blanco.png"
            alt="Mercosur"
            width={140}
            height={24}
            className="h-7 w-auto"
            priority
          />
        </div>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-1.5 text-white">
          <Shield className="size-4" />
          <span className="text-sm font-semibold">Línea Ética</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Canal confidencial para reportar conductas indebidas
        </p>
      </div>

      <Card className="border-blue-200 bg-blue-50/60">
        <CardContent className="py-3">
          <div className="flex items-start gap-2 text-sm text-blue-900">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-semibold">Tu denuncia es anónima.</span> No
              pedimos datos tuyos. Si querés que te contactemos, podés
              identificarte al final del formulario.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contanos qué pasó</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tipo de denuncia *</Label>
            <Select
              value={tipo}
              onValueChange={(v) => setTipo((v ?? "") as LineaEticaTipo)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LINEA_ETICA_TIPO_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Descripción *</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={6}
              placeholder="Contá con tus palabras qué pasó, dónde, cuándo, quién/es estuvieron involucrados. Cuantos más detalles, mejor podremos investigar."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha del hecho</Label>
              <Input
                type="date"
                value={fechaHecho}
                onChange={(e) => setFechaHecho(e.target.value)}
              />
            </div>
            <div>
              <Label>Lugar</Label>
              <Input
                value={lugar}
                onChange={(e) => setLugar(e.target.value)}
                placeholder="Sector, oficina, ruta..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <div className="space-y-2">
            <Label>Evidencia (fotos / audio / video — opcional)</Label>
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
                {files.length} archivo{files.length === 1 ? "" : "s"}
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
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={identificarse}
              onChange={(e) => setIdentificarse(e.target.checked)}
              className="mt-1 size-4"
            />
            <div>
              <p className="text-sm font-medium text-slate-900">
                Quiero identificarme
              </p>
              <p className="text-xs text-muted-foreground">
                Sólo si querés que nos contactemos con vos. Podés seguir siendo
                anónimo sin tildar esta opción.
              </p>
            </div>
          </label>

          {identificarse && (
            <div className="mt-4 space-y-3 border-t pt-4">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre y apellido"
                />
              </div>
              <div>
                <Label>Contacto (teléfono o email)</Label>
                <Input
                  value={contacto}
                  onChange={(e) => setContacto(e.target.value)}
                  placeholder="opcional"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={isPending}
        className="h-12 w-full bg-slate-900 text-base hover:bg-slate-800"
      >
        {isPending ? "Enviando..." : "Enviar denuncia"}
      </Button>
    </div>
  )
}
