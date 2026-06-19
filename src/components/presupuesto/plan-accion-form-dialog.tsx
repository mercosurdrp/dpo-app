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
  crearPlanAccion,
  actualizarPlanAccion,
} from "@/actions/presupuesto-planes-accion"
import type {
  EstadoPlanAccion,
  PlanAccionPresupuestoConDetalle,
  PresupuestoTareaConResponsable,
} from "@/types/database"
import { ESTADO_PLAN_OPCIONES, MESES_CORTOS } from "./planes-accion-constantes"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  anio: number
  plan?: PlanAccionPresupuestoConDetalle | null
  responsables: ResponsableOpt[]
  tareas: PresupuestoTareaConResponsable[]
  onSaved: () => void
}

const SIN_TAREA = "__sin__"

export function PlanAccionFormDialog({
  open,
  onOpenChange,
  anio,
  plan,
  responsables,
  tareas,
  onSaved,
}: Props) {
  const editing = !!plan
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [estado, setEstado] = useState<EstadoPlanAccion>(
    plan?.estado ?? "abierto",
  )
  const [responsableId, setResponsableId] = useState<string>(
    plan?.responsable_id ?? "",
  )
  const [tareaId, setTareaId] = useState<string>(plan?.tarea_id ?? SIN_TAREA)

  useEffect(() => {
    if (open) {
      setEstado(plan?.estado ?? "abierto")
      setResponsableId(plan?.responsable_id ?? "")
      setTareaId(plan?.tarea_id ?? SIN_TAREA)
      setError(null)
    }
  }, [open, plan])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("anio", String(anio))
    formData.set("estado", estado)
    if (responsableId) formData.set("responsable_id", responsableId)
    else formData.delete("responsable_id")
    if (tareaId && tareaId !== SIN_TAREA) formData.set("tarea_id", tareaId)
    else formData.delete("tarea_id")

    startTransition(async () => {
      const result = editing
        ? await actualizarPlanAccion(plan!.id, formData)
        : await crearPlanAccion(formData)
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? "Editar plan de acción"
              : `Nuevo plan de acción — ${anio}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              name="titulo"
              defaultValue={plan?.titulo ?? ""}
              placeholder="Ej. Sobrecosto en contratación de flota"
              required
            />
          </div>

          {/* Vínculo a la tarea de análisis del desvío */}
          <div className="space-y-1.5">
            <Label>Tarea de análisis vinculada</Label>
            <Select
              value={tareaId}
              onValueChange={(v: string | null) => setTareaId(v ?? SIN_TAREA)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin vincular" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_TAREA}>Sin vincular</SelectItem>
                {tareas.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {MESES_CORTOS[t.mes - 1]} · {t.rubro}
                    {t.desvio_pct !== null
                      ? ` (${t.desvio_pct > 0 ? "+" : ""}${t.desvio_pct.toFixed(1)}%)`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Colgá el plan del desvío que se está analizando en el presupuesto
              del año {anio}.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desvio_detectado">Desvío detectado</Label>
            <Textarea
              id="desvio_detectado"
              name="desvio_detectado"
              rows={2}
              defaultValue={plan?.desvio_detectado ?? ""}
              placeholder="Qué desvío significativo se detectó y por qué hay que trabajarlo…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="causa_raiz">Causa raíz</Label>
            <Textarea
              id="causa_raiz"
              name="causa_raiz"
              rows={2}
              defaultValue={plan?.causa_raiz ?? ""}
              placeholder="Por qué se produjo el desvío (análisis de causa)…"
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
                defaultValue={plan?.fecha_limite ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              value={estado}
              onValueChange={(v: string | null) =>
                setEstado((v as EstadoPlanAccion) ?? "abierto")
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADO_PLAN_OPCIONES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              name="observaciones"
              rows={2}
              defaultValue={plan?.observaciones ?? ""}
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
              {editing ? "Guardar cambios" : "Crear plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
