"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { format } from "date-fns"
import { CalendarClock, Loader2 } from "lucide-react"
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
import { reprogramarPlan } from "@/actions/planes"

type Preset = "1w" | "1m" | "custom"

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function plusDays(days: number): string {
  return ymd(new Date(Date.now() + days * 86400000))
}

interface Props {
  planId: string
  fechaActual: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone?: () => void
}

export function ReprogramarDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mount form only when open so internal state resets cleanly. */}
        {props.open && <ReprogramarForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function ReprogramarForm({
  planId,
  fechaActual,
  onOpenChange,
  onDone,
}: Props) {
  const router = useRouter()
  const [preset, setPreset] = useState<Preset>("1w")
  const [customDate, setCustomDate] = useState<string>(fechaActual ?? plusDays(7))
  const [motivo, setMotivo] = useState("")
  const [pending, startTransition] = useTransition()

  const fechaNueva =
    preset === "1w"
      ? plusDays(7)
      : preset === "1m"
        ? plusDays(30)
        : customDate

  const fechaPreviewLabel = (() => {
    if (!fechaNueva) return "—"
    try {
      return format(new Date(fechaNueva + "T00:00:00"), "dd/MM/yyyy")
    } catch {
      return fechaNueva
    }
  })()

  function handleSubmit() {
    if (!fechaNueva) {
      toast.error("Seleccioná una fecha")
      return
    }
    startTransition(async () => {
      const res = await reprogramarPlan(
        planId,
        fechaNueva,
        motivo.trim() || null
      )
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Plan reprogramado")
      onOpenChange(false)
      onDone?.()
      router.refresh()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          Reprogramar plan
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {fechaActual && (
          <p className="text-xs text-muted-foreground">
            Fecha actual:{" "}
            <span className="font-medium text-slate-700">
              {format(new Date(fechaActual + "T00:00:00"), "dd/MM/yyyy")}
            </span>
          </p>
        )}

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Nueva fecha</Label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPreset("1w")}
              disabled={pending}
              className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
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
              className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
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
              className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                preset === "custom"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Personalizado
            </button>
          </div>
        </div>

        {preset === "custom" && (
          <div className="space-y-1.5">
            <Label
              htmlFor="reprog-custom"
              className="text-xs text-muted-foreground"
            >
              Elegí una fecha
            </Label>
            <Input
              id="reprog-custom"
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              disabled={pending}
            />
          </div>
        )}

        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          La nueva fecha límite será{" "}
          <span className="font-semibold">{fechaPreviewLabel}</span>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="reprog-motivo"
            className="text-xs text-muted-foreground"
          >
            Motivo (opcional)
          </Label>
          <Textarea
            id="reprog-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="¿Por qué se reprograma?"
            className="min-h-16"
            disabled={pending}
          />
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
        <Button onClick={handleSubmit} disabled={pending || !fechaNueva}>
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Reprogramando…
            </>
          ) : (
            "Confirmar reprogramación"
          )}
        </Button>
      </DialogFooter>
    </>
  )
}

export default ReprogramarDialog
