"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
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
import {
  cerrarPlanAccion,
  reabrirPlanAccion,
} from "@/actions/presupuesto-planes-accion"
import type { PlanAccionPresupuestoConDetalle } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PlanAccionPresupuestoConDetalle
  /** "cerrar" pide resultado del plan; "reabrir" pide el motivo. */
  modo: "cerrar" | "reabrir"
  onSaved: () => void
}

export function CerrarPlanAccionDialog({
  open,
  onOpenChange,
  plan,
  modo,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Sin reset por efecto: el padre monta este diálogo recién al abrirlo y lo
  // desmonta al cerrarlo, así que el estado ya nace limpio en cada apertura.
  const [comentario, setComentario] = useState("")

  const cerrando = modo === "cerrar"

  const pasosPendientes = plan.pasos.filter(
    (p) => p.estado !== "completado",
  ).length
  // Se cierra "a ciegas" si no hay ni bitácora ni adjuntos que respalden.
  const sinRespaldo =
    plan.avances.length === 0 && plan.adjunto_urls.length === 0

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = cerrando
        ? await cerrarPlanAccion(plan.id, comentario)
        : await reabrirPlanAccion(plan.id, comentario)
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
            {cerrando ? "Cerrar plan de acción" : "Reabrir plan de acción"}
          </DialogTitle>
        </DialogHeader>

        <p className="-mt-1 line-clamp-2 text-sm text-muted-foreground">
          {plan.titulo}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {cerrando && pasosPendientes > 0 && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Quedan <strong>{pasosPendientes}</strong>{" "}
                {pasosPendientes === 1 ? "acción" : "acciones"} sin completar.
                Podés cerrar igual, pero dejá dicho por qué.
              </span>
            </div>
          )}

          {cerrando && sinRespaldo && (
            <div className="flex gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Este plan no tiene avances registrados ni adjuntos. El cierre
                queda sin evidencia que lo respalde.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="comentario">
              {cerrando ? "Resultado del plan *" : "Motivo de la reapertura *"}
            </Label>
            <Textarea
              id="comentario"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              placeholder={
                cerrando
                  ? "Qué se logró, cómo cerró el desvío…"
                  : "Por qué vuelve a abrirse…"
              }
              required
            />
            <p className="text-xs text-muted-foreground">
              Queda en el seguimiento del plan, con tu nombre y la fecha.
            </p>
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
            <Button type="submit" disabled={pending || !comentario.trim()}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {cerrando ? "Cerrar plan" : "Reabrir plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
