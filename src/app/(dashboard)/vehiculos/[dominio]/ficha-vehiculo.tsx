"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import {
  Camera,
  FileText,
  IdCard,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Truck,
  AlertTriangle,
} from "lucide-react"
import { comprimirImagen } from "@/lib/comprimir-imagen"
import { createClient } from "@/lib/supabase/client"
import {
  actualizarFichaVehiculo,
  crearDocumentoVehiculo,
  eliminarDocumentoVehiculo,
  setFotoVehiculo,
  syncFichaCloudfleet,
} from "@/actions/vehiculos-ficha"
import type {
  VehiculoFicha,
  VehiculoDocumento,
  VehiculoDocumentoTipo,
  CampoFicha,
} from "@/types/database"

const BUCKET = "vehiculos-fichas"
const MAX_DOC_BYTES = 25 * 1024 * 1024

interface Props {
  dominio: string
  ficha: VehiculoFicha | null
  documentos: VehiculoDocumento[]
  canEdit: boolean
}

// Campos de la ficha en el orden en que se muestran/editan
const CAMPOS: { key: CampoFicha; label: string }[] = [
  { key: "marca", label: "Marca" },
  { key: "modelo", label: "Modelo" },
  { key: "anio", label: "Año" },
  { key: "color", label: "Color" },
  { key: "tipo_unidad", label: "Tipo de unidad" },
  { key: "combustible", label: "Combustible" },
  { key: "combustible_aux", label: "Combustible aux." },
  { key: "chasis", label: "N° de chasis" },
  { key: "vin", label: "VIN" },
  { key: "motor", label: "N° de motor" },
  { key: "capacidad_carga", label: "Capacidad de carga" },
  { key: "carroceria", label: "Carrocería" },
  { key: "ciudad", label: "Ciudad" },
  { key: "centro_costo", label: "Centro de costo" },
  { key: "chofer_asignado", label: "Chofer asignado" },
]

const CAMPO_LABEL = Object.fromEntries(CAMPOS.map((c) => [c.key, c.label])) as Record<
  string,
  string
>

const DOC_TIPOS: { value: VehiculoDocumentoTipo; label: string }[] = [
  { value: "cedula", label: "Cédula de identificación" },
  { value: "titulo", label: "Título" },
  { value: "seguro", label: "Seguro" },
  { value: "vtv", label: "VTV" },
  { value: "otro", label: "Otro" },
]

const DOC_TIPO_LABEL = Object.fromEntries(DOC_TIPOS.map((t) => [t.value, t.label])) as Record<
  string,
  string
>

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)
}

/** Estado del vencimiento: null = sin fecha; días restantes si tiene. */
function diasAlVencimiento(vencimiento: string | null): number | null {
  if (!vencimiento) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const v = new Date(vencimiento + "T00:00:00")
  return Math.round((v.getTime() - hoy.getTime()) / 86400000)
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

export function FichaVehiculo({ dominio, ficha, documentos, canEdit }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [syncing, setSyncing] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const fotoInputRef = useRef<HTMLInputElement>(null)

  // Editar ficha
  const [editOpen, setEditOpen] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [editNotas, setEditNotas] = useState("")

  // Nuevo documento
  const [docOpen, setDocOpen] = useState(false)
  const [docNombre, setDocNombre] = useState("")
  const [docTipo, setDocTipo] = useState<VehiculoDocumentoTipo>("cedula")
  const [docVencimiento, setDocVencimiento] = useState("")
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docSaving, setDocSaving] = useState(false)

  const camposVacios = CAMPOS.filter(
    (c) => !(ficha?.[c.key] ?? "").toString().trim()
  )

  function abrirEditar() {
    const vals: Record<string, string> = {}
    for (const c of CAMPOS) vals[c.key] = (ficha?.[c.key] ?? "") as string
    setEditValues(vals)
    setEditNotas(ficha?.notas ?? "")
    setEditOpen(true)
  }

  async function handleSync() {
    setSyncing(true)
    const res = await syncFichaCloudfleet(dominio)
    setSyncing(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    const { completados, sinDatoEnCf } = res.data
    if (completados.length > 0) {
      toast.success(
        `Cloudfleet completó: ${completados.map((c) => CAMPO_LABEL[c] ?? c).join(", ")}`
      )
    } else {
      toast.info("No había campos vacíos que Cloudfleet pudiera completar.")
    }
    if (sinDatoEnCf.length > 0) {
      toast.warning(
        `Sin dato en Cloudfleet (cargalos a mano): ${sinDatoEnCf
          .map((c) => CAMPO_LABEL[c] ?? c)
          .join(", ")}`
      )
    }
    router.refresh()
  }

  function handleGuardarEdicion() {
    startTransition(async () => {
      const res = await actualizarFichaVehiculo(dominio, {
        ...editValues,
        notas: editNotas,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Ficha actualizada")
      setEditOpen(false)
      router.refresh()
    })
  }

  async function handleFotoPick(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    if (!f.type.startsWith("image/")) {
      toast.error("La foto tiene que ser una imagen")
      return
    }
    setSubiendoFoto(true)
    try {
      const comprimida = await comprimirImagen(f)
      const path = `${dominio}/foto-${crypto.randomUUID()}.jpg`
      const supabase = createClient()
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, comprimida, { contentType: "image/jpeg", upsert: false })
      if (error) throw new Error(error.message)
      const res = await setFotoVehiculo(dominio, path)
      if ("error" in res) throw new Error(res.error)
      toast.success("Foto actualizada")
      router.refresh()
    } catch (e) {
      toast.error(
        `No se pudo subir la foto: ${e instanceof Error ? e.message : "error desconocido"}`
      )
    } finally {
      setSubiendoFoto(false)
      if (fotoInputRef.current) fotoInputRef.current.value = ""
    }
  }

  async function handleGuardarDoc() {
    if (!docNombre.trim()) {
      toast.error("Poné un nombre al documento")
      return
    }
    if (!docFile) {
      toast.error("Elegí el archivo (foto o PDF)")
      return
    }
    if (docFile.size > MAX_DOC_BYTES) {
      toast.error("El archivo supera 25MB")
      return
    }
    setDocSaving(true)
    try {
      const archivo = docFile.type.startsWith("image/")
        ? await comprimirImagen(docFile)
        : docFile
      const mime = archivo.type || "application/octet-stream"
      const path = `${dominio}/docs/${crypto.randomUUID()}-${sanitizeFileName(archivo.name)}`
      const supabase = createClient()
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, archivo, { contentType: mime, upsert: false })
      if (error) throw new Error(error.message)
      const res = await crearDocumentoVehiculo({
        dominio,
        nombre: docNombre,
        tipo: docTipo,
        storagePath: path,
        mimeType: mime,
        vencimiento: docVencimiento || null,
      })
      if ("error" in res) throw new Error(res.error)
      toast.success("Documento cargado")
      setDocOpen(false)
      setDocNombre("")
      setDocTipo("cedula")
      setDocVencimiento("")
      setDocFile(null)
      router.refresh()
    } catch (e) {
      toast.error(
        `No se pudo cargar el documento: ${e instanceof Error ? e.message : "error desconocido"}`
      )
    } finally {
      setDocSaving(false)
    }
  }

  function handleEliminarDoc(doc: VehiculoDocumento) {
    if (!window.confirm(`¿Eliminar "${doc.nombre}"?`)) return
    startTransition(async () => {
      const res = await eliminarDocumentoVehiculo(doc.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Documento eliminado")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Ficha técnica */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <IdCard className="h-4 w-4 text-blue-600" />
            Ficha de la unidad
          </CardTitle>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Actualizar desde Cloudfleet
              </Button>
              <Button variant="outline" size="sm" onClick={abrirEditar}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Editar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-5 sm:flex-row">
            {/* Foto */}
            <div className="w-full shrink-0 sm:w-64">
              {ficha?.foto_url ? (
                <a href={ficha.foto_url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ficha.foto_url}
                    alt={`Foto de ${dominio}`}
                    className="h-44 w-full rounded-lg border border-slate-200 object-cover"
                  />
                </a>
              ) : (
                <div className="flex h-44 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400">
                  <Truck className="h-8 w-8" />
                  <span className="text-xs">Sin foto</span>
                </div>
              )}
              {canEdit && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    disabled={subiendoFoto}
                    onClick={() => fotoInputRef.current?.click()}
                  >
                    {subiendoFoto ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {ficha?.foto_url ? "Cambiar foto" : "Subir foto"}
                  </Button>
                  <input
                    ref={fotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFotoPick(e.target.files)}
                  />
                </>
              )}
            </div>

            {/* Datos */}
            <div className="min-w-0 flex-1">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3">
                {CAMPOS.map((c) => {
                  const valor = ((ficha?.[c.key] ?? "") as string).trim()
                  return (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {c.label}
                      </dt>
                      <dd
                        className={`truncate text-sm font-semibold ${
                          valor ? "text-slate-900" : "text-slate-300"
                        }`}
                        title={valor || undefined}
                      >
                        {valor || "—"}
                      </dd>
                    </div>
                  )
                })}
              </dl>
              {ficha?.notas && (
                <p className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                  {ficha.notas}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {ficha?.cf_odometro != null && (
                  <span>
                    Odómetro Cloudfleet:{" "}
                    <span className="font-mono font-semibold text-slate-700">
                      {Number(ficha.cf_odometro).toLocaleString("es-AR")}
                    </span>{" "}
                    ({formatFecha(ficha.cf_odometro_fecha)})
                  </span>
                )}
                {ficha?.cf_synced_at && (
                  <span>Última sync Cloudfleet: {formatFecha(ficha.cf_synced_at)}</span>
                )}
              </div>
              {canEdit && camposVacios.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Faltan cargar: {camposVacios.map((c) => c.label).join(", ")}.
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documentación */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Documentación
          </CardTitle>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setDocOpen(true)}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Agregar documento
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {documentos.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sin documentos cargados{canEdit ? " — subí la cédula, el seguro o la VTV." : "."}
            </p>
          ) : (
            <div className="space-y-2">
              {documentos.map((doc) => {
                const dias = diasAlVencimiento(doc.vencimiento)
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 rounded-md border border-slate-200 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-blue-700 hover:underline"
                      >
                        {doc.nombre}
                      </a>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">
                          {DOC_TIPO_LABEL[doc.tipo] ?? doc.tipo}
                        </Badge>
                        {doc.vencimiento && (
                          <span
                            className={
                              dias != null && dias < 0
                                ? "font-semibold text-red-600"
                                : dias != null && dias <= 30
                                ? "font-semibold text-amber-600"
                                : ""
                            }
                          >
                            Vence {formatFecha(doc.vencimiento)}
                            {dias != null && dias < 0
                              ? " — VENCIDO"
                              : dias != null && dias <= 30
                              ? ` — en ${dias} día${dias === 1 ? "" : "s"}`
                              : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={pending}
                        onClick={() => handleEliminarDoc(doc)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: editar ficha */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar ficha — {dominio}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CAMPOS.map((c) => (
              <div key={c.key} className="space-y-1">
                <Label className="text-xs">{c.label}</Label>
                <Input
                  value={editValues[c.key] ?? ""}
                  onChange={(e) =>
                    setEditValues((prev) => ({ ...prev, [c.key]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Notas</Label>
              <Textarea
                rows={2}
                value={editNotas}
                onChange={(e) => setEditNotas(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGuardarEdicion} disabled={pending}>
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: nuevo documento */}
      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar documento — {dominio}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={docTipo}
                onValueChange={(v: string | null) =>
                  setDocTipo((v ?? "otro") as VehiculoDocumentoTipo)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                placeholder="Ej: Cédula verde AF199RD"
                value={docNombre}
                onChange={(e) => setDocNombre(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vencimiento (opcional)</Label>
              <Input
                type="date"
                value={docVencimiento}
                onChange={(e) => setDocVencimiento(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Archivo (foto o PDF)</Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGuardarDoc} disabled={docSaving}>
              {docSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
