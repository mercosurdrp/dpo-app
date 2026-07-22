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
import { registrarAvance } from "@/actions/presupuesto-planes-accion"
import { AdjuntosPicker } from "./adjuntos-picker"
import type {
  PlanAccionPaso,
  PlanAccionPresupuestoConDetalle,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PlanAccionPresupuestoConDetalle
  /** null = avance del plan entero. */
  paso: PlanAccionPaso | null
  onSaved: () => void
}

export function AvancePlanAccionDialog({
  open,
  onOpenChange,
  plan,
  paso,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Sin reset por efecto: el padre monta este diálogo recién al abrirlo y lo
  // desmonta al cerrarlo, así que el estado ya nace limpio en cada apertura.
  const [comentario, setComentario] = useState("")
  const [adjuntos, setAdjuntos] = useState<File[]>([])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData()
    formData.set("comentario", comentario)
    for (const file of adjuntos) formData.append("adjuntos", file)

    startTransition(async () => {
      const result = await registrarAvance(
        plan.id,
        paso?.id ?? null,
        formData,
      )
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
          <DialogTitle>Registrar avance</DialogTitle>
        </DialogHeader>

        <p className="-mt-1 line-clamp-2 text-sm text-muted-foreground">
          {paso ? paso.que : plan.titulo}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="avance_comentario">Qué pasó *</Label>
            <Textarea
              id="avance_comentario"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              placeholder="Qué se hizo desde el último avance, qué falta…"
              required
            />
            <p className="text-xs text-muted-foreground">
              Se suma al historial: los avances anteriores no se pisan.
            </p>
          </div>

          <AdjuntosPicker
            archivos={adjuntos}
            onChange={setAdjuntos}
            label="Evidencia (opcional)"
            ayuda="Queda pegada a este avance, no al plan entero."
          />

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
              Guardar avance
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
