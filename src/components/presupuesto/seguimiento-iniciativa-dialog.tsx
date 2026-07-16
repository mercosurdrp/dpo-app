"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
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
import { guardarSeguimiento } from "@/actions/presupuesto-iniciativas"
import type { IniciativaAhorroConDetalle } from "@/types/database"
import { TRIMESTRES } from "./iniciativas-constantes"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  iniciativa: IniciativaAhorroConDetalle
  defaultTrimestre?: number
  onSaved: () => void
  onAbrirArchivo: (url: string | null) => void
}

export function SeguimientoIniciativaDialog({
  open,
  onOpenChange,
  iniciativa,
  defaultTrimestre,
  onSaved,
  onAbrirArchivo,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [trimestre, setTrimestre] = useState<number>(defaultTrimestre ?? 1)
  // Clave para forzar el remount del form (y resetear defaultValue) al cambiar de Q
  const [formKey, setFormKey] = useState(0)

  const existente = useMemo(
    () =>
      iniciativa.seguimientos.find((s) => s.trimestre === trimestre) ?? null,
    [iniciativa.seguimientos, trimestre],
  )

  useEffect(() => {
    if (open) {
      setTrimestre(defaultTrimestre ?? 1)
      setError(null)
      setFormKey((k) => k + 1)
    }
  }, [open, defaultTrimestre])

  function cambiarTrimestre(v: string | null) {
    setTrimestre(Number(v) || 1)
    setFormKey((k) => k + 1)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("iniciativa_id", iniciativa.id)
    formData.set("anio", String(iniciativa.anio))
    formData.set("trimestre", String(trimestre))

    startTransition(async () => {
      const result = await guardarSeguimiento(formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  const kpiSufijo = iniciativa.kpi_unidad ? ` (${iniciativa.kpi_unidad})` : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cargar avance trimestral</DialogTitle>
        </DialogHeader>

        <p className="-mt-1 line-clamp-1 text-sm text-muted-foreground">
          {iniciativa.titulo} · {iniciativa.anio}
        </p>

        <form key={formKey} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Trimestre</Label>
            <Select value={String(trimestre)} onValueChange={cambiarTrimestre}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIMESTRES.map((q) => (
                  <SelectItem key={q} value={String(q)}>
                    Q{q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {existente && (
              <p className="text-xs text-amber-700">
                Ya hay datos cargados para Q{trimestre}: se actualizarán.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ahorro_real">Ahorro real del Q ($)</Label>
              <Input
                id="ahorro_real"
                name="ahorro_real"
                type="number"
                step="0.01"
                defaultValue={existente?.ahorro_real ?? ""}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kpi_valor">
                {iniciativa.kpi_nombre
                  ? `${iniciativa.kpi_nombre}${kpiSufijo}`
                  : `Valor del KPI${kpiSufijo}`}
              </Label>
              <Input
                id="kpi_valor"
                name="kpi_valor"
                type="number"
                step="0.0001"
                defaultValue={existente?.kpi_valor ?? ""}
                placeholder="0"
              />
              {/* El seguimiento es trimestral pero los KPI suelen ser mensuales
                  ("$ vencidos por mes"): sin esta aclaración no se sabe si va el
                  total del Q o el promedio, y hoy se venía cargando el promedio. */}
              <p className="text-xs text-muted-foreground">
                Si la métrica es mensual, cargá el promedio de los 3 meses del
                trimestre.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comentario">Comentario</Label>
            <Textarea
              id="comentario"
              name="comentario"
              rows={2}
              defaultValue={existente?.comentario ?? ""}
              placeholder="Avance, contexto, qué falta…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="evidencia">Evidencia (opcional)</Label>
            <Input id="evidencia" name="evidencia" type="file" />
            {existente?.evidencia_url && (
              <button
                type="button"
                onClick={() => onAbrirArchivo(existente.evidencia_url)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                <FileDown className="size-3.5" />
                {existente.evidencia_nombre ?? "Ver evidencia actual"}
              </button>
            )}
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
              Guardar avance
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
