"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { updateAccion, reprogramarAccion } from "@/actions/acciones"

type TipoCierre = "definitivo" | "reprogramar"
type Preset = "1w" | "1m" | "custom"

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function plusDays(days: number): string {
  return ymd(new Date(Date.now() + days * 86400000))
}

function fechaCorta(fecha: string | null): string {
  if (!fecha) return "—"
  const [y, m, d] = fecha.split("-")
  return `${d}/${m}/${y}`
}

interface Props {
  accion: { id: string; descripcion: string; fecha_limite: string } | null
  onOpenChange: (v: boolean) => void
  onDone: () => void
}

export function CerrarAccionDialog({ accion, onOpenChange, onDone }: Props) {
  return (
    <Dialog open={accion !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mount form only when open so internal state resets cleanly. */}
        {accion && (
          <CerrarAccionForm
            accion={accion}
            onOpenChange={onOpenChange}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CerrarAccionForm({
  accion,
  onOpenChange,
  onDone,
}: Props & { accion: NonNullable<Props["accion"]> }) {
  const [tipoCierre, setTipoCierre] = useState<TipoCierre>("definitivo")
  const [preset, setPreset] = useState<Preset>("1w")
  const [customDate, setCustomDate] = useState<string>(plusDays(7))
  const [motivo, setMotivo] = useState("")
  const [pending, startTransition] = useTransition()

  const fechaNueva =
    preset === "1w" ? plusDays(7) : preset === "1m" ? plusDays(30) : customDate

  function handleSubmit() {
    startTransition(async () => {
      if (tipoCierre === "definitivo") {
        const result = await updateAccion(accion.id, { estado: "completado" })
        if ("error" in result) {
          toast.error(result.error)
          return
        }
        toast.success("Acción cerrada")
      } else {
        if (!fechaNueva) {
          toast.error("Seleccioná una fecha")
          return
        }
        const result = await reprogramarAccion(
          accion.id,
          fechaNueva,
          motivo.trim() || null
        )
        if ("error" in result) {
          toast.error(result.error)
          return
        }
        toast.success("Acción reprogramada")
      }
      onOpenChange(false)
      onDone()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Cerrar acción
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <p className="line-clamp-2 text-sm text-slate-700">
          {accion.descripcion}
        </p>
        <p className="text-xs text-muted-foreground">
          Fecha límite actual:{" "}
          <span className="font-medium text-slate-700">
            {fechaCorta(accion.fecha_limite)}
          </span>
        </p>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            ¿Cómo se cierra?
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipoCierre("definitivo")}
              disabled={pending}
              className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                tipoCierre === "definitivo"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Cierre definitivo
            </button>
            <button
              type="button"
              onClick={() => setTipoCierre("reprogramar")}
              disabled={pending}
              className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                tipoCierre === "reprogramar"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Reprogramar
            </button>
          </div>
        </div>

        {tipoCierre === "reprogramar" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["1w", "+1 semana"],
                  ["1m", "+1 mes"],
                  ["custom", "Fecha"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPreset(val)}
                  disabled={pending}
                  className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    preset === val
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
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
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              <span>
                La acción sigue abierta con nueva fecha límite{" "}
                <span className="font-semibold">{fechaCorta(fechaNueva)}</span>
              </span>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="cerrar-accion-motivo"
                className="text-xs text-muted-foreground"
              >
                Motivo (opcional)
              </Label>
              <Textarea
                id="cerrar-accion-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="¿Por qué se reprograma?"
                className="min-h-16"
                disabled={pending}
              />
            </div>
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
        <Button onClick={handleSubmit} disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {tipoCierre === "definitivo"
            ? "Cerrar acción"
            : "Confirmar reprogramación"}
        </Button>
      </DialogFooter>
    </>
  )
}
