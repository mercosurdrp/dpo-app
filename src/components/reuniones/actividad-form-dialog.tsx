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
import {
  actualizarActividad,
  crearActividad,
} from "@/actions/reuniones"
import type {
  ReunionActividadConResponsable,
  S5SectorAlmacen,
  TareaDestino,
  TipoReunion,
} from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface VehiculoOpt {
  id: string
  dominio: string
}

interface RubroOpt {
  id: string
  nombre: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  reunionId: string
  reunionTipo: TipoReunion
  actividad?: ReunionActividadConResponsable | null
  responsables: ResponsableOpt[]
  sectoresAlmacen?: S5SectorAlmacen[]
  vehiculos?: VehiculoOpt[]
  rubrosMantenimiento?: RubroOpt[]
  /** Sección a la que queda atado el compromiso (ej. 'rechazos'). Solo al crear. */
  seccion?: string | null
  onSaved: () => void
}

// Sector fallback si la tabla s5_sectores_almacen viene vacía.
const SECTORES_FALLBACK: S5SectorAlmacen[] = [1, 2, 3, 4].map((n) => ({
  numero: n,
  nombre: `Sector ${n}`,
  updated_at: "",
  updated_by: null,
}))

// Mapa de qué destinos están permitidos según el tipo de reunión.
// Spec: logistica-ventas NO muestra el selector (default simple, oculto).
const DESTINOS_POR_TIPO: Record<
  TipoReunion,
  { value: TareaDestino; label: string }[]
> = {
  warehouse: [
    { value: "simple", label: "Simple" },
    { value: "5s_almacen", label: "5S Almacén" },
    { value: "mantenimiento_edilicio", label: "Mantenimiento Edilicio" },
  ],
  "matinal-distribucion": [
    { value: "simple", label: "Simple" },
    { value: "5s_flota", label: "5S Flota" },
    { value: "mantenimiento_edilicio", label: "Mantenimiento Edilicio" },
  ],
  logistica: [
    { value: "simple", label: "Simple" },
    { value: "5s_flota", label: "5S Flota" },
    { value: "5s_almacen", label: "5S Almacén" },
    { value: "mantenimiento_edilicio", label: "Mantenimiento Edilicio" },
  ],
  "logistica-ventas": [
    // No se muestra el selector; default 'simple'.
    { value: "simple", label: "Simple" },
  ],
  presupuesto: [
    // Reunión de presupuesto: compromisos simples (default).
    { value: "simple", label: "Simple" },
  ],
  mantenimiento: [
    { value: "simple", label: "Simple" },
    { value: "5s_flota", label: "5S Flota" },
    { value: "5s_almacen", label: "5S Almacén" },
    { value: "mantenimiento_edilicio", label: "Mantenimiento Edilicio" },
  ],
}

export function ActividadFormDialog({
  open,
  onOpenChange,
  reunionId,
  reunionTipo,
  actividad,
  responsables,
  sectoresAlmacen,
  vehiculos,
  rubrosMantenimiento,
  seccion,
  onSaved,
}: Props) {
  const editing = !!actividad
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [responsableId, setResponsableId] = useState<string>(
    actividad?.responsable_id ?? "",
  )

  const destinoOptions = DESTINOS_POR_TIPO[reunionTipo]
  const mostrarSelectorDestino = reunionTipo !== "logistica-ventas"

  const [destino, setDestino] = useState<TareaDestino>(
    actividad?.destino ?? "simple",
  )
  const [sectorNumero, setSectorNumero] = useState<string>(
    actividad?.s5_sector_numero ? String(actividad.s5_sector_numero) : "1",
  )
  const [vehiculoId, setVehiculoId] = useState<string>(
    actividad?.s5_vehiculo_id ?? "none",
  )
  const [mantenimientoRubro, setMantenimientoRubro] = useState<string>(
    actividad?.mantenimiento_rubro ?? "",
  )

  const sectoresOpts = (sectoresAlmacen?.length
    ? sectoresAlmacen
    : SECTORES_FALLBACK
  )
    .slice()
    .sort((a, b) => a.numero - b.numero)

  useEffect(() => {
    if (open) {
      setError(null)
      setResponsableId(actividad?.responsable_id ?? "")
      setDestino(actividad?.destino ?? "simple")
      setSectorNumero(
        actividad?.s5_sector_numero
          ? String(actividad.s5_sector_numero)
          : "1",
      )
      setVehiculoId(actividad?.s5_vehiculo_id ?? "none")
      setMantenimientoRubro(actividad?.mantenimiento_rubro ?? "")
    }
  }, [open, actividad])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)

    if (!editing) {
      formData.set("reunion_id", reunionId)
      // Etiqueta la actividad con la sección (solo al crear).
      if (seccion) formData.set("seccion", seccion)
    }
    if (responsableId) formData.set("responsable_id", responsableId)
    else formData.delete("responsable_id")

    const desc = ((formData.get("descripcion") as string | null) ?? "").trim()
    if (!desc) {
      setError("La descripción es obligatoria.")
      return
    }

    // Sub-campos por destino → siempre los seteamos explícitamente.
    formData.set("destino", destino)
    if (destino === "5s_almacen") {
      formData.set("s5_sector_numero", sectorNumero)
      formData.delete("s5_vehiculo_id")
      formData.delete("mantenimiento_rubro")
    } else if (destino === "5s_flota") {
      formData.set("s5_vehiculo_id", vehiculoId)
      formData.delete("s5_sector_numero")
      formData.delete("mantenimiento_rubro")
    } else if (destino === "mantenimiento_edilicio") {
      formData.set("mantenimiento_rubro", mantenimientoRubro.trim())
      formData.delete("s5_sector_numero")
      formData.delete("s5_vehiculo_id")
      if (!mantenimientoRubro.trim()) {
        setError("Para Mantenimiento Edilicio el rubro es obligatorio.")
        return
      }
    } else {
      formData.delete("s5_sector_numero")
      formData.delete("s5_vehiculo_id")
      formData.delete("mantenimiento_rubro")
    }

    startTransition(async () => {
      const result = editing
        ? await actualizarActividad(actividad!.id, formData)
        : await crearActividad(formData)
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar actividad" : "Nueva actividad"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="act_descripcion">Descripción *</Label>
            <Textarea
              id="act_descripcion"
              name="descripcion"
              rows={3}
              defaultValue={actividad?.descripcion ?? ""}
              placeholder="¿Qué hay que hacer?"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="act_motivo">Motivo / origen</Label>
            <Input
              id="act_motivo"
              name="motivo"
              defaultValue={actividad?.motivo ?? ""}
              placeholder="Por qué surge esta actividad…"
            />
          </div>

          {mostrarSelectorDestino && (
            <div className="space-y-1.5">
              <Label>Destino</Label>
              <Select
                value={destino}
                onValueChange={(v: string | null) => {
                  if (v) setDestino(v as TareaDestino)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destinoOptions.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si elegís 5S, se crea una acción espejo en el módulo 5S
                que se mantiene sincronizada.
              </p>
            </div>
          )}

          {destino === "5s_almacen" && (
            <div className="space-y-1.5">
              <Label>Sector de almacén *</Label>
              <Select
                value={sectorNumero}
                onValueChange={(v: string | null) => {
                  if (v) setSectorNumero(v)
                }}
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
          )}

          {destino === "5s_flota" && (
            <div className="space-y-1.5">
              <Label>Vehículo (opcional)</Label>
              <Select
                value={vehiculoId}
                onValueChange={(v: string | null) => {
                  if (v) setVehiculoId(v)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin vehículo</SelectItem>
                  {(vehiculos ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.dominio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {destino === "mantenimiento_edilicio" && (
            <div className="space-y-1.5">
              <Label htmlFor="act_rubro">Rubro *</Label>
              {(rubrosMantenimiento ?? []).length > 0 ? (
                <Select
                  value={mantenimientoRubro}
                  onValueChange={(v: string | null) =>
                    setMantenimientoRubro(v ?? "")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Elegí un rubro" />
                  </SelectTrigger>
                  <SelectContent>
                    {(rubrosMantenimiento ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="act_rubro"
                  value={mantenimientoRubro}
                  onChange={(e) => setMantenimientoRubro(e.target.value)}
                  placeholder="Ej: Electricidad, plomería, refrigeración…"
                />
              )}
              <p className="text-xs text-muted-foreground">
                La tarea se replica como Plan de Acción en la app de
                Mantenimiento Edilicio.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select
                value={responsableId}
                onValueChange={(v: string | null) =>
                  setResponsableId(v ?? "")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
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
            <div className="space-y-1.5">
              <Label htmlFor="act_fecha">Vencimiento</Label>
              <Input
                id="act_fecha"
                name="fecha_compromiso"
                type="date"
                defaultValue={actividad?.fecha_compromiso ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="act_obs">Observaciones</Label>
            <Textarea
              id="act_obs"
              name="observaciones"
              rows={2}
              defaultValue={actividad?.observaciones ?? ""}
              placeholder="Notas / contexto…"
            />
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
              {editing ? "Guardar cambios" : "Crear actividad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
