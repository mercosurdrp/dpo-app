"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { format } from "date-fns"
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileCheck,
  Loader2,
  ShieldAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
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

type Preset = "1w" | "1m" | "custom"

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function plusDays(days: number): string {
  return ymd(new Date(Date.now() + days * 86400000))
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

  // Seguimiento
  const [seguir, setSeguir] = useState(false)
  const [preset, setPreset] = useState<Preset>("1w")
  const [customDate, setCustomDate] = useState<string>(plusDays(7))

  const fechaSeguimiento =
    preset === "1w" ? plusDays(7) : preset === "1m" ? plusDays(30) : customDate

  const fechaSeguimientoLabel = (() => {
    if (!fechaSeguimiento) return "—"
    try {
      return format(new Date(fechaSeguimiento + "T00:00:00"), "dd/MM/yyyy")
    } catch {
      return fechaSeguimiento
    }
  })()

  const tieneEvidencias = totalEvidencias > 0
  const necesitaEvidencia = evidenciaObligatoria && !tieneEvidencias
  const bloqueadoNoAdmin = necesitaEvidencia && !esAdmin
  const requiereMotivo = necesitaEvidencia && esAdmin && sinEvidencia

  const canSubmit = (() => {
    if (pending) return false
    if (bloqueadoNoAdmin) return false
    if (seguir && !fechaSeguimiento) return false
    if (necesitaEvidencia && esAdmin) {
      return sinEvidencia && motivo.trim().length > 0
    }
    return true
  })()

  function handleSubmit() {
    startTransition(async () => {
      const opts: {
        sinEvidencia?: boolean
        motivoSinEvidencia?: string
        seguimiento?: { fecha_limite: string }
      } = {}
      if (necesitaEvidencia && esAdmin && sinEvidencia) {
        opts.sinEvidencia = true
        opts.motivoSinEvidencia = motivo.trim()
      }
      if (seguir && fechaSeguimiento) {
        opts.seguimiento = { fecha_limite: fechaSeguimiento }
      }
      const res = await cerrarPlan(planId, opts)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      onOpenChange(false)
      onDone?.()
      if (res.seguimientoId) {
        toast.success("Tarea cerrada · seguimiento creado")
        router.push(`/planes/${res.seguimientoId}`)
      } else {
        toast.success("Plan cerrado")
        router.refresh()
      }
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
              El plan tiene <span className="font-semibold">{totalEvidencias}</span>{" "}
              {totalEvidencias === 1 ? "respuesta" : "respuestas"} (comentarios
              o archivos). ¿Querés cerrar el plan?
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
                  Este plan tiene que estar respondido. Cargá un comentario o
                  archivo en el Action Log antes de cerrarlo.
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="text-sm text-amber-900">
                    Este plan todavía no tiene ninguna respuesta (comentario o
                    archivo). Como admin podés cerrarlo igualmente, dejando un
                    motivo.
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-2">
                  <Checkbox
                    checked={sinEvidencia}
                    onCheckedChange={(v) => setSinEvidencia(v)}
                    disabled={pending}
                  />
                  <span className="text-sm text-slate-700">
                    Cerrar sin respuesta
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
            Este plan no exige respuesta para cerrarse. ¿Cerrar plan?
          </div>
        )}

        {/* Seguimiento: crear tarea nueva al cerrar */}
        {!bloqueadoNoAdmin && (
          <div className="space-y-3 rounded-md border border-slate-200 p-3">
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox
                checked={seguir}
                onCheckedChange={(v) => setSeguir(v === true)}
                disabled={pending}
              />
              <span className="text-sm font-medium text-slate-700">
                Crear tarea de seguimiento
                <span className="block text-[11px] font-normal text-muted-foreground">
                  Genera una tarea nueva (hereda título, descripción y
                  responsables) con una nueva fecha. Esta tarea queda cerrada.
                </span>
              </span>
            </label>

            {seguir && (
              <div className="space-y-2 pl-6">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreset("1w")}
                    disabled={pending}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      preset === "1w"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    +1 semana
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreset("1m")}
                    disabled={pending}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      preset === "1m"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    +1 mes
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreset("custom")}
                    disabled={pending}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      preset === "custom"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Fecha
                  </button>
                </div>
                {preset === "custom" && (
                  <Input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    disabled={pending}
                  />
                )}
                <div className="flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Nueva tarea con vencimiento{" "}
                  <span className="font-semibold">{fechaSeguimientoLabel}</span>
                </div>
              </div>
            )}
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
            ) : seguir ? (
              "Cerrar y crear seguimiento"
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
