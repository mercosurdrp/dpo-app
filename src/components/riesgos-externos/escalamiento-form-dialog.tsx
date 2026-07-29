"use client"

import { useState, useTransition } from "react"
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
import { guardarEscalamiento } from "@/actions/riesgos-externos-plan"
import {
  TIPO_RIESGO_EXTERNO_LABELS,
  type RiesgoExternoEscalamiento,
  type TipoRiesgoExterno,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tipoRiesgo: TipoRiesgoExterno
  nivel: RiesgoExternoEscalamiento | null
  /** Nivel sugerido cuando se agrega uno nuevo. */
  nivelSugerido: number
  onSaved: () => void
}

export function EscalamientoFormDialog({
  open,
  onOpenChange,
  tipoRiesgo,
  nivel,
  nivelSugerido,
  onSaved,
}: Props) {
  const editing = !!nivel
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Limpiar el error al abrir, ajustando el estado durante el render en vez de
  // en un efecto (react-hooks/set-state-in-effect).
  const [abiertoPrev, setAbiertoPrev] = useState(open)
  if (open !== abiertoPrev) {
    setAbiertoPrev(open)
    if (open) setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set("tipo_riesgo", tipoRiesgo)

    startTransition(async () => {
      const result = await guardarEscalamiento(nivel?.id ?? null, formData)
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
            {editing ? "Editar nivel de escalamiento" : "Nuevo nivel de escalamiento"}
            {" — "}
            {TIPO_RIESGO_EXTERNO_LABELS[tipoRiesgo]}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="nivel">Nivel *</Label>
              <Input
                id="nivel"
                name="nivel"
                type="number"
                min={1}
                max={5}
                defaultValue={nivel?.nivel ?? nivelSugerido}
                required
              />
              <p className="text-xs text-muted-foreground">
                1 = quien detecta y contiene.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rol">Quién actúa *</Label>
              <Input
                id="rol"
                name="rol"
                defaultValue={nivel?.rol ?? ""}
                placeholder="Ej: Supervisor de Depósito"
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="suplente">Suplente</Label>
              <Input
                id="suplente"
                name="suplente"
                defaultValue={nivel?.suplente ?? ""}
                placeholder="A quién se llama si no responde"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minutos_disparo">Se escala a los (minutos)</Label>
              <Input
                id="minutos_disparo"
                name="minutos_disparo"
                type="number"
                min={0}
                defaultValue={nivel?.minutos_disparo ?? ""}
                placeholder="0 = al instante · 1440 = 24 h"
              />
              <p className="text-xs text-muted-foreground">
                Minutos desde el inicio del evento. Vacío = sin plazo definido.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="disparador">Cuándo se escala *</Label>
            <Input
              id="disparador"
              name="disparador"
              defaultValue={nivel?.disparador ?? ""}
              placeholder="Ej: Si a los 30 min el generador no cubre la operación"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acciones">Qué hace este nivel</Label>
            <Textarea
              id="acciones"
              name="acciones"
              rows={3}
              defaultValue={nivel?.acciones ?? ""}
              placeholder="Decisiones y acciones concretas de este nivel"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

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
              {editing ? "Guardar cambios" : "Agregar nivel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
