"use client"

import { useState, useTransition } from "react"
import { FileUp, Link2, Loader2 } from "lucide-react"
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
import { createClient } from "@/lib/supabase/client"
import { cleanFileName } from "@/lib/adjuntos-avance"
import {
  CAMPUS_BUCKET,
  CAMPUS_MAX_BYTES,
  CAMPUS_TIPOS,
  esUrlValida,
  formatBytes,
  mimePorExtension,
  tipoSugerido,
  youtubeId,
} from "@/lib/campus"
import {
  registrarMaterialArchivo,
  registrarMaterialLink,
  updateCampusMaterial,
} from "@/actions/campus"
import type { CampusMaterial } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  capacitacionId: string
  pilarCodigo: string
  /** Si viene, el diálogo edita ese material en vez de cargar uno nuevo. */
  material?: CampusMaterial | null
  onSaved: () => void
}

export function MaterialDialog({
  open,
  onOpenChange,
  capacitacionId,
  pilarCodigo,
  material = null,
  onSaved,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{material ? "Editar material" : "Agregar material"}</DialogTitle>
        </DialogHeader>

        {/* Se remonta en cada apertura (key) para arrancar con los valores de
            la fila que se edita, sin sincronizar estado por efecto. */}
        {open && (
          <Formulario
            key={material?.id ?? "nuevo"}
            capacitacionId={capacitacionId}
            pilarCodigo={pilarCodigo}
            material={material}
            onCerrar={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type Modo = "archivo" | "link"

function Formulario({
  capacitacionId,
  pilarCodigo,
  material,
  onCerrar,
  onSaved,
}: {
  capacitacionId: string
  pilarCodigo: string
  material: CampusMaterial | null
  onCerrar: () => void
  onSaved: () => void
}) {
  const editando = material !== null
  const [pending, startTransition] = useTransition()
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [modo, setModo] = useState<Modo>(material?.origen === "link" ? "link" : "archivo")
  const [titulo, setTitulo] = useState(material?.titulo ?? "")
  const [descripcion, setDescripcion] = useState(material?.descripcion ?? "")
  const [tipo, setTipo] = useState<string>(material?.tipo ?? "otro")
  const [url, setUrl] = useState(material?.url_externa ?? "")
  const [archivo, setArchivo] = useState<File | null>(null)

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setArchivo(f)
    if (!f) return
    if (!titulo.trim()) setTitulo(f.name.replace(/\.[^.]+$/, ""))
    setTipo(tipoSugerido(f.name))
  }

  function cambiarUrl(valor: string) {
    setUrl(valor)
    if (valor && youtubeId(valor)) setTipo("video")
  }

  async function guardarArchivoNuevo() {
    if (!archivo) {
      setError("Elegí un archivo.")
      return
    }
    if (archivo.size > CAMPUS_MAX_BYTES) {
      setError(
        `El archivo pesa ${formatBytes(archivo.size)} y el máximo es 200 MB. ` +
          "Si es un video largo, subilo a YouTube o Drive y pegá el link acá.",
      )
      return
    }

    setSubiendo(true)
    try {
      const supabase = createClient()
      // Solo se sanea la CLAVE del bucket: Storage rechaza tildes y guion largo
      // con "Invalid key". El nombre lindo se guarda en nombre_original.
      const path = `${pilarCodigo}/${capacitacionId}/${crypto.randomUUID()}-${cleanFileName(archivo.name)}`
      const contentType = archivo.type || mimePorExtension(archivo.name)

      const { error: upErr } = await supabase.storage
        .from(CAMPUS_BUCKET)
        .upload(path, archivo, { contentType, upsert: false })
      if (upErr) {
        setError(`No se pudo subir: ${upErr.message}`)
        return
      }

      const res = await registrarMaterialArchivo({
        capacitacion_id: capacitacionId,
        titulo,
        descripcion,
        tipo,
        storage_path: path,
        nombre_original: archivo.name,
        mime_type: contentType,
        bytes: archivo.size,
      })

      if ("error" in res) {
        // Sube-o-nada: si no quedó registrado, el archivo no se queda huérfano.
        await supabase.storage.from(CAMPUS_BUCKET).remove([path])
        setError(res.error)
        return
      }

      onSaved()
      onCerrar()
    } finally {
      setSubiendo(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!titulo.trim()) {
      setError("Poné un título.")
      return
    }

    if (editando) {
      startTransition(async () => {
        const res = await updateCampusMaterial({
          id: material.id,
          titulo,
          descripcion,
          tipo,
          url_externa: material.origen === "link" ? url : null,
        })
        if ("error" in res) {
          setError(res.error)
          return
        }
        onSaved()
        onCerrar()
      })
      return
    }

    if (modo === "link") {
      if (!esUrlValida(url)) {
        setError("El link tiene que empezar con http:// o https://")
        return
      }
      startTransition(async () => {
        const res = await registrarMaterialLink({
          capacitacion_id: capacitacionId,
          titulo,
          descripcion,
          tipo,
          url_externa: url,
        })
        if ("error" in res) {
          setError(res.error)
          return
        }
        onSaved()
        onCerrar()
      })
      return
    }

    void guardarArchivoNuevo()
  }

  const trabajando = pending || subiendo

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!editando && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setModo("archivo")}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
              modo === "archivo"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FileUp className="size-4" />
            Subir archivo
          </button>
          <button
            type="button"
            onClick={() => setModo("link")}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
              modo === "link"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Link2 className="size-4" />
            Link externo
          </button>
        </div>
      )}

      {!editando && modo === "archivo" && (
        <div className="space-y-1.5">
          <Label htmlFor="campus_mat_archivo">Archivo *</Label>
          <Input
            id="campus_mat_archivo"
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov,.m4v"
            onChange={elegirArchivo}
          />
          <p className="text-xs text-muted-foreground">
            PDF, Word, Excel, PowerPoint, imagen o video · hasta 200 MB. Para videos largos
            conviene subirlos a YouTube o Drive y pegar el link.
          </p>
          {archivo && (
            <p className="text-xs text-slate-500">
              {archivo.name} · {formatBytes(archivo.size)}
            </p>
          )}
        </div>
      )}

      {(modo === "link" || material?.origen === "link") && (
        <div className="space-y-1.5">
          <Label htmlFor="campus_mat_url">Link *</Label>
          <Input
            id="campus_mat_url"
            type="url"
            value={url}
            onChange={(e) => cambiarUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
          />
          <p className="text-xs text-muted-foreground">
            YouTube y Google Drive se ven adentro del Campus; el resto abre en una pestaña
            nueva.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="campus_mat_titulo">Título *</Label>
        <Input
          id="campus_mat_titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej.: Video — Manejo defensivo"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="campus_mat_tipo">Tipo</Label>
        {/* Select nativo: formulario corto que se usa desde el celular. */}
        <select
          id="campus_mat_tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
        >
          {CAMPUS_TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.emoji} {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="campus_mat_desc">Descripción</Label>
        <Textarea
          id="campus_mat_desc"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder="Opcional"
        />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={trabajando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={trabajando}>
          {trabajando && <Loader2 className="mr-2 size-4 animate-spin" />}
          {subiendo ? "Subiendo…" : editando ? "Guardar" : "Agregar"}
        </Button>
      </DialogFooter>
    </form>
  )
}
