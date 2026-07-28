"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, Upload } from "lucide-react"
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
import { subirArchivoReunion } from "@/actions/reuniones"

/** Tope propio, por debajo del límite de 4,5 MB del request en Vercel. */
const MAX_BYTES = 4 * 1024 * 1024

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  reunionId: string
  onSaved: () => void
  /** Título del diálogo (por defecto, genérico). */
  titulo?: string
}

export function SubirArchivoReunionDialog({
  open,
  onOpenChange,
  reunionId,
  onSaved,
  titulo = "Subir archivo a la reunión",
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("reunion_id", reunionId)

    const file = formData.get("archivo") as File | null
    if (!file || file.size === 0) {
      setError("Debés seleccionar un archivo.")
      return
    }
    // El archivo viaja por la server action, y Vercel corta los request de más
    // de 4,5 MB con un 413 sin mensaje. Avisamos antes con el peso real.
    if (file.size > MAX_BYTES) {
      setError(
        `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es 4 MB. ` +
          "Si es una foto, sacala con menos calidad o mandala como PDF.",
      )
      return
    }

    startTransition(async () => {
      const result = await subirArchivoReunion(formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-5 text-blue-600" />
            {titulo}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reunion_archivo">Archivo *</Label>
            <Input
              id="reunion_archivo"
              name="archivo"
              type="file"
              accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.doc,.docx,.ppt,.pptx"
              required
            />
            <p className="text-xs text-muted-foreground">
              PDF, Word, Excel, PowerPoint o imagen · hasta 4 MB
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reunion_archivo_desc">Descripción</Label>
            <Textarea
              id="reunion_archivo_desc"
              name="descripcion"
              rows={2}
              placeholder="Descripción del archivo (opcional)…"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Subir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
