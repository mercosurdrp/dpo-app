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
import { subirEerrAnual } from "@/actions/presupuesto"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  anio: number
  tieneArchivo: boolean
  defaultObservaciones?: string
  onSaved: () => void
}

export function SubirEerrAnualDialog({
  open,
  onOpenChange,
  anio,
  tieneArchivo,
  defaultObservaciones,
  onSaved,
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
    formData.set("anio", String(anio))

    const file = formData.get("archivo") as File | null
    if (!file || file.size === 0) {
      setError("Debés seleccionar un archivo.")
      return
    }

    startTransition(async () => {
      const result = await subirEerrAnual(formData)
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
            {tieneArchivo
              ? `Reemplazar Estado de Resultado ${anio}`
              : `Subir Estado de Resultado ${anio}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="eerr_archivo">Archivo *</Label>
            <Input
              id="eerr_archivo"
              name="archivo"
              type="file"
              accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.doc,.docx"
              required
            />
            <p className="text-xs text-muted-foreground">
              El archivo contiene los meses del año adentro. Se sube uno solo y
              se va pisando con cada actualización.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="eerr_obs">Observaciones</Label>
            <Textarea
              id="eerr_obs"
              name="observaciones"
              rows={2}
              defaultValue={defaultObservaciones ?? ""}
              placeholder="Mes de corte, versión, etc."
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
              {tieneArchivo ? "Reemplazar" : "Subir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
