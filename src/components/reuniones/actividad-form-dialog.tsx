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
  ChecklistItemActividad,
  PrioridadActividad,
  ReunionActividad,
  ReunionActividadConResponsable,
  S5SectorAlmacen,
  TareaDestino,
  TipoReunion,
} from "@/types/database"
import { IS_MISIONES } from "@/lib/empresa"
import { cn } from "@/lib/utils"

// Categorías (etiquetas) del Action Log de logística (Planner, solo Misiones).
const ETIQUETAS_LOG = [
  "ALMACEN",
  "ENTREGA",
  "GENTE",
  "FLOTA",
  "MANTENIMIENTO",
  "VENTAS",
  "SEGURIDAD",
  "GESTIÓN",
  "SLA",
  "ADMIN",
]

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
  /** Recibe la actividad creada/actualizada para reflejarla sin re-fetch. */
  onSaved: (act: ReunionActividad) => void
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

  // Campos estilo Planner (solo Misiones)
  const [prioridad, setPrioridad] = useState<PrioridadActividad>(
    actividad?.prioridad ?? "media",
  )
  const [fechaInicio, setFechaInicio] = useState<string>(
    actividad?.fecha_inicio ?? "",
  )
  const [etiquetas, setEtiquetas] = useState<string[]>(
    actividad?.etiquetas ?? [],
  )
  const [respMulti, setRespMulti] = useState<string[]>(
    actividad?.responsables?.length
      ? actividad.responsables
      : actividad?.responsable_id
        ? [actividad.responsable_id]
        : [],
  )
  const [checklist, setChecklist] = useState<ChecklistItemActividad[]>(
    actividad?.checklist ?? [],
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
      setPrioridad(actividad?.prioridad ?? "media")
      setFechaInicio(actividad?.fecha_inicio ?? "")
      setEtiquetas(actividad?.etiquetas ?? [])
      setRespMulti(
        actividad?.responsables?.length
          ? actividad.responsables
          : actividad?.responsable_id
            ? [actividad.responsable_id]
            : [],
      )
      setChecklist(actividad?.checklist ?? [])
    }
  }, [open, actividad])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)

    if (!editing) {
      formData.set("reunion_id", reunionId)
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

    // Campos estilo Planner (solo Misiones)
    if (IS_MISIONES) {
      formData.set("prioridad", prioridad)
      formData.set("fecha_inicio", fechaInicio)
      formData.set("etiquetas", JSON.stringify(etiquetas))
      formData.set("responsables", JSON.stringify(respMulti))
      formData.set(
        "checklist",
        JSON.stringify(checklist.filter((c) => c.texto.trim())),
      )
      // El responsable principal es el primero de la lista de asignados.
      if (respMulti.length > 0) formData.set("responsable_id", respMulti[0])
      else formData.delete("responsable_id")
    }

    startTransition(async () => {
      const result = editing
        ? await actualizarActividad(actividad!.id, formData)
        : await crearActividad(formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved(result.data)
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
            {!IS_MISIONES && (
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
            )}
            {IS_MISIONES && (
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <Select
                  value={prioridad}
                  onValueChange={(v: string | null) => {
                    if (v) setPrioridad(v as PrioridadActividad)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="importante">Importante</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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

          {IS_MISIONES && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="act_inicio">Fecha de inicio</Label>
                <Input
                  id="act_inicio"
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Responsables</Label>
                <div className="flex flex-wrap gap-1.5">
                  {responsables.map((r) => {
                    const on = respMulti.includes(r.id)
                    return (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() =>
                          setRespMulti((p) =>
                            on ? p.filter((x) => x !== r.id) : [...p, r.id],
                          )
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition",
                          on
                            ? "border-blue-500 bg-blue-50 font-medium text-blue-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        {r.nombre}
                      </button>
                    )
                  })}
                </div>
                {respMulti.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Principal: {responsables.find((r) => r.id === respMulti[0])?.nombre}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Etiquetas</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ETIQUETAS_LOG.map((e) => {
                    const on = etiquetas.includes(e)
                    return (
                      <button
                        type="button"
                        key={e}
                        onClick={() =>
                          setEtiquetas((p) =>
                            on ? p.filter((x) => x !== e) : [...p, e],
                          )
                        }
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-medium transition",
                          on
                            ? "bg-slate-700 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                        )}
                      >
                        {e}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Checklist</Label>
                <div className="space-y-1.5">
                  {checklist.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={c.completado}
                        onChange={(e) =>
                          setChecklist((p) =>
                            p.map((x, j) =>
                              j === i
                                ? { ...x, completado: e.target.checked }
                                : x,
                            ),
                          )
                        }
                        className="size-4 shrink-0"
                      />
                      <Input
                        value={c.texto}
                        onChange={(e) =>
                          setChecklist((p) =>
                            p.map((x, j) =>
                              j === i ? { ...x, texto: e.target.value } : x,
                            ),
                          )
                        }
                        className="h-7 flex-1 text-sm"
                        placeholder="Ítem del checklist…"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setChecklist((p) => p.filter((_, j) => j !== i))
                        }
                        className="shrink-0 text-slate-400 hover:text-red-600"
                        title="Quitar"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setChecklist((p) => [
                        ...p,
                        { texto: "", completado: false },
                      ])
                    }
                  >
                    + Ítem
                  </Button>
                </div>
              </div>
            </>
          )}

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
