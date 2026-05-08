"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
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
import { actualizarReunion } from "@/actions/reuniones"
import type { Reunion } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  reunion: Reunion
  onSaved: () => void
}

export function EditarReunionDialog({
  open,
  onOpenChange,
  reunion,
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

    const fecha = (formData.get("fecha") as string | null) ?? ""
    if (!fecha) {
      setError("La fecha es obligatoria.")
      return
    }

    startTransition(async () => {
      const result = await actualizarReunion(reunion.id, formData)
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
          <DialogTitle>Editar reunión</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit_fecha">Fecha *</Label>
            <Input
              id="edit_fecha"
              name="fecha"
              type="date"
              defaultValue={reunion.fecha}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_agenda">Agenda</Label>
            <Textarea
              id="edit_agenda"
              name="agenda"
              rows={3}
              defaultValue={reunion.agenda ?? ""}
              placeholder="Temas a tratar…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_notas">Notas / Minuta</Label>
            <Textarea
              id="edit_notas"
              name="notas"
              rows={3}
              defaultValue={reunion.notas ?? ""}
              placeholder="Minuta de la reunión…"
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
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
