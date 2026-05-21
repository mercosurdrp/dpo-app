"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ResponsablesMultiPicker } from "@/components/planes/responsables-multi-picker"
import { updatePlanAccion } from "@/actions/gestion"
import { PRIORIDAD_LABELS } from "@/lib/constants"
import type { PlanAccionFull, PrioridadPlan } from "@/types/database"

interface Props {
  plan: PlanAccionFull
  canEditResponsables: boolean
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved?: () => void
}

export function EditarPlanDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        {props.open && <EditarPlanForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function EditarPlanForm({
  plan,
  canEditResponsables,
  onOpenChange,
  onSaved,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [titulo, setTitulo] = useState(plan.titulo ?? "")
  const [descripcion, setDescripcion] = useState(plan.descripcion ?? "")
  const [fechaInicio, setFechaInicio] = useState(plan.fecha_inicio ?? "")
  const [fechaLimite, setFechaLimite] = useState(plan.fecha_limite ?? "")
  const [prioridad, setPrioridad] = useState<PrioridadPlan>(plan.prioridad)
  const [progreso, setProgreso] = useState(plan.progreso)
  const [notas, setNotas] = useState(plan.notas ?? "")

  function handleSave() {
    if (!descripcion.trim()) {
      toast.error("La descripción es requerida")
      return
    }
    startTransition(async () => {
      const res = await updatePlanAccion(plan.id, {
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        fecha_inicio: fechaInicio || undefined,
        fecha_limite: fechaLimite || undefined,
        prioridad,
        progreso,
        notas: notas.trim() || undefined,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Plan actualizado")
      onSaved?.()
      router.refresh()
      onOpenChange(false)
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar Plan de Acción</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="ed-titulo">Título</Label>
          <Input
            id="ed-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título de la tarea"
            maxLength={120}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="ed-desc">Descripción</Label>
          <Textarea
            id="ed-desc"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ed-fi">Fecha inicio</Label>
            <Input
              id="ed-fi"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ed-fl">Fecha límite</Label>
            <Input
              id="ed-fl"
              type="date"
              value={fechaLimite}
              onChange={(e) => setFechaLimite(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Prioridad</Label>
            <Select
              value={prioridad}
              onValueChange={(v) => v && setPrioridad(v as PrioridadPlan)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["alta", "media", "baja"] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORIDAD_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Progreso: {progreso}%</Label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progreso}
              onChange={(e) => setProgreso(Number(e.target.value))}
              className="mt-2 w-full accent-blue-600"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="ed-notas">Notas</Label>
          <Textarea
            id="ed-notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas opcionales…"
            className="min-h-12"
          />
        </div>

        {/* Responsables: se guardan al instante (no esperan al botón Guardar) */}
        <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Users className="h-4 w-4" />
            Responsables
          </div>
          <ResponsablesMultiPicker
            planId={plan.id}
            responsables={plan.responsables ?? []}
            canEdit={canEditResponsables}
            onChange={() => router.refresh()}
          />
          {!canEditResponsables && (
            <p className="text-[11px] text-muted-foreground">
              Sólo admin o auditor pueden cambiar los responsables.
            </p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Guardar cambios
        </Button>
      </DialogFooter>
    </>
  )
}

export default EditarPlanDialog
