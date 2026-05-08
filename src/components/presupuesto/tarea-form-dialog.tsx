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
import { actualizarTarea, crearTarea } from "@/actions/presupuesto"
import type { PresupuestoTareaConResponsable } from "@/types/database"

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  anio: number
  defaultMes?: number
  tarea?: PresupuestoTareaConResponsable | null
  responsables: ResponsableOpt[]
  onSaved: () => void
}

export function TareaFormDialog({
  open,
  onOpenChange,
  anio,
  defaultMes,
  tarea,
  responsables,
  onSaved,
}: Props) {
  const editing = !!tarea
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const mesPorDefecto = String(defaultMes ?? new Date().getMonth() + 1)
  const [mes, setMes] = useState<string>(
    tarea ? String(tarea.mes) : mesPorDefecto,
  )
  const [responsableId, setResponsableId] = useState<string>(
    tarea?.responsable_id ?? "",
  )

  useEffect(() => {
    if (open) {
      setMes(
        tarea
          ? String(tarea.mes)
          : String(defaultMes ?? new Date().getMonth() + 1),
      )
      setResponsableId(tarea?.responsable_id ?? "")
      setError(null)
    }
  }, [open, tarea, defaultMes])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!mes) {
      setError("Seleccioná un mes.")
      return
    }

    const formData = new FormData(e.currentTarget)
    formData.set("anio", String(anio))
    formData.set("mes", mes)
    if (responsableId) formData.set("responsable_id", responsableId)
    else formData.delete("responsable_id")

    startTransition(async () => {
      const result = editing
        ? await actualizarTarea(tarea!.id, formData)
        : await crearTarea(formData)
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
            {editing ? "Editar tarea" : `Nueva tarea — ${anio}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mes *</Label>
              <Select
                value={mes}
                onValueChange={(v: string | null) => setMes(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar mes…" />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((nom, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rubro">Rubro *</Label>
              <Input
                id="rubro"
                name="rubro"
                defaultValue={tarea?.rubro ?? ""}
                placeholder="Ej. Combustible flota"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="monto_presupuestado">Presupuestado</Label>
              <Input
                id="monto_presupuestado"
                name="monto_presupuestado"
                type="number"
                step="0.01"
                defaultValue={tarea?.monto_presupuestado ?? ""}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monto_real">Real</Label>
              <Input
                id="monto_real"
                name="monto_real"
                type="number"
                step="0.01"
                defaultValue={tarea?.monto_real ?? ""}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción / motivo del desvío</Label>
            <Textarea
              id="descripcion"
              name="descripcion"
              rows={2}
              defaultValue={tarea?.descripcion ?? ""}
              placeholder="Qué se debe analizar / contexto del desvío…"
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
              <Label htmlFor="fecha_limite">Vencimiento</Label>
              <Input
                id="fecha_limite"
                name="fecha_limite"
                type="date"
                defaultValue={tarea?.fecha_limite ?? ""}
              />
            </div>
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
              {editing ? "Guardar cambios" : "Crear tarea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
