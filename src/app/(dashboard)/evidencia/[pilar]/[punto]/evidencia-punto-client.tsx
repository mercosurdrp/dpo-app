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
  ArchiveRestore,
  Plus,
  EyeOff,
  Eye,
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
  desarchivarArchivo,
  deleteArchivo,
  getArchivoById,
  getDownloadUrl,
} from "@/actions/dpo-evidencia"
import { createClient } from "@/lib/supabase/client"
import type { DpoArchivo, DpoArchivoVersion } from "@/types/database"

const BUCKET = "dpo-evidencia"

// Supabase Storage no permite tildes, espacios ni caracteres especiales en
// el key. Se preserva el nombre original en la DB (file_name) pero el path
// del bucket usa la versión sanitizada.
function sanitizeFilename(name: string): string {
  const dotIdx = name.lastIndexOf(".")
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : ""
  const safeBase = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  const safeExt = ext
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.]+/g, "")
  return (safeBase || "archivo") + safeExt.toLowerCase()
}

function buildStoragePath(pilar: string, punto: string, version: number, filename: string): string {
  const archivo_id = crypto.randomUUID()
  return `${pilar}/${punto}/${archivo_id}/v${version}-${sanitizeFilename(filename)}`
}

function buildVersionPath(existingPath: string, version: number, filename: string): string {
  const parts = existingPath.split("/")
  const dir = parts.slice(0, -1).join("/")
  return `${dir}/v${version}-${sanitizeFilename(filename)}`
}

const CATEGORIAS = [
  "SOP",
  "Examen",
  "Plan de Acción",
  "Evidencia OWD",
  "Archivos para capacitación",
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
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState<string | null>(null)
  const [newVersionOpen, setNewVersionOpen] = useState(false)
  const [mostrarArchivados, setMostrarArchivados] = useState(false)

  const [selected, setSelected] = useState<DpoArchivo | null>(null)
  const [versiones, setVersiones] = useState<DpoArchivoVersion[]>([])

  const [file, setFile] = useState<File | null>(null)
  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [categoria, setCategoria] = useState<string>("Otro")
  const [requisito, setRequisito] = useState("")
  const [motivo, setMotivo] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [nvFile, setNvFile] = useState<File | null>(null)
  const [nvNotas, setNvNotas] = useState("")

  const archivosVisibles = archivos.filter((a) =>
    mostrarArchivados ? true : !a.archivado
  )
  const cantArchivados = archivos.filter((a) => a.archivado).length

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
    setMotivo("")
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
        motivo: motivo || undefined,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Metadata actualizada")
      setEditOpen(false)
      setMotivo("")
      router.refresh()
    })
  }

  function openArchive(a: DpoArchivo) {
    setSelected(a)
    setMotivo("")
    setArchiveOpen(true)
    setActionsOpen(null)
  }

  function handleArchiveConfirm() {
    if (!selected) return
    startTransition(async () => {
      const res = await archivarArchivo(selected.id, motivo || null)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Archivado")
      setArchiveOpen(false)
      setMotivo("")
      router.refresh()
    })
  }

  async function handleDesarchivar(a: DpoArchivo) {
    startTransition(async () => {
      const res = await desarchivarArchivo(a.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Desarchivado")
      setActionsOpen(null)
      router.refresh()
    })
  }

  async function handleDelete() {
    if (!selected) return
    startTransition(async () => {
      const res = await deleteArchivo(selected.id, motivo || null)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Eliminado")
      setMotivo("")
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
        <div className="flex items-center gap-2">
          {cantArchivados > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMostrarArchivados((v) => !v)}
              title={mostrarArchivados ? "Ocultar archivados" : `Mostrar ${cantArchivados} archivados`}
            >
              {mostrarArchivados ? (
                <>
                  <EyeOff className="mr-1 size-4" /> Ocultar archivados
                </>
              ) : (
                <>
                  <Eye className="mr-1 size-4" /> Ver archivados ({cantArchivados})
                </>
              )}
            </Button>
          )}
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
      </div>

      {archivosVisibles.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          {archivos.length === 0
            ? "Sin archivos cargados para este punto. Subí el primero con el botón de arriba."
            : "No hay archivos vigentes. Activá 'Ver archivados' para mostrar los archivados."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {archivosVisibles.map((a) => {
            const Icon = iconForExt(a.file_ext)
            return (
              <Card
                key={a.id}
                className={`flex h-full flex-col p-4 ${a.archivado ? "border-slate-200 bg-slate-50/60 opacity-75" : ""}`}
              >
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
                  {a.archivado && (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-700"
                    >
                      <Archive className="mr-1 size-3" />
                      Archivado
                    </Badge>
                  )}
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
                <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(a.id)}
                  >
                    <Download className="mr-1 size-4" />
                    Descargar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openHistory(a)}
                  >
                    <History className="mr-1 size-4" />
                    Historial
                  </Button>
                  {!a.archivado && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelected(a)
                        setNvFile(null)
                        setNvNotas("")
                        setNewVersionOpen(true)
                      }}
                    >
                      <Plus className="mr-1 size-4" />
                      Nueva versión
                    </Button>
                  )}
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
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setActionsOpen(null)}
                        />
                        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border bg-white p-1 shadow-md">
                          {!a.archivado && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                              onClick={() => openEdit(a)}
                            >
                              <Pencil className="size-4" /> Editar metadata
                            </button>
                          )}
                          {a.archivado ? (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                              onClick={() => handleDesarchivar(a)}
                            >
                              <ArchiveRestore className="size-4" /> Desarchivar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                              onClick={() => openArchive(a)}
                            >
                              <Archive className="size-4" /> Archivar
                            </button>
                          )}
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setSelected(a)
                              setMotivo("")
                              setActionsOpen(null)
                              setDeleteOpen(true)
                            }}
                          >
                            <Trash2 className="size-4" /> Eliminar
                          </button>
                        </div>
                      </>
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
            <div>
              <Label>Motivo del cambio (opcional)</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Queda en el historial"
              />
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

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archivar archivo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Archivar{" "}
            <span className="font-medium text-slate-900">{selected?.titulo}</span>. Se va a ocultar del listado pero queda disponible en "Ver archivados".
          </p>
          <div>
            <Label>Motivo (opcional)</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej: documento reemplazado por versión nueva"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleArchiveConfirm} disabled={isPending}>
              {isPending ? "Archivando…" : "Archivar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar archivo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que querés eliminar{" "}
            <span className="font-medium text-slate-900">{selected?.titulo}</span>? Se borran todas las versiones del storage. Esta acción no se puede deshacer.
          </p>
          <div>
            <Label>Motivo (opcional pero recomendado)</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Queda registrado en el audit log"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
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
