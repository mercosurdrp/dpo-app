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
  crearIniciativa,
  actualizarIniciativa,
} from "@/actions/presupuesto-iniciativas"
import type {
  EstadoIniciativaAhorro,
  IniciativaAhorroConDetalle,
  TipoIniciativaAhorro,
} from "@/types/database"
import { ESTADO_OPCIONES, TIPO_OPCIONES } from "./iniciativas-constantes"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  anio: number
  iniciativa?: IniciativaAhorroConDetalle | null
  responsables: ResponsableOpt[]
  onSaved: () => void
}

export function IniciativaFormDialog({
  open,
  onOpenChange,
  anio,
  iniciativa,
  responsables,
  onSaved,
}: Props) {
  const editing = !!iniciativa
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [tipo, setTipo] = useState<TipoIniciativaAhorro>(
    iniciativa?.tipo ?? "otro",
  )
  const [estado, setEstado] = useState<EstadoIniciativaAhorro>(
    iniciativa?.estado ?? "planificada",
  )
  const [responsableId, setResponsableId] = useState<string>(
    iniciativa?.responsable_id ?? "",
  )
  const [mejorSi, setMejorSi] = useState<"menor" | "mayor">(
    iniciativa?.kpi_mejor_si ?? "menor",
  )

  useEffect(() => {
    if (open) {
      setTipo(iniciativa?.tipo ?? "otro")
      setEstado(iniciativa?.estado ?? "planificada")
      setResponsableId(iniciativa?.responsable_id ?? "")
      setMejorSi(iniciativa?.kpi_mejor_si ?? "menor")
      setError(null)
    }
  }, [open, iniciativa])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("anio", String(anio))
    formData.set("tipo", tipo)
    formData.set("estado", estado)
    formData.set("kpi_mejor_si", mejorSi)
    if (responsableId) formData.set("responsable_id", responsableId)
    else formData.delete("responsable_id")

    startTransition(async () => {
      const result = editing
        ? await actualizarIniciativa(iniciativa!.id, formData)
        : await crearIniciativa(formData)
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? "Editar iniciativa de ahorro"
              : `Nueva iniciativa de ahorro — ${anio}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              name="titulo"
              defaultValue={iniciativa?.titulo ?? ""}
              placeholder="Ej. Reducción de horas extra en depósito"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select
                value={tipo}
                onValueChange={(v: string | null) =>
                  setTipo((v as TipoIniciativaAhorro) ?? "otro")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo…" />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPCIONES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={estado}
                onValueChange={(v: string | null) =>
                  setEstado((v as EstadoIniciativaAhorro) ?? "planificada")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADO_OPCIONES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tipo === "otro" && (
            <div className="space-y-1.5">
              <Label htmlFor="tipo_otro">Detalle del tipo</Label>
              <Input
                id="tipo_otro"
                name="tipo_otro"
                defaultValue={iniciativa?.tipo_otro ?? ""}
                placeholder="Especificá el tipo de iniciativa"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción del proyecto</Label>
            <Textarea
              id="descripcion"
              name="descripcion"
              rows={2}
              defaultValue={iniciativa?.descripcion ?? ""}
              placeholder="En qué consiste la iniciativa…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select
                value={responsableId}
                onValueChange={(v: string | null) => setResponsableId(v ?? "")}
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
              <Label htmlFor="fecha_implementacion">
                Fecha de implementación
              </Label>
              <Input
                id="fecha_implementacion"
                name="fecha_implementacion"
                type="date"
                defaultValue={iniciativa?.fecha_implementacion ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ahorro_comprometido_anual">
              Ahorro comprometido (anual, $)
            </Label>
            <Input
              id="ahorro_comprometido_anual"
              name="ahorro_comprometido_anual"
              type="number"
              step="0.01"
              defaultValue={iniciativa?.ahorro_comprometido_anual ?? ""}
              placeholder="0"
            />
          </div>

          {/* KPI comprometido */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Métrica / KPI comprometido
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kpi_nombre">Nombre del KPI</Label>
                <Input
                  id="kpi_nombre"
                  name="kpi_nombre"
                  defaultValue={iniciativa?.kpi_nombre ?? ""}
                  placeholder="Ej. % Ausentismo"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kpi_unidad">Unidad</Label>
                <Input
                  id="kpi_unidad"
                  name="kpi_unidad"
                  defaultValue={iniciativa?.kpi_unidad ?? ""}
                  placeholder="Ej. %, L/100km, bultos/HH"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kpi_linea_base">Línea base (antes)</Label>
                <Input
                  id="kpi_linea_base"
                  name="kpi_linea_base"
                  type="number"
                  step="0.0001"
                  defaultValue={iniciativa?.kpi_linea_base ?? ""}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kpi_objetivo">Objetivo</Label>
                <Input
                  id="kpi_objetivo"
                  name="kpi_objetivo"
                  type="number"
                  step="0.0001"
                  defaultValue={iniciativa?.kpi_objetivo ?? ""}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label>La métrica mejora cuando…</Label>
              <Select
                value={mejorSi}
                onValueChange={(v: string | null) =>
                  setMejorSi((v as "menor" | "mayor") ?? "menor")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="menor">
                    …baja (mejor si es menor)
                  </SelectItem>
                  <SelectItem value="mayor">
                    …sube (mejor si es mayor)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="incluida_en_presupuesto"
              value="true"
              defaultChecked={iniciativa?.incluida_en_presupuesto ?? false}
              className="size-4 rounded border-slate-300"
            />
            El ahorro está incluido en el presupuesto del año (bloque 1)
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              name="observaciones"
              rows={2}
              defaultValue={iniciativa?.observaciones ?? ""}
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
              {editing ? "Guardar cambios" : "Crear iniciativa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
