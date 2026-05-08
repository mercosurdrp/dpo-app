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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { responderActividad } from "@/actions/reuniones"
import type { ReunionActividadConResponsable } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  actividad: ReunionActividadConResponsable
  onSaved: () => void
}

export function ResponderActividadDialog({
  open,
  onOpenChange,
  actividad,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [nuevoEstado, setNuevoEstado] = useState<"en_curso" | "cerrada">(
    actividad.estado === "cerrada" ? "cerrada" : "en_curso",
  )

  useEffect(() => {
    if (open) {
      setError(null)
      setNuevoEstado(actividad.estado === "cerrada" ? "cerrada" : "en_curso")
    }
  }, [open, actividad])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("nuevo_estado", nuevoEstado)

    const file = formData.get("archivo") as File | null
    const observaciones =
      ((formData.get("observaciones") as string | null) ?? "").trim()

    const tieneArchivo = !!(file && file.size > 0)
    const tieneObs = observaciones.length > 0
    if (!tieneArchivo && !tieneObs) {
      setError("Adjuntá un archivo o escribí observaciones (al menos uno).")
      return
    }

    if (!tieneArchivo) formData.delete("archivo")

    startTransition(async () => {
      const result = await responderActividad(actividad.id, formData)
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
            Responder actividad
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md border bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{actividad.descripcion}</p>
          {actividad.responsable_nombre && (
            <p className="mt-1 text-xs text-muted-foreground">
              Responsable: {actividad.responsable_nombre}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="resp_act_archivo">Evidencia (archivo)</Label>
            <Input
              id="resp_act_archivo"
              name="archivo"
              type="file"
              accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.doc,.docx"
            />
            <p className="text-xs text-muted-foreground">
              Opcional si dejás observaciones.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resp_act_obs">Observaciones</Label>
            <Textarea
              id="resp_act_obs"
              name="observaciones"
              rows={3}
              defaultValue={actividad.observaciones ?? ""}
              placeholder="Avances, plan de acción, etc."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Nuevo estado *</Label>
            <Select
              value={nuevoEstado}
              onValueChange={(v: string | null) =>
                setNuevoEstado(v === "cerrada" ? "cerrada" : "en_curso")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en_curso">En curso</SelectItem>
                <SelectItem value="cerrada">Cerrada</SelectItem>
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
