"use client"

import { useState, useTransition } from "react"
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
import { crearAccion } from "@/actions/s5-acciones"
import { S5_TIPO_LABELS, type S5Tipo } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  responsables: { id: string; nombre: string; email: string }[]
  vehiculos: { id: string; dominio: string }[]
  onSaved: () => void
}

const SECTORES_ALMACEN = [1, 2, 3, 4] as const

export function CrearAccionDialog({
  open,
  onOpenChange,
  responsables,
  vehiculos,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [tipo, setTipo] = useState<S5Tipo>("flota")
  const [sectorNumero, setSectorNumero] = useState<string>("1")
  const [vehiculoId, setVehiculoId] = useState<string>("none")
  const [descripcion, setDescripcion] = useState("")
  const [responsableId, setResponsableId] = useState<string>("")
  const [fechaCompromiso, setFechaCompromiso] = useState<string>("")

  function reset() {
    setError(null)
    setTipo("flota")
    setSectorNumero("1")
    setVehiculoId("none")
    setDescripcion("")
    setResponsableId("")
    setFechaCompromiso("")
  }

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
      const res = await crearAccion({
        tipo,
        sectorNumero:
          tipo === "almacen" ? parseInt(sectorNumero, 10) : null,
        vehiculoId:
          tipo === "flota" && vehiculoId !== "none" ? vehiculoId : null,
        descripcion: descripcion.trim(),
        responsableId,
        fechaCompromiso: fechaCompromiso || null,
      })
      if ("error" in res) {
        setError(res.error)
        return
      }
      toast.success("Acción creada")
      reset()
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva acción 5S</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5">Tipo</Label>
              <Select
                value={tipo}
                onValueChange={(v) => setTipo(v as S5Tipo)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flota">
                    {S5_TIPO_LABELS.flota}
                  </SelectItem>
                  <SelectItem value="almacen">
                    {S5_TIPO_LABELS.almacen}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipo === "almacen" ? (
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
                    {SECTORES_ALMACEN.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Sector {n}
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
          </div>

          <div>
            <Label className="mb-1.5">Descripción</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="¿Qué hay que hacer?"
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
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
