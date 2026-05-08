"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, Users } from "lucide-react"
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
import { crearReunion } from "@/actions/reuniones"
import type { TipoReunion } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tipo: TipoReunion
  tipoLabel: string
  onSaved: () => void
}

export function NuevaReunionDialog({
  open,
  onOpenChange,
  tipo,
  tipoLabel,
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
    formData.set("tipo", tipo)

    const fecha = (formData.get("fecha") as string | null) ?? ""
    if (!fecha) {
      setError("La fecha es obligatoria.")
      return
    }

    startTransition(async () => {
      const result = await crearReunion(formData)
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva reunión — {tipoLabel}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fecha">Fecha *</Label>
            <Input id="fecha" name="fecha" type="date" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agenda">Agenda</Label>
            <Textarea
              id="agenda"
              name="agenda"
              rows={3}
              placeholder="Temas a tratar…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Textarea
              id="notas"
              name="notas"
              rows={2}
              placeholder="Notas / minuta inicial (opcional)…"
            />
          </div>

          <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
            <Users className="mt-0.5 size-4 shrink-0 text-blue-600" />
            <span>
              Los participantes se asignan automáticamente según la lista
              configurada para este tipo de reunión.
            </span>
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
              Crear reunión
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
