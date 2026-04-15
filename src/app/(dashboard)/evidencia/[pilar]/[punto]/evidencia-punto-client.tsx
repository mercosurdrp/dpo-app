"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Upload,
  Download,
  History,
  MoreVertical,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Trash2,
  Pencil,
  Archive,
  Plus,
} from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  registerArchivoUpload,
  registerNuevaVersion,
  editArchivoMeta,
  archivarArchivo,
  deleteArchivo,
  getArchivoById,
  getDownloadUrl,
} from "@/actions/dpo-evidencia"
import { createClient } from "@/lib/supabase/client"
import type { DpoArchivo, DpoArchivoVersion } from "@/types/database"

const BUCKET = "dpo-evidencia"

function buildStoragePath(pilar: string, punto: string, version: number, filename: string): string {
  const archivo_id = crypto.randomUUID()
  return `${pilar}/${punto}/${archivo_id}/v${version}-${filename}`
}

function buildVersionPath(existingPath: string, version: number, filename: string): string {
  // Reemplaza el prefix v{N}- por el nuevo. existingPath es algo como
  // "entrega/1.1/{uuid}/v1-xxx.pdf"; extraemos el dir y armamos nuevo nombre.
  const parts = existingPath.split("/")
  const dir = parts.slice(0, -1).join("/")
  return `${dir}/v${version}-${filename}`
}

const CATEGORIAS = [
  "SOP",
  "Examen",
  "Plan de Acción",
  "Evidencia OWD",
  "Reporte",
  "Foto",
  "Otro",
]

function formatBytes(n: number): string {
  if (!n || n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function iconForExt(ext: string) {
  const e = (ext || "").toLowerCase().replace(".", "")
  if (["pdf", "doc", "docx", "txt"].includes(e)) return FileText
  if (["xls", "xlsx", "csv"].includes(e)) return FileText
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(e)) return ImageIcon
  return FileIcon
}

function capitalize(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

export function EvidenciaPuntoClient({
  pilarCodigo,
  puntoCodigo,
  archivos,
}: {
  pilarCodigo: string
  puntoCodigo: string
  archivos: DpoArchivo[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState<string | null>(null)
  const [newVersionOpen, setNewVersionOpen] = useState(false)

  const [selected, setSelected] = useState<DpoArchivo | null>(null)
  const [versiones, setVersiones] = useState<DpoArchivoVersion[]>([])

  const [file, setFile] = useState<File | null>(null)
  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [categoria, setCategoria] = useState<string>("Otro")
  const [requisito, setRequisito] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [nvFile, setNvFile] = useState<File | null>(null)
  const [nvNotas, setNvNotas] = useState("")

  function resetUploadForm() {
    setFile(null)
    setTitulo("")
    setDescripcion("")
    setCategoria("Otro")
    setRequisito("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function onFilePick(f: File | null) {
    setFile(f)
    if (f && !titulo) {
      const name = f.name.replace(/\.[^.]+$/, "")
      setTitulo(name)
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      toast.error("Seleccioná un archivo")
      return
    }
    if (!titulo.trim()) {
      toast.error("El título es obligatorio")
      return
    }

    startTransition(async () => {
      try {
        const supabase = createClient()
        const path = buildStoragePath(pilarCodigo, puntoCodigo, 1, file.name)

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          })

        if (upErr) {
          toast.error(`Error al subir: ${upErr.message}`)
          return
        }

        const res = await registerArchivoUpload({
          pilar_codigo: pilarCodigo,
          punto_codigo: puntoCodigo,
          requisito_codigo: requisito || null,
          titulo,
          descripcion: descripcion || null,
          categoria: categoria || null,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || "application/octet-stream",
        })

        if ("error" in res) {
          await supabase.storage.from(BUCKET).remove([path])
          toast.error(res.error)
          return
        }

        toast.success("Archivo subido")
        setUploadOpen(false)
        resetUploadForm()
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error desconocido")
      }
    })
  }

  async function handleDownload(archivo_id: string, version_id?: string) {
    const res = await getDownloadUrl({ archivo_id, version_id })
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    window.open(res.data.url, "_blank")
  }

  async function openHistory(a: DpoArchivo) {
    setSelected(a)
    setHistoryOpen(true)
    setVersiones([])
    const res = await getArchivoById(a.id)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setVersiones(res.data.versiones)
  }

  function openEdit(a: DpoArchivo) {
    setSelected(a)
    setTitulo(a.titulo)
    setDescripcion(a.descripcion ?? "")
    setCategoria(a.categoria ?? "Otro")
    setRequisito(a.requisito_codigo ?? "")
    setEditOpen(true)
    setActionsOpen(null)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    startTransition(async () => {
      const res = await editArchivoMeta({
        id: selected.id,
        titulo,
        descripcion,
        categoria,
        requisito_codigo: requisito || undefined,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Metadata actualizada")
      setEditOpen(false)
      router.refresh()
    })
  }

  async function handleArchive(a: DpoArchivo) {
    startTransition(async () => {
      const res = await archivarArchivo(a.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Archivado")
      setActionsOpen(null)
      router.refresh()
    })
  }

  async function handleDelete() {
    if (!selected) return
    startTransition(async () => {
      const res = await deleteArchivo(selected.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Eliminado")
      setDeleteOpen(false)
      router.refresh()
    })
  }

  async function handleNuevaVersion(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !nvFile) {
      toast.error("Seleccioná un archivo")
      return
    }
    startTransition(async () => {
      try {
        const supabase = createClient()
        const nextVersion = selected.current_version + 1
        const path = buildVersionPath(selected.current_file_path, nextVersion, nvFile.name)

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, nvFile, {
            contentType: nvFile.type || "application/octet-stream",
            upsert: false,
          })

        if (upErr) {
          toast.error(`Error al subir: ${upErr.message}`)
          return
        }

        const res = await registerNuevaVersion({
          archivo_id: selected.id,
          file_name: nvFile.name,
          file_path: path,
          file_size: nvFile.size,
          mime_type: nvFile.type || "application/octet-stream",
          notas: nvNotas || null,
        })

        if ("error" in res) {
          await supabase.storage.from(BUCKET).remove([path])
          toast.error(res.error)
          return
        }

        toast.success("Nueva versión subida")
        setNewVersionOpen(false)
        setNvFile(null)
        setNvNotas("")
        const refreshed = await getArchivoById(selected.id)
        if ("data" in refreshed) {
          setVersiones(refreshed.data.versiones)
          setSelected(refreshed.data.archivo)
        }
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error desconocido")
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {capitalize(pilarCodigo)} — Punto {puntoCodigo}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Archivos de evidencia, SOPs, planes de acción y reportes asociados al punto.
          </p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger
            render={
              <Button>
                <Upload className="mr-2 size-4" />
                Subir archivo
              </Button>
            }
          />
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Subir nuevo archivo</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <Label>Archivo *</Label>
                <div
                  className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-muted-foreground transition-colors hover:border-slate-400"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const f = e.dataTransfer.files?.[0]
                    if (f) onFilePick(f)
                  }}
                >
                  <Upload className="mb-2 size-6" />
                  {file ? (
                    <span className="font-medium text-slate-900">{file.name}</span>
                  ) : (
                    <span>Arrastrá un archivo o hacé click para seleccionar</span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => onFilePick(e.target.files?.[0] ?? null)}
                />
              </div>
              <div>
                <Label>Título *</Label>
                <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label>Categoría</Label>
                <Select value={categoria} onValueChange={(v) => setCategoria(v ?? "Otro")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Requisito (opcional)</Label>
                <Input
                  placeholder="R1.1.3"
                  value={requisito}
                  onChange={(e) => setRequisito(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setUploadOpen(false)
                    resetUploadForm()
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Subiendo…" : "Subir"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {archivos.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin archivos cargados para este punto. Subí el primero con el botón de arriba.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {archivos.map((a) => {
            const Icon = iconForExt(a.file_ext)
            return (
              <Card key={a.id} className="flex h-full flex-col p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-slate-900">{a.titulo}</h3>
                    {a.descripcion && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {a.descripcion}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {a.categoria && <Badge variant="secondary">{a.categoria}</Badge>}
                  <Badge variant="outline">v{a.current_version}</Badge>
                  {a.requisito_codigo && (
                    <Badge variant="outline">{a.requisito_codigo}</Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatBytes(a.current_file_size)}</span>
                  <span>{formatDate(a.updated_at)}</span>
                </div>
                <div className="mt-3 flex items-center gap-1 border-t pt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload(a.id)}
                    title="Descargar"
                  >
                    <Download className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openHistory(a)}
                    title="Historial de versiones"
                  >
                    <History className="size-4" />
                  </Button>
                  <div className="relative ml-auto">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setActionsOpen(actionsOpen === a.id ? null : a.id)
                      }
                      title="Más acciones"
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                    {actionsOpen === a.id && (
                      <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border bg-white p-1 shadow-md">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                          onClick={() => openEdit(a)}
                        >
                          <Pencil className="size-4" /> Editar metadata
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                          onClick={() => handleArchive(a)}
                        >
                          <Archive className="size-4" /> Archivar
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                          onClick={() => {
                            setSelected(a)
                            setActionsOpen(null)
                            setDeleteOpen(true)
                          }}
                        >
                          <Trash2 className="size-4" /> Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Historial de versiones {selected ? `— ${selected.titulo}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setNewVersionOpen(true)}>
                <Plus className="mr-1 size-4" /> Subir nueva versión
              </Button>
            </div>
            {versiones.length === 0 ? (
              <p className="text-sm text-muted-foreground">Cargando o sin versiones…</p>
            ) : (
              <div className="divide-y rounded-md border">
                {versiones.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">v{v.version}</Badge>
                        <span className="truncate text-sm font-medium text-slate-900">
                          {v.file_name}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span>{formatBytes(v.file_size)}</span>
                        <span>{formatDate(v.created_at)}</span>
                        {v.uploaded_by && <span>uid: {v.uploaded_by.slice(0, 8)}</span>}
                      </div>
                      {v.notas && (
                        <p className="mt-1 text-xs text-slate-600">{v.notas}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => selected && handleDownload(selected.id, v.id)}
                    >
                      <Download className="mr-1 size-4" /> Descargar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newVersionOpen} onOpenChange={setNewVersionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Subir nueva versión</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleNuevaVersion} className="space-y-4">
            <div>
              <Label>Archivo *</Label>
              <Input
                type="file"
                onChange={(e) => setNvFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                value={nvNotas}
                onChange={(e) => setNvNotas(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewVersionOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Subiendo…" : "Subir"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar metadata</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v ?? "Otro")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Requisito</Label>
              <Input value={requisito} onChange={(e) => setRequisito(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                Guardar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar archivo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que querés eliminar{" "}
            <span className="font-medium text-slate-900">{selected?.titulo}</span>? Esta
            acción no se puede deshacer.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
