"use client"

import { useRef, useState, useTransition } from "react"
import { useRefrescarConScroll } from "@/lib/use-refrescar-con-scroll"
import { toast } from "sonner"
import { FileSearch, FileText, Trash2, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import {
  addReporteInvestigaciones,
  deleteReporteInvestigacion,
} from "@/actions/reportes-seguridad"
import type { ReporteSeguridadInvestigacionConUrl } from "@/types/database"

const BUCKET = "reportes-seguridad"
const MAX_FILE_BYTES = 25 * 1024 * 1024

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function esPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  )
}

export function InvestigacionSection({
  reporteId,
  investigaciones,
  isAdmin,
  onChanged,
}: {
  reporteId: string
  investigaciones: ReporteSeguridadInvestigacionConUrl[]
  isAdmin: boolean
  onChanged: () => void
}) {
  const refrescarConScroll = useRefrescarConScroll()
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [titulo, setTitulo] = useState("")
  const [fecha, setFecha] = useState("")

  const busy = isPending || uploading
  const tiene = investigaciones.length > 0

  async function handleFiles(fileList: FileList) {
    const files = Array.from(fileList)
    if (files.length === 0) return

    const noPdf = files.find((f) => !esPdf(f))
    if (noPdf) {
      toast.error(`"${noPdf.name}" no es un PDF`)
      return
    }
    const tooBig = files.find((f) => f.size > MAX_FILE_BYTES)
    if (tooBig) {
      toast.error(`"${tooBig.name}" supera 25MB`)
      return
    }

    setUploading(true)
    try {
      const supabase = createClient()
      const subidos: {
        titulo: string | null
        nombre_original: string
        storage_path: string
        mime_type: string
        tamano_bytes: number
        fecha_investigacion: string | null
      }[] = []

      for (const f of files) {
        const safe = sanitizeFileName(f.name || "investigacion.pdf")
        const path = `${reporteId}/investigacion/${crypto.randomUUID()}-${safe}`
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, f, { contentType: "application/pdf", upsert: false })
        if (error) {
          if (subidos.length > 0) {
            await supabase.storage
              .from(BUCKET)
              .remove(subidos.map((s) => s.storage_path))
          }
          throw new Error(`"${f.name}": ${error.message}`)
        }
        subidos.push({
          // El título manual sólo tiene sentido cuando se sube un archivo.
          titulo: files.length === 1 ? titulo.trim() || null : null,
          nombre_original: f.name || "investigacion.pdf",
          storage_path: path,
          mime_type: "application/pdf",
          tamano_bytes: f.size,
          fecha_investigacion: fecha || null,
        })
      }

      const res = await addReporteInvestigaciones(reporteId, subidos)
      if ("error" in res) {
        await supabase.storage
          .from(BUCKET)
          .remove(subidos.map((s) => s.storage_path))
        toast.error(res.error)
        return
      }

      toast.success(
        files.length === 1 ? "Investigación cargada" : "Investigaciones cargadas"
      )
      setTitulo("")
      setFecha("")
      onChanged()
      refrescarConScroll()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error subiendo la investigación"
      )
    } finally {
      setUploading(false)
    }
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este documento de investigación?")) return
    startTransition(async () => {
      const res = await deleteReporteInvestigacion(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Documento eliminado")
      onChanged()
      refrescarConScroll()
    })
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-3">
      <div className="flex items-center gap-2">
        <FileSearch className="size-4 text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-800">Investigación</h3>
        {tiene ? (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
            {investigaciones.length} documento
            {investigaciones.length === 1 ? "" : "s"}
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-slate-100 text-slate-600">
            Sin cargar
          </Badge>
        )}
      </div>

      {!tiene && (
        <p className="text-xs text-muted-foreground">
          Todavía no se cargó el informe de investigación.
        </p>
      )}

      {tiene && (
        <ul className="space-y-2">
          {investigaciones.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-2 rounded-md border bg-white p-2"
            >
              <FileText className="size-5 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
                <a
                  href={inv.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm text-blue-600 underline"
                  title={inv.titulo ?? inv.nombre_original ?? "Investigación"}
                >
                  {inv.titulo ?? inv.nombre_original ?? "Ver investigación"}
                </a>
                <p className="truncate text-xs text-muted-foreground">
                  {inv.fecha_investigacion
                    ? `Investigación del ${formatDate(inv.fecha_investigacion)} · `
                    : ""}
                  {formatBytes(inv.tamaño_bytes)} · Subido por {inv.autor_nombre}{" "}
                  el {formatDateTime(inv.created_at)}
                </p>
              </div>
              {isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-1.5 text-destructive"
                  onClick={() => handleDelete(inv.id)}
                  disabled={busy}
                  aria-label="Eliminar investigación"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <div className="space-y-2 rounded-md border border-dashed bg-white p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Título (opcional)</Label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Informe de investigación — caída en playa"
                disabled={busy}
              />
            </div>
            <div>
              <Label className="text-xs">
                Fecha de la investigación (opcional)
              </Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            <Upload className="mr-2 size-4" />
            {uploading ? "Subiendo..." : "Cargar investigación (PDF)"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files)
              if (fileInputRef.current) fileInputRef.current.value = ""
            }}
          />
          <p className="text-xs text-muted-foreground">
            Sólo PDF, máx 25MB por archivo. Podés subir el informe y sus anexos.
          </p>
        </div>
      )}
    </div>
  )
}
