"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
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
import { actualizarAccion } from "@/actions/s5-acciones"
import {
  S5_ACCION_ESTADO_LABELS,
  type S5AccionConMeta,
  type S5SectorAlmacen,
} from "@/types/database"

interface Props {
  accion: S5AccionConMeta
  open: boolean
  onOpenChange: (open: boolean) => void
  responsables: { id: string; nombre: string; email: string }[]
  vehiculos: { id: string; dominio: string }[]
  sectoresAlmacen?: S5SectorAlmacen[]
  onSaved: () => void
}

const SECTORES_FALLBACK: S5SectorAlmacen[] = [1, 2, 3, 4].map((n) => ({
  numero: n,
  nombre: `Sector ${n}`,
  updated_at: "",
  updated_by: null,
}))

export function EditarAccionDialog({
  accion,
  open,
  onOpenChange,
  responsables,
  vehiculos,
  sectoresAlmacen,
  onSaved,
}: Props) {
  const sectoresOpts = (sectoresAlmacen?.length
    ? sectoresAlmacen
    : SECTORES_FALLBACK
  )
    .slice()
    .sort((a, b) => a.numero - b.numero)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [descripcion, setDescripcion] = useState(accion.descripcion)
  const [responsableId, setResponsableId] = useState<string>(
    accion.responsable_id ?? ""
  )
  const [fechaCompromiso, setFechaCompromiso] = useState<string>(
    accion.fecha_compromiso ?? ""
  )
  const [estado, setEstado] = useState<string>(accion.estado)
  const [sectorNumero, setSectorNumero] = useState<string>(
    accion.sector_numero ? String(accion.sector_numero) : "1"
  )
  const [vehiculoId, setVehiculoId] = useState<string>(
    accion.vehiculo_id ?? "none"
  )

  // Re-hidratar el form cuando cambia la acción a editar.
  useEffect(() => {
    setError(null)
    setDescripcion(accion.descripcion)
    setResponsableId(accion.responsable_id ?? "")
    setFechaCompromiso(accion.fecha_compromiso ?? "")
    setEstado(accion.estado)
    setSectorNumero(accion.sector_numero ? String(accion.sector_numero) : "1")
    setVehiculoId(accion.vehiculo_id ?? "none")
  }, [accion])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!descripcion.trim()) {
      setError("La descripción es obligatoria.")
      return
    }
    if (!responsableId) {
      setError("Asigná un responsable.")
      return
    }

    startTransition(async () => {
      const res = await actualizarAccion(accion.id, {
        descripcion: descripcion.trim(),
        responsableId,
        fechaCompromiso: fechaCompromiso || null,
        estado: estado === "en_curso" ? "en_curso" : "no_comenzada",
        ...(accion.tipo === "almacen"
          ? { sectorNumero: parseInt(sectorNumero, 10) }
          : { vehiculoId: vehiculoId !== "none" ? vehiculoId : null }),
      })
      if ("error" in res) {
        setError(res.error)
        return
      }
      toast.success("Acción actualizada")
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar acción 5S</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {accion.tipo === "almacen" ? (
            <div>
              <Label className="mb-1.5">Sector</Label>
              <Select
                value={sectorNumero}
                onValueChange={(v) => v && setSectorNumero(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sectoresOpts.map((s) => (
                    <SelectItem key={s.numero} value={String(s.numero)}>
                      {s.nombre || `Sector ${s.numero}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label className="mb-1.5">Vehículo (opcional)</Label>
              <Select
                value={vehiculoId}
                onValueChange={(v) => v && setVehiculoId(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin vehículo</SelectItem>
                  {vehiculos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.dominio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1.5">Descripción</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5">Responsable</Label>
              <Select
                value={responsableId}
                onValueChange={(v) => v && setResponsableId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir..." />
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
            <div>
              <Label className="mb-1.5">Fecha de compromiso</Label>
              <Input
                type="date"
                value={fechaCompromiso}
                onChange={(e) => setFechaCompromiso(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5">Estado</Label>
            <Select value={estado} onValueChange={(v) => v && setEstado(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_comenzada">
                  {S5_ACCION_ESTADO_LABELS.no_comenzada}
                </SelectItem>
                <SelectItem value="en_curso">
                  {S5_ACCION_ESTADO_LABELS.en_curso}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Para cerrar la acción usá &quot;Responder&quot; (requiere
              evidencia).
            </p>
          </div>

          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
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
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
