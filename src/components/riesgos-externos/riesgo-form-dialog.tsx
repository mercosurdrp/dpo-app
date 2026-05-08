"use client"

import { useEffect, useState, useTransition } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { actualizarAccion, crearAccion } from "@/actions/riesgos-externos"
import {
  ESTADO_RIESGO_EXTERNO_LABELS,
  TIPO_RIESGO_EXTERNO_LABELS,
  type EstadoRiesgoExterno,
  type Profile,
  type RiesgoExternoAccionConResponsable,
  type TipoRiesgoExterno,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  accion?: RiesgoExternoAccionConResponsable | null
  responsables: Pick<Profile, "id" | "nombre" | "email">[]
  onSaved: () => void
}

export function RiesgoFormDialog({
  open,
  onOpenChange,
  accion,
  responsables,
  onSaved,
}: Props) {
  const editing = !!accion
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [tipoRiesgo, setTipoRiesgo] = useState<TipoRiesgoExterno | "">("")
  const [responsableId, setResponsableId] = useState<string>("")
  const [estado, setEstado] = useState<EstadoRiesgoExterno>("no_iniciado")

  useEffect(() => {
    if (open) {
      setTipoRiesgo(accion?.tipo_riesgo ?? "")
      setResponsableId(accion?.responsable_id ?? "")
      setEstado(accion?.estado ?? "no_iniciado")
      setError(null)
    }
  }, [open, accion])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set("tipo_riesgo", tipoRiesgo)
    formData.set("estado", estado)
    if (responsableId) formData.set("responsable_id", responsableId)
    else formData.delete("responsable_id")

    startTransition(async () => {
      const result = editing
        ? await actualizarAccion(accion!.id, formData)
        : await crearAccion(formData)
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? `Editar suceso #${accion?.nro_correlativo}`
              : "Registrar nuevo suceso de riesgo externo"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo de riesgo + estado */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo de riesgo *</Label>
              <Select
                value={tipoRiesgo}
                onValueChange={(v: string | null) =>
                  setTipoRiesgo((v ?? "") as TipoRiesgoExterno | "")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_RIESGO_EXTERNO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Estado *</Label>
              <Select
                value={estado}
                onValueChange={(v: string | null) =>
                  setEstado((v ?? "no_iniciado") as EstadoRiesgoExterno)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ESTADO_RIESGO_EXTERNO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Observaciones */}
          <div className="space-y-1.5">
            <Label htmlFor="observaciones">Observaciones (qué sucedió) *</Label>
            <Textarea
              id="observaciones"
              name="observaciones"
              defaultValue={accion?.observaciones ?? ""}
              rows={3}
              required
              placeholder="Ej: Se produjo una caída del servidor por sobrecalentamiento del A/A…"
            />
          </div>

          {/* Resolución */}
          <div className="space-y-1.5">
            <Label htmlFor="resolucion">Resolución (qué se hizo)</Label>
            <Textarea
              id="resolucion"
              name="resolucion"
              defaultValue={accion?.resolucion ?? ""}
              rows={3}
              placeholder="Ej: Se realizó el mantenimiento de la unidad interior del A/A…"
            />
          </div>

          {/* Fecha ocurrencia + responsable */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fecha_ocurrencia">Fecha de ocurrencia *</Label>
              <Input
                id="fecha_ocurrencia"
                name="fecha_ocurrencia"
                type="date"
                defaultValue={accion?.fecha_ocurrencia ?? ""}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select
                value={responsableId}
                onValueChange={(v: string | null) => setResponsableId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar responsable…" />
                </SelectTrigger>
                <SelectContent>
                  {responsables.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tarea pendiente */}
          <div className="space-y-1.5">
            <Label htmlFor="tarea_pendiente">
              Tarea pendiente (si corresponde)
            </Label>
            <Textarea
              id="tarea_pendiente"
              name="tarea_pendiente"
              defaultValue={accion?.tarea_pendiente ?? ""}
              rows={2}
              placeholder="Ej: Cotizar y reemplazar el equipo de A/A del rack…"
            />
          </div>

          {/* Fecha compromiso + cierre real */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fecha_compromiso">Fecha de compromiso</Label>
              <Input
                id="fecha_compromiso"
                name="fecha_compromiso"
                type="date"
                defaultValue={accion?.fecha_compromiso ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fecha_cierre_real">Fecha de cierre real</Label>
              <Input
                id="fecha_cierre_real"
                name="fecha_cierre_real"
                type="date"
                defaultValue={accion?.fecha_cierre_real ?? ""}
              />
            </div>
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
              {editing ? "Guardar cambios" : "Registrar suceso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
