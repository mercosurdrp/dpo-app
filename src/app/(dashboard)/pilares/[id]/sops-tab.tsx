"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { format } from "date-fns"
import {
  FileUp,
  FileText,
  FileSpreadsheet,
  File,
  Download,
  Trash2,
  Eye,
  Upload,
  Plus,
  Loader2,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  X,
  Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { createSop, updateSopVersion, updateSopInfo, deleteSop } from "@/actions/sops"
import { createClient } from "@/lib/supabase/client"
import type { SopConVersiones } from "@/types/database"

// ---------- Helpers ----------

const FILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "application/pdf": FileText,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": FileText,
  "application/msword": FileText,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": FileSpreadsheet,
  "application/vnd.ms-excel": FileSpreadsheet,
}

function getFileIcon(fileType: string) {
  return FILE_ICONS[fileType] ?? File
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toUpperCase() ?? ""
}

function isPreviewable(fileType: string): boolean {
  return fileType === "application/pdf"
}

function isOfficeFile(fileType: string): boolean {
  return (
    fileType.includes("wordprocessingml") ||
    fileType.includes("spreadsheetml") ||
    fileType.includes("presentationml") ||
    fileType === "application/msword" ||
    fileType === "application/vnd.ms-excel" ||
    fileType === "application/vnd.ms-powerpoint"
  )
}

function getPublicUrl(filePath: string): string {
  const supabase = createClient()
  const { data } = supabase.storage.from("sops").getPublicUrl(filePath)
  return data.publicUrl
}

// ---------- Upload helper ----------

async function uploadFile(
  file: globalThis.File,
  pilarId: string
): Promise<{ path: string; url: string } | { error: string }> {
  const supabase = createClient()
  const ext = file.name.split(".").pop() ?? "bin"
  const path = `${pilarId}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`

  const { error } = await supabase.storage.from("sops").upload(path, file)

  if (error) return { error: error.message }

  const { data: urlData } = supabase.storage.from("sops").getPublicUrl(path)
  return { path, url: urlData.publicUrl }
}

// ---------- Preview Dialog ----------

function PreviewDialog({
  sop,
  open,
  onOpenChange,
}: {
  sop: SopConVersiones
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const url = getPublicUrl(sop.file_path)
  const isPdf = isPreviewable(sop.file_type)
  const isOffice = isOfficeFile(sop.file_type)

  let previewUrl = ""
  if (isPdf) {
    previewUrl = url
  } else if (isOffice) {
    previewUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4" />
            {sop.nombre} (v{sop.version})
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden rounded-lg border bg-white">
          {isPdf || isOffice ? (
            <iframe
              src={previewUrl}
              className="h-full w-full"
              title={sop.nombre}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <File className="h-12 w-12 opacity-40" />
              <p className="text-sm">
                Vista previa no disponible para este tipo de archivo
              </p>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Descargar
                </Button>
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Version History ----------

function VersionHistory({
  sop,
}: {
  sop: SopConVersiones
}) {
  const [open, setOpen] = useState(false)

  if (sop.versiones.length <= 1) return null

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-slate-600"
      >
        <Clock className="h-3 w-3" />
        {sop.versiones.length} versiones
        {open ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 rounded-md bg-slate-50 p-2">
          {sop.versiones.map((v) => (
            <div key={v.id} className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">v{v.version}</span>
                <span className="text-muted-foreground">
                  {format(new Date(v.created_at), "dd/MM/yyyy HH:mm")}
                </span>
                {v.notas && (
                  <span className="text-muted-foreground italic">- {v.notas}</span>
                )}
              </div>
              <a
                href={getPublicUrl(v.file_path)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="ghost" size="icon-xs">
                  <Download className="h-2.5 w-2.5" />
                </Button>
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- New Version Dialog ----------

function NewVersionDialog({
  sop,
  onUploaded,
}: {
  sop: SopConVersiones
  onUploaded: () => void
}) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<globalThis.File | null>(null)
  const [notas, setNotas] = useState("")
  const [uploading, setUploading] = useState(false)

  async function handleUpload() {
    if (!file) return
    setUploading(true)

    const result = await uploadFile(file, sop.pilar_id)
    if ("error" in result) {
      toast.error(result.error)
      setUploading(false)
      return
    }

    const saveResult = await updateSopVersion({
      sop_id: sop.id,
      file_path: result.path,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      notas: notas || undefined,
    })

    if ("error" in saveResult) {
      toast.error(saveResult.error)
    } else {
      toast.success(`Version ${sop.version + 1} subida`)
      setOpen(false)
      setFile(null)
      setNotas("")
      onUploaded()
    }
    setUploading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-xs" title="Subir nueva version">
            <Upload className="h-3 w-3" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Version - {sop.nombre}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Archivo</Label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </div>
          <div>
            <Label htmlFor="version-notas">Notas del cambio</Label>
            <Input
              id="version-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: Actualizado procedimiento de carga"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancelar
          </DialogClose>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="mr-1 h-3.5 w-3.5" />
                Subir v{sop.version + 1}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- SOP Card ----------

function SopCard({
  sop,
  onRefresh,
}: {
  sop: SopConVersiones
  onRefresh: () => void
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editNombre, setEditNombre] = useState(sop.nombre)
  const [editDesc, setEditDesc] = useState(sop.descripcion ?? "")
  const [saving, setSaving] = useState(false)

  const FileIcon = getFileIcon(sop.file_type)
  const ext = getFileExtension(sop.file_name)
  const canPreview = isPreviewable(sop.file_type) || isOfficeFile(sop.file_type)
  const url = getPublicUrl(sop.file_path)

  async function handleDelete() {
    if (!confirm(`Eliminar "${sop.nombre}"? Se eliminaran todas las versiones.`)) return
    setDeleting(true)
    const result = await deleteSop(sop.id)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("SOP eliminado")
      onRefresh()
    }
    setDeleting(false)
  }

  async function handleEditSave() {
    if (!editNombre.trim()) {
      toast.error("El nombre es requerido")
      return
    }
    setSaving(true)
    const result = await updateSopInfo(sop.id, {
      nombre: editNombre.trim(),
      descripcion: editDesc.trim() || undefined,
    })
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("SOP actualizado")
      setEditOpen(false)
      onRefresh()
    }
    setSaving(false)
  }

  return (
    <>
      <Card size="sm">
        <CardContent className="space-y-2">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <FileIcon className="h-5 w-5 text-slate-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {sop.nombre}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-medium">
                    {ext}
                  </span>
                  <span>{formatFileSize(sop.file_size)}</span>
                  <span>v{sop.version}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 gap-0.5">
              {canPreview && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setPreviewOpen(true)}
                  title="Ver"
                >
                  <Eye className="h-3 w-3" />
                </Button>
              )}
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="icon-xs" title="Descargar">
                  <Download className="h-3 w-3" />
                </Button>
              </a>
              <NewVersionDialog sop={sop} onUploaded={onRefresh} />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setEditOpen(true)}
                title="Editar info"
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleDelete}
                disabled={deleting}
                title="Eliminar"
              >
                {deleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3 text-red-500" />
                )}
              </Button>
            </div>
          </div>

          {/* Description */}
          {sop.descripcion && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {sop.descripcion}
            </p>
          )}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-2.5 w-2.5" />
              {sop.uploaded_by_nombre}
            </span>
            <span>
              {format(new Date(sop.updated_at), "dd/MM/yyyy HH:mm")}
            </span>
          </div>

          {/* Version history */}
          <VersionHistory sop={sop} />
        </CardContent>
      </Card>

      {/* Preview dialog */}
      <PreviewDialog
        sop={sop}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar SOP</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label htmlFor="edit-nombre">Nombre</Label>
              <Input
                id="edit-nombre"
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-desc">Descripcion</Label>
              <Textarea
                id="edit-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Descripcion opcional..."
                className="min-h-12"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button onClick={handleEditSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------- MAIN COMPONENT ----------

export function SopsTab({
  pilarId,
  sops: initialSops,
}: {
  pilarId: string
  sops: SopConVersiones[]
}) {
  const router = useRouter()
  const [sops, setSops] = useState(initialSops)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [file, setFile] = useState<globalThis.File | null>(null)
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function refresh() {
    router.refresh()
  }

  function handleFileSelect(selectedFile: globalThis.File) {
    setFile(selectedFile)
    if (!nombre) {
      // Auto-fill nombre from filename (without extension)
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "")
      setNombre(nameWithoutExt)
    }
    setUploadDialogOpen(true)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  async function handleUpload() {
    if (!file || !nombre.trim()) {
      toast.error("Archivo y nombre son requeridos")
      return
    }
    setUploading(true)

    const result = await uploadFile(file, pilarId)
    if ("error" in result) {
      toast.error(result.error)
      setUploading(false)
      return
    }

    const saveResult = await createSop({
      pilar_id: pilarId,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      file_path: result.path,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
    })

    if ("error" in saveResult) {
      toast.error(saveResult.error)
    } else {
      toast.success("SOP subido correctamente")
      setUploadDialogOpen(false)
      setFile(null)
      setNombre("")
      setDescripcion("")
      refresh()
    }
    setUploading(false)
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sops.length} SOP{sops.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <FileUp className={`h-8 w-8 ${dragOver ? "text-blue-500" : "text-slate-400"}`} />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">
            Arrastra un archivo o hace click para subir
          </p>
          <p className="text-xs text-muted-foreground">
            PDF, Word, Excel (max 50MB)
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFileSelect(f)
            e.target.value = ""
          }}
          className="hidden"
        />
      </div>

      {/* Upload dialog */}
      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => {
          setUploadDialogOpen(open)
          if (!open) {
            setFile(null)
            setNombre("")
            setDescripcion("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subir SOP</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {/* File info */}
            {file && (
              <div className="flex items-center gap-2 rounded-md bg-slate-50 p-2">
                <FileText className="h-5 w-5 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setFile(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            <div>
              <Label htmlFor="sop-nombre">Nombre del SOP</Label>
              <Input
                id="sop-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Procedimiento de carga"
              />
            </div>
            <div>
              <Label htmlFor="sop-desc">Descripcion (opcional)</Label>
              <Textarea
                id="sop-desc"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Breve descripcion del documento..."
                className="min-h-12"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button onClick={handleUpload} disabled={!file || !nombre.trim() || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  Subir
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SOP list */}
      {sops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <FileText className="mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">Sin SOPs cargados</p>
          <p className="text-xs">Subi procedimientos operativos para este pilar</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sops.map((sop) => (
            <SopCard key={sop.id} sop={sop} onRefresh={refresh} />
          ))}
        </div>
      )}
    </div>
  )
}
