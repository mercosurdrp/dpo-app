"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, Send } from "lucide-react"
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
import { AdjuntosInput } from "@/components/adjuntos-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { responderTarea } from "@/actions/presupuesto"
import type { PresupuestoTareaConResponsable } from "@/types/database"

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tarea: PresupuestoTareaConResponsable
  onSaved: () => void
}

export function ResponderTareaDialog({
  open,
  onOpenChange,
  tarea,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [archivos, setArchivos] = useState<File[]>([])
  const [nuevoEstado, setNuevoEstado] = useState<
    "en_progreso" | "completada"
  >(tarea.estado === "completada" ? "completada" : "en_progreso")

  useEffect(() => {
    if (open) {
      setError(null)
      setArchivos([])
      setNuevoEstado(
        tarea.estado === "completada" ? "completada" : "en_progreso",
      )
    }
  }, [open, tarea])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("nuevo_estado", nuevoEstado)

    const justificacion = (formData.get("justificacion") as string | null) ?? ""

    const tieneArchivo = archivos.length > 0
    const tieneJustif = justificacion.trim().length > 0
    if (!tieneArchivo && !tieneJustif) {
      setError("Adjuntá un archivo o escribí una justificación (al menos uno).")
      return
    }

    for (const f of archivos) formData.append("archivo", f)

    startTransition(async () => {
      const result = await responderTarea(tarea.id, formData)
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
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-5 text-blue-600" />
            Responder tarea
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md border bg-slate-50 p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {MESES[tarea.mes - 1]} {tarea.anio}
          </p>
          <p className="mt-0.5 font-medium text-slate-900">{tarea.rubro}</p>
          {tarea.descripcion && (
            <p className="mt-1 text-xs text-slate-600">{tarea.descripcion}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Evidencia (varios archivos o fotos, Ctrl+V para pegar)</Label>
            <AdjuntosInput
              archivos={archivos}
              onChange={setArchivos}
              activo={open}
              disabled={pending}
              accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.doc,.docx"
            />
            <p className="text-xs text-muted-foreground">
              Opcional si dejás una justificación. Los archivos se suman a los
              que ya tenía la tarea.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resp_justif">Justificación</Label>
            <Textarea
              id="resp_justif"
              name="justificacion"
              rows={3}
              defaultValue={tarea.justificacion ?? ""}
              placeholder="Explicación del desvío, plan de acción, etc."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Nuevo estado *</Label>
            <Select
              value={nuevoEstado}
              onValueChange={(v: string | null) =>
                setNuevoEstado(
                  v === "completada" ? "completada" : "en_progreso",
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en_progreso">En progreso</SelectItem>
                <SelectItem value="completada">Completada</SelectItem>
              </SelectContent>
            </Select>
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
              Enviar respuesta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
