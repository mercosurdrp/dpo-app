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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  actualizarActividad,
  crearActividad,
} from "@/actions/reuniones"
import type { ReunionActividadConResponsable } from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  reunionId: string
  actividad?: ReunionActividadConResponsable | null
  responsables: ResponsableOpt[]
  onSaved: () => void
}

export function ActividadFormDialog({
  open,
  onOpenChange,
  reunionId,
  actividad,
  responsables,
  onSaved,
}: Props) {
  const editing = !!actividad
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [responsableId, setResponsableId] = useState<string>(
    actividad?.responsable_id ?? "",
  )

  useEffect(() => {
    if (open) {
      setError(null)
      setResponsableId(actividad?.responsable_id ?? "")
    }
  }, [open, actividad])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)

    if (!editing) {
      formData.set("reunion_id", reunionId)
    }
    if (responsableId) formData.set("responsable_id", responsableId)
    else formData.delete("responsable_id")

    const desc = ((formData.get("descripcion") as string | null) ?? "").trim()
    if (!desc) {
      setError("La descripción es obligatoria.")
      return
    }

    startTransition(async () => {
      const result = editing
        ? await actualizarActividad(actividad!.id, formData)
        : await crearActividad(formData)
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
          <DialogTitle>
            {editing ? "Editar actividad" : "Nueva actividad"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="act_descripcion">Descripción *</Label>
            <Textarea
              id="act_descripcion"
              name="descripcion"
              rows={3}
              defaultValue={actividad?.descripcion ?? ""}
              placeholder="¿Qué hay que hacer?"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="act_motivo">Motivo / origen</Label>
            <Input
              id="act_motivo"
              name="motivo"
              defaultValue={actividad?.motivo ?? ""}
              placeholder="Por qué surge esta actividad…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select
                value={responsableId}
                onValueChange={(v: string | null) =>
                  setResponsableId(v ?? "")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  {responsables.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="act_fecha">Vencimiento</Label>
              <Input
                id="act_fecha"
                name="fecha_compromiso"
                type="date"
                defaultValue={actividad?.fecha_compromiso ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="act_obs">Observaciones</Label>
            <Textarea
              id="act_obs"
              name="observaciones"
              rows={2}
              defaultValue={actividad?.observaciones ?? ""}
              placeholder="Notas / contexto…"
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
              {editing ? "Guardar cambios" : "Crear actividad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
