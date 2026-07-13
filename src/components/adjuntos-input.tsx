"use client"

import { useEffect } from "react"
import { FileText, Upload, X } from "lucide-react"
import { toast } from "sonner"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  archivos: File[]
  onChange: (archivos: File[]) => void
  /** Escucha el pegado (Ctrl+V) mientras esté activo, típicamente el dialog abierto. */
  activo?: boolean
  accept?: string
  disabled?: boolean
}

/**
 * Selector de N archivos: elegir varios, pegar capturas con Ctrl+V (se agregan,
 * no se pisan) y sacarlos de a uno antes de enviar.
 */
export function AdjuntosInput({
  archivos,
  onChange,
  activo = true,
  accept,
  disabled,
}: Props) {
  useEffect(() => {
    if (!activo || disabled) return
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return
      const imgs = Array.from(e.clipboardData.items).filter((it) =>
        it.type.startsWith("image/"),
      )
      if (imgs.length === 0) return
      const nuevos = imgs
        .map((it) => it.getAsFile())
        .filter((b): b is File => b !== null)
        .map((blob, i) => {
          const ext = blob.type.split("/")[1] || "png"
          return new File([blob], `captura-${Date.now()}-${i}.${ext}`, {
            type: blob.type,
          })
        })
      if (nuevos.length === 0) return
      onChange([...archivos, ...nuevos])
      toast.success(
        nuevos.length === 1
          ? "Captura pegada"
          : `${nuevos.length} capturas pegadas`,
      )
      e.preventDefault()
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [activo, disabled, archivos, onChange])

  return (
    <div className="space-y-2">
      {archivos.length > 0 && (
        <ul className="space-y-1">
          {archivos.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="truncate text-sm text-slate-700">{f.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatBytes(f.size)}
                </span>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(archivos.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-red-500"
                aria-label={`Quitar ${f.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 py-4 text-sm text-slate-500 hover:bg-slate-100">
        <Upload className="h-4 w-4" />
        {archivos.length > 0
          ? "Agregar más archivos"
          : "Elegí archivos o pegá capturas"}
        <input
          type="file"
          multiple
          accept={accept}
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            const nuevos = Array.from(e.target.files ?? [])
            if (nuevos.length > 0) onChange([...archivos, ...nuevos])
            e.target.value = ""
          }}
        />
      </label>
    </div>
  )
}
