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
import { crearPaso, actualizarPaso } from "@/actions/presupuesto-planes-accion"
import type {
  EstadoPasoPlanAccion,
  PlanAccionPresupuestoConDetalle,
  PlanAccionPaso,
} from "@/types/database"
import { ESTADO_PASO_OPCIONES } from "./planes-accion-constantes"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PlanAccionPresupuestoConDetalle
  paso?: PlanAccionPaso | null
  responsables: ResponsableOpt[]
  onSaved: () => void
}

export function PasoPlanAccionDialog({
  open,
  onOpenChange,
  plan,
  paso,
  responsables,
  onSaved,
}: Props) {
  const editing = !!paso
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [estado, setEstado] = useState<EstadoPasoPlanAccion>(
    paso?.estado ?? "pendiente",
  )
  const [responsableId, setResponsableId] = useState<string>(
    paso?.responsable_id ?? "",
  )

  useEffect(() => {
    if (open) {
      setEstado(paso?.estado ?? "pendiente")
      setResponsableId(paso?.responsable_id ?? "")
      setError(null)
    }
  }, [open, paso])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("plan_id", plan.id)
    formData.set("estado", estado)
    if (responsableId) formData.set("responsable_id", responsableId)
    else formData.delete("responsable_id")
    // Mantener el orden existente al editar; las nuevas van al final
    if (editing) {
      formData.set("orden", String(paso!.orden))
    } else {
      const maxOrden = plan.pasos.reduce(
        (m, p) => Math.max(m, p.orden),
        0,
      )
      formData.set("orden", String(maxOrden + 1))
    }

    startTransition(async () => {
      const result = editing
        ? await actualizarPaso(paso!.id, formData)
        : await crearPaso(formData)
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
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar acción" : "Nueva acción"}</DialogTitle>
        </DialogHeader>

        <p className="-mt-1 line-clamp-1 text-sm text-muted-foreground">
          {plan.titulo}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="que">Acción — qué se va a hacer *</Label>
            <Textarea
              id="que"
              name="que"
              rows={2}
              defaultValue={paso?.que ?? ""}
              placeholder="Ej. Renegociar la tarifa con el transportista"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="como">Cómo</Label>
            <Textarea
              id="como"
              name="como"
              rows={2}
              defaultValue={paso?.como ?? ""}
              placeholder="Cómo se va a ejecutar la acción…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select
                value={responsableId}
                onValueChange={(v: string | null) => setResponsableId(v ?? "")}
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
              <Label htmlFor="fecha_limite">Fecha límite</Label>
              <Input
                id="fecha_limite"
                name="fecha_limite"
                type="date"
                defaultValue={paso?.fecha_limite ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              value={estado}
              onValueChange={(v: string | null) =>
                setEstado((v as EstadoPasoPlanAccion) ?? "pendiente")
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADO_PASO_OPCIONES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="avance">Avance / seguimiento</Label>
            <Textarea
              id="avance"
              name="avance"
              rows={2}
              defaultValue={paso?.avance ?? ""}
              placeholder="Qué se hizo, qué falta, comentarios…"
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
              {editing ? "Guardar cambios" : "Agregar acción"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
