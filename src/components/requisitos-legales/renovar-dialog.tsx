"use client"

import { useState, useTransition } from "react"
import { Loader2, RefreshCw } from "lucide-react"
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
import { renovarRequisito } from "@/actions/requisitos-legales"
import type { RequisitoLegalConResponsable } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  requisito: RequisitoLegalConResponsable | null
  onSaved: () => void
}

export function RenovarDialog({ open, onOpenChange, requisito, onSaved }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!requisito) return null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await renovarRequisito(requisito!.id, formData)
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
            <RefreshCw className="size-5 text-blue-600" />
            Renovar: {requisito.nombre}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fecha_emision_r">Nueva emisión *</Label>
              <Input
                id="fecha_emision_r"
                name="fecha_emision"
                type="date"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fecha_vencimiento_r">Nuevo vencimiento *</Label>
              <Input
                id="fecha_vencimiento_r"
                name="fecha_vencimiento"
                type="date"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="archivo_r">Archivo de la renovación *</Label>
            <Input
              id="archivo_r"
              name="archivo"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              required
            />
            <p className="text-xs text-muted-foreground">
              El archivo anterior se reemplaza.
            </p>
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
              Renovar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
