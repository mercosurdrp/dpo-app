"use client"

import { useRef } from "react"
import { Paperclip, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

interface Props {
  archivos: File[]
  onChange: (archivos: File[]) => void
  label?: string
  ayuda?: string
}

/**
 * Selector de archivos nuevos con pegado Ctrl+V, para formularios que no
 * editan adjuntos ya subidos (los avances son append-only).
 */
export function AdjuntosPicker({
  archivos,
  onChange,
  label = "Archivos adjuntos",
  ayuda,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? [])
    const imagenes: File[] = []
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue
      const file = item.getAsFile()
      if (!file) continue
      const ext = file.type.split("/")[1] || "png"
      const stamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .slice(0, 14)
      imagenes.push(
        new File([file], `captura-${stamp}.${ext}`, { type: file.type }),
      )
    }
    if (imagenes.length) {
      e.preventDefault()
      onChange([...archivos, ...imagenes])
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        tabIndex={0}
        onPaste={handlePaste}
        className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        {archivos.length > 0 && (
          <ul className="space-y-1">
            {archivos.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md bg-blue-50 px-2 py-1 text-sm"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
                  <Paperclip className="size-3.5 shrink-0" />
                  <span className="truncate">{file.name}</span>
                </span>
                <button
                  type="button"
                  title="Quitar adjunto"
                  onClick={() => onChange(archivos.filter((_, j) => j !== i))}
                  className="shrink-0 text-slate-400 hover:text-red-600"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="mr-1.5 size-3.5" />
            Agregar archivos
          </Button>
          <span className="text-xs text-muted-foreground">
            o pegá una captura con Ctrl+V
          </span>
        </div>
        {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onChange([...archivos, ...Array.from(e.target.files ?? [])])
            e.target.value = ""
          }}
        />
      </div>
    </div>
  )
}
