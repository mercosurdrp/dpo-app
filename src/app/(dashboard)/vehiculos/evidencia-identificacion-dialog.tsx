"use client"

/**
 * Evidencia de los papeles reglamentarios que viajan en la unidad (DPO 1.1).
 *
 * El maestro decía que la VTV vence tal día y que el seguro está al día, pero
 * eso es la base de datos hablando de sí misma: nada probaba que el papel esté
 * ARRIBA DEL CAMIÓN, que es lo que pide el punto 1.1 y lo que el auditor mira
 * cuando abre la guantera. La columna "Evidencia" sube la foto del folio de
 * cada unidad —cédula, seguro, VTV, SENASA, tarjeta de matafuegos— y la deja
 * colgada de la unidad.
 *
 * 🚨 No hay tabla nueva: la foto va a `vehiculos_documentos` con
 * `tipo = 'evidencia'`, en el bucket `vehiculos-fichas` que ya existía para la
 * foto y los papeles de la ficha. Dos consecuencias buscadas: la evidencia
 * aparece también en la ficha de la unidad junto a la cédula y el seguro, y el
 * maestro la cuenta sin una consulta más (ya trae `documentos` de cada unidad).
 *
 * Qué papeles muestra la foto se tilda de a varios, no se elige uno: el folio
 * se fotografía abierto y en una sola toma entran la cédula, la póliza y la
 * tarjeta de matafuegos. Con un solo rótulo por foto había que mentir o sacar
 * cinco fotos del mismo folio. Y van varias fotos por unidad (frente y dorso
 * del folio, o los papeles que quedaron fuera de cuadro): el input acepta
 * varios archivos de una y los numera "(1/2)", "(2/2)".
 */

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Camera, Check, FileText, Loader2, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { comprimirImagen } from "@/lib/comprimir-imagen"
import {
  crearDocumentoVehiculo,
  eliminarDocumentoVehiculo,
} from "@/actions/vehiculos-ficha"
import { DpoPuntoBadge } from "@/app/(dashboard)/vehiculos/mantenimiento/_components/dpo-badge"
import type { MaestroFlotaUnidad, VehiculoDocumento } from "@/types/database"

const BUCKET = "vehiculos-fichas"
const MAX_BYTES = 25 * 1024 * 1024

/**
 * Los papeles que tienen que viajar en la unidad. Son los mismos que el control
 * documentario sigue por vencimiento (/requisitos-legales), para que la foto se
 * lea contra la fecha: el auditor pregunta por el papel, no por la foto.
 */
const PAPELES = [
  "Cédula",
  "Seguro",
  "VTV",
  "SENASA",
  "Matafuegos",
  "Ruta / habilitación",
] as const

/** Las fotos de una unidad: el adjunto de la ficha marcado como evidencia. */
export function evidenciasDe(u: MaestroFlotaUnidad): VehiculoDocumento[] {
  return u.documentos.filter((d) => d.tipo === "evidencia")
}

export function EvidenciaIdentificacionDialog({
  unidad,
  canEdit,
  onClose,
}: {
  unidad: MaestroFlotaUnidad | null
  canEdit: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [tildados, setTildados] = useState<string[]>([])
  const [otro, setOtro] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  // getPublicUrl no pega a la red (arma la URL), así que se puede resolver acá
  // sin devolverla desde el servidor: el maestro trae los adjuntos sin url.
  const supabase = useMemo(() => createClient(), [])
  const urlDe = (path: string) =>
    supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const evidencias = unidad ? evidenciasDe(unidad) : []

  // Qué papel ya quedó fotografiado. El nombre guardado junta los papeles de la
  // toma ("Cédula, Seguro, Matafuegos (1/2)"), así que se busca contenido.
  const cubierto = (papel: string) =>
    evidencias.some((d) => d.nombre.toLowerCase().includes(papel.toLowerCase()))

  function toggle(papel: string) {
    setTildados((prev) =>
      prev.includes(papel) ? prev.filter((p) => p !== papel) : [...prev, papel]
    )
  }

  function limpiar() {
    setFiles([])
    setTildados([])
    setOtro("")
    if (inputRef.current) inputRef.current.value = ""
  }

  async function handleSubir() {
    if (!unidad) return
    const partes = [...tildados]
    if (otro.trim()) partes.push(otro.trim())
    const nombreBase = partes.join(", ")
    if (!nombreBase) {
      toast.error("Tildá qué papeles se ven en la foto")
      return
    }
    if (files.length === 0) {
      toast.error("Elegí la foto")
      return
    }
    if (files.some((f) => f.size > MAX_BYTES)) {
      toast.error("Alguno de los archivos supera 25MB")
      return
    }

    setSubiendo(true)
    try {
      for (const [i, file] of files.entries()) {
        // Las fotos se comprimen en el navegador (lado máximo 1600): una foto de
        // celular de 8MB no entra en el payload de la server action.
        const archivo = file.type.startsWith("image/")
          ? await comprimirImagen(file)
          : file
        const mime = archivo.type || "application/octet-stream"
        const path = `${unidad.dominio}/evidencia/${crypto.randomUUID()}-${sanitizar(archivo.name)}`
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, archivo, { contentType: mime, upsert: false })
        if (error) throw new Error(error.message)

        const res = await crearDocumentoVehiculo({
          dominio: unidad.dominio,
          nombre:
            files.length > 1 ? `${nombreBase} (${i + 1}/${files.length})` : nombreBase,
          tipo: "evidencia",
          storagePath: path,
          mimeType: mime,
          vencimiento: null,
        })
        if ("error" in res) throw new Error(res.error)
      }
      toast.success(files.length > 1 ? `${files.length} fotos cargadas` : "Foto cargada")
      limpiar()
      router.refresh()
    } catch (e) {
      toast.error(
        `No se pudo subir: ${e instanceof Error ? e.message : "error desconocido"}`
      )
    } finally {
      setSubiendo(false)
    }
  }

  function handleEliminar(doc: VehiculoDocumento) {
    if (!window.confirm(`¿Eliminar la evidencia "${doc.nombre}"?`)) return
    startTransition(async () => {
      const res = await eliminarDocumentoVehiculo(doc.id)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Evidencia eliminada")
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={!!unidad} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Camera className="size-4 text-muted-foreground" aria-hidden />
            Papeles de la unidad — {unidad?.dominio}
            <DpoPuntoBadge numero="1.1" />
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Los papeles reglamentarios que viajan en la guantera: cédula, seguro,
          VTV, SENASA y la tarjeta de matafuegos. La foto del folio es lo que
          prueba que están a bordo, no sólo cargados en el sistema.
        </p>

        {/* Qué papel ya está fotografiado y cuál falta. Es la lectura que hace
            el auditor y la que dice qué sacar la próxima vez que la unidad
            pasa por planta. */}
        <div className="flex flex-wrap gap-1.5">
          {PAPELES.map((papel) => {
            const ok = cubierto(papel)
            return (
              <Badge
                key={papel}
                variant="outline"
                className={cn(
                  "gap-1 text-[11px] font-normal",
                  ok
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "border-border text-muted-foreground"
                )}
              >
                {ok && <Check className="size-3" aria-hidden />}
                {papel}
              </Badge>
            )
          })}
        </div>

        {/* Lo cargado */}
        {evidencias.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            Sin fotos cargadas todavía.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {evidencias.map((doc) => {
              const url = urlDe(doc.storage_path)
              const esImagen = (doc.mime_type ?? "").startsWith("image/")
              return (
                <div key={doc.id} className="group relative">
                  <a href={url} target="_blank" rel="noreferrer" title={doc.nombre}>
                    {esImagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={doc.nombre}
                        className="h-28 w-full rounded-md border object-cover"
                      />
                    ) : (
                      <div className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-md border bg-muted/40 text-muted-foreground">
                        <FileText className="size-6" aria-hidden />
                        <span className="text-[11px]">Archivo</span>
                      </div>
                    )}
                  </a>
                  <p className="mt-1 truncate text-xs text-foreground" title={doc.nombre}>
                    {doc.nombre}
                  </p>
                  {canEdit && (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-1 top-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => handleEliminar(doc)}
                      title="Eliminar"
                      aria-label={`Eliminar ${doc.nombre}`}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Subir */}
        {canEdit && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="space-y-2">
              <Label className="text-xs">Qué papeles se ven en la foto</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {PAPELES.map((papel) => (
                  <label
                    key={papel}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <Checkbox
                      checked={tildados.includes(papel)}
                      onCheckedChange={() => toggle(papel)}
                    />
                    {papel}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="evidencia-otro">
                  Otro papel (opcional)
                </Label>
                <Input
                  id="evidencia-otro"
                  value={otro}
                  onChange={(e) => setOtro(e.target.value)}
                  placeholder="Ej.: Libreta sanitaria"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="evidencia-archivo">
                  Fotos (se pueden elegir varias)
                </Label>
                <Input
                  id="evidencia-archivo"
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.pdf"
                  className="h-9"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {files.length > 0
                  ? `${files.length} foto${files.length === 1 ? "" : "s"} elegida${files.length === 1 ? "" : "s"}`
                  : "Elegí las dos caras del folio de una vez: se numeran solas."}
              </span>
              <Button size="sm" onClick={handleSubir} disabled={subiendo}>
                {subiendo ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Subiendo…
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 size-3.5" /> Subir fotos
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Nombre de archivo usable como key de Storage (igual que en la ficha). */
function sanitizar(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60)
}
