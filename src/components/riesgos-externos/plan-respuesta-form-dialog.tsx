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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { guardarPlanRespuesta } from "@/actions/riesgos-externos-plan"
import {
  TIPO_RIESGO_EXTERNO_LABELS,
  type RiesgoExternoConfig,
  type TipoRiesgoExterno,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tipoRiesgo: TipoRiesgoExterno
  config: RiesgoExternoConfig | null
  onSaved: () => void
}

export function PlanRespuestaFormDialog({
  open,
  onOpenChange,
  tipoRiesgo,
  config,
  onSaved,
}: Props) {
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

    startTransition(async () => {
      const result = await guardarPlanRespuesta(tipoRiesgo, formData)
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
            Plan de respuesta — {TIPO_RIESGO_EXTERNO_LABELS[tipoRiesgo]}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Los tres temas que exige el requisito R2.2.2 del punto DPO
            Planeamiento 2.2.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="plan_nivel_servicio">Nivel de servicio</Label>
            <Textarea
              id="plan_nivel_servicio"
              name="plan_nivel_servicio"
              rows={3}
              defaultValue={config?.plan_nivel_servicio ?? ""}
              placeholder="Qué se prioriza para sostener la entrega al cliente durante el evento"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan_mano_obra">Mano de obra</Label>
            <Textarea
              id="plan_mano_obra"
              name="plan_mano_obra"
              rows={3}
              defaultValue={config?.plan_mano_obra ?? ""}
              placeholder="Convocatoria, reasignación entre almacén y entrega, horas extra, licencias"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan_ajuste_pronostico">Ajuste de pronóstico</Label>
            <Textarea
              id="plan_ajuste_pronostico"
              name="plan_ajuste_pronostico"
              rows={3}
              defaultValue={config?.plan_ajuste_pronostico ?? ""}
              placeholder="Qué pasa con la preventa del día, el ruteo y el pedido a planta"
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
              Guardar plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
