"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, FileDown } from "lucide-react"
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
  crearInversion,
  actualizarInversion,
} from "@/actions/presupuesto-inversiones"
import type {
  CategoriaInversion,
  EstadoInversion,
  InversionConDetalle,
} from "@/types/database"
import {
  CATEGORIA_OPCIONES,
  ESTADO_INVERSION_OPCIONES,
} from "./inversiones-constantes"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  anio: number
  inversion?: InversionConDetalle | null
  responsables: ResponsableOpt[]
  onSaved: () => void
  onAbrirArchivo: (url: string | null) => void
}

export function InversionFormDialog({
  open,
  onOpenChange,
  anio,
  inversion,
  responsables,
  onSaved,
  onAbrirArchivo,
}: Props) {
  const editing = !!inversion
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [categoria, setCategoria] = useState<CategoriaInversion>(
    inversion?.categoria ?? "equipos_almacen",
  )
  const [estado, setEstado] = useState<EstadoInversion>(
    inversion?.estado ?? "programada",
  )
  const [responsableId, setResponsableId] = useState<string>(
    inversion?.responsable_id ?? "",
  )

  useEffect(() => {
    if (open) {
      setCategoria(inversion?.categoria ?? "equipos_almacen")
      setEstado(inversion?.estado ?? "programada")
      setResponsableId(inversion?.responsable_id ?? "")
      setError(null)
    }
  }, [open, inversion])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("anio", String(anio))
    formData.set("categoria", categoria)
    formData.set("estado", estado)
    if (responsableId) formData.set("responsable_id", responsableId)
    else formData.delete("responsable_id")

    startTransition(async () => {
      const result = editing
        ? await actualizarInversion(inversion!.id, formData)
        : await crearInversion(formData)
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
            {editing ? "Editar inversión" : `Nueva inversión — ${anio}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Inversión *</Label>
            <Input
              id="titulo"
              name="titulo"
              defaultValue={inversion?.titulo ?? ""}
              placeholder="Ej. Compra de 2 autoelevadores"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select
                value={categoria}
                onValueChange={(v: string | null) =>
                  setCategoria((v as CategoriaInversion) ?? "otro")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIA_OPCIONES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cantidad">Cantidad de unidades</Label>
              <Input
                id="cantidad"
                name="cantidad"
                type="number"
                step="1"
                min="0"
                defaultValue={inversion?.cantidad ?? ""}
                placeholder="Ej. 2"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              name="descripcion"
              rows={2}
              defaultValue={inversion?.descripcion ?? ""}
              placeholder="Detalle de la inversión…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="beneficio_esperado">Beneficio esperado</Label>
            <Textarea
              id="beneficio_esperado"
              name="beneficio_esperado"
              rows={2}
              defaultValue={inversion?.beneficio_esperado ?? ""}
              placeholder="Qué mejora trae (disponibilidad, productividad, menor mantenimiento…)"
            />
          </div>

          {/* Beneficio cuantificado (KPI esperado) */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Beneficio cuantificado (opcional)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kpi_nombre">Métrica</Label>
                <Input
                  id="kpi_nombre"
                  name="kpi_nombre"
                  defaultValue={inversion?.kpi_nombre ?? ""}
                  placeholder="Ej. Disponibilidad"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kpi_unidad">Unidad</Label>
                <Input
                  id="kpi_unidad"
                  name="kpi_unidad"
                  defaultValue={inversion?.kpi_unidad ?? ""}
                  placeholder="Ej. %, líneas/HH"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kpi_objetivo">Objetivo</Label>
                <Input
                  id="kpi_objetivo"
                  name="kpi_objetivo"
                  type="number"
                  step="0.0001"
                  defaultValue={inversion?.kpi_objetivo ?? ""}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="proveedor">Proveedor</Label>
              <Input
                id="proveedor"
                name="proveedor"
                defaultValue={inversion?.proveedor ?? ""}
                placeholder="Proveedor / marca"
              />
            </div>
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
          </div>

          {/* Programación */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Inversión programada
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fecha_programada">Fecha programada</Label>
                <Input
                  id="fecha_programada"
                  name="fecha_programada"
                  type="date"
                  defaultValue={inversion?.fecha_programada ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monto_estimado">Monto estimado ($)</Label>
                <Input
                  id="monto_estimado"
                  name="monto_estimado"
                  type="number"
                  step="0.01"
                  defaultValue={inversion?.monto_estimado ?? ""}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Realización */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Al realizarse
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select
                  value={estado}
                  onValueChange={(v: string | null) =>
                    setEstado((v as EstadoInversion) ?? "programada")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADO_INVERSION_OPCIONES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fecha_realizada">Fecha real</Label>
                <Input
                  id="fecha_realizada"
                  name="fecha_realizada"
                  type="date"
                  defaultValue={inversion?.fecha_realizada ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monto_real">Cuánto salió ($)</Label>
                <Input
                  id="monto_real"
                  name="monto_real"
                  type="number"
                  step="0.01"
                  defaultValue={inversion?.monto_real ?? ""}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="evidencia">
              Cotización / factura (opcional)
            </Label>
            <Input id="evidencia" name="evidencia" type="file" />
            {inversion?.evidencia_url && (
              <button
                type="button"
                onClick={() => onAbrirArchivo(inversion.evidencia_url)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                <FileDown className="size-3.5" />
                {inversion.evidencia_nombre ?? "Ver archivo actual"}
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              name="observaciones"
              rows={2}
              defaultValue={inversion?.observaciones ?? ""}
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
              {editing ? "Guardar cambios" : "Crear inversión"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
