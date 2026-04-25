"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  Loader2,
  ShieldAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cerrarPlan } from "@/actions/planes"

interface Props {
  planId: string
  evidenciaObligatoria: boolean
  totalEvidencias: number
  esAdmin: boolean
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone?: () => void
}

export function CerrarPlanDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mount form only when open so internal state resets cleanly. */}
        {props.open && <CerrarPlanForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function CerrarPlanForm({
  planId,
  evidenciaObligatoria,
  totalEvidencias,
  esAdmin,
  onOpenChange,
  onDone,
}: Props) {
  const router = useRouter()
  const [sinEvidencia, setSinEvidencia] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [pending, startTransition] = useTransition()

  const tieneEvidencias = totalEvidencias > 0
  const necesitaEvidencia = evidenciaObligatoria && !tieneEvidencias
  const bloqueadoNoAdmin = necesitaEvidencia && !esAdmin
  const requiereMotivo = necesitaEvidencia && esAdmin && sinEvidencia

  const canSubmit = (() => {
    if (pending) return false
    if (bloqueadoNoAdmin) return false
    if (necesitaEvidencia && esAdmin) {
      return sinEvidencia && motivo.trim().length > 0
    }
    return true
  })()

  function handleSubmit() {
    startTransition(async () => {
      const opts: { sinEvidencia?: boolean; motivoSinEvidencia?: string } = {}
      if (necesitaEvidencia && esAdmin && sinEvidencia) {
        opts.sinEvidencia = true
        opts.motivoSinEvidencia = motivo.trim()
      }
      const res = await cerrarPlan(planId, opts)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Plan cerrado")
      onOpenChange(false)
      onDone?.()
      router.refresh()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Cerrar plan
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Caso 1: hay evidencias */}
        {tieneEvidencias && (
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <FileCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="text-sm text-emerald-900">
              Hay <span className="font-semibold">{totalEvidencias}</span>{" "}
              {totalEvidencias === 1
                ? "evidencia vinculada"
                : "evidencias vinculadas"}
              . ¿Querés cerrar el plan?
            </div>
          </div>
        )}

        {/* Caso 2: no hay evidencias y son obligatorias */}
        {necesitaEvidencia && (
          <>
            {bloqueadoNoAdmin ? (
              <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div className="text-sm text-red-800">
                  Este plan requiere evidencia. Subí al menos una antes de
                  cerrarlo.
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="text-sm text-amber-900">
                    Este plan requiere evidencia y no hay ninguna vinculada.
                    Como admin podés cerrarlo igualmente, dejando un motivo.
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-2">
                  <Checkbox
                    checked={sinEvidencia}
                    onCheckedChange={(v) => setSinEvidencia(v)}
                    disabled={pending}
                  />
                  <span className="text-sm text-slate-700">
                    Cerrar sin evidencia
                  </span>
                </label>

                {sinEvidencia && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cerrar-motivo"
                      className="text-xs text-muted-foreground"
                    >
                      Motivo (obligatorio)
                    </Label>
                    <Textarea
                      id="cerrar-motivo"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Justificá por qué se cierra sin evidencia…"
                      className="min-h-16"
                      disabled={pending}
                    />
                    {requiereMotivo && motivo.trim().length === 0 && (
                      <p className="text-xs text-red-600">
                        El motivo es obligatorio.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Caso 3: no obligatoria, no hay evidencias → cierre directo */}
        {!tieneEvidencias && !evidenciaObligatoria && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Este plan no requiere evidencia. ¿Cerrar plan?
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancelar
        </Button>
        {!bloqueadoNoAdmin && (
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Cerrando…
              </>
            ) : (
              "Cerrar plan"
            )}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

export default CerrarPlanDialog
