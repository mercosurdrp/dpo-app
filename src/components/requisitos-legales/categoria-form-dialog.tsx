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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  crearCategoria,
  actualizarCategoria,
} from "@/actions/requisitos-legales"
import type {
  RequisitoLegalCategoria,
  TipoIdentificadorRequisito,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoria?: RequisitoLegalCategoria | null
  onSaved: () => void
}

const TIPO_OPCIONES: {
  value: TipoIdentificadorRequisito
  label: string
  hint: string
}[] = [
  {
    value: "ninguno",
    label: "Sin identificador",
    hint: "El nombre del item es libre (ej. \"Habilitación Ramallo\").",
  },
  {
    value: "vehiculo",
    label: "Vehículo",
    hint: "El nombre del item es la patente (ej. AF552QZ).",
  },
  {
    value: "persona",
    label: "Persona",
    hint: "El nombre del item es la persona (ej. Juan Pérez).",
  },
  {
    value: "ubicacion",
    label: "Ubicación",
    hint: "El nombre del item es la ubicación física.",
  },
]

export function CategoriaFormDialog({
  open,
  onOpenChange,
  categoria,
  onSaved,
}: Props) {
  const editing = !!categoria
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoIdentificadorRequisito>(
    categoria?.tipo_identificador ?? "ninguno",
  )

  useEffect(() => {
    if (open) {
      setTipo(categoria?.tipo_identificador ?? "ninguno")
      setError(null)
    }
  }, [open, categoria])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set("tipo_identificador", tipo)

    startTransition(async () => {
      const result = editing
        ? await actualizarCategoria(categoria!.id, formData)
        : await crearCategoria(formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  const tipoActivo = TIPO_OPCIONES.find((t) => t.value === tipo)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar tarjeta" : "Nueva tarjeta de requisitos"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              name="nombre"
              defaultValue={categoria?.nombre ?? ""}
              placeholder="Ej. 931, Seguros, REBA"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de identificador *</Label>
            <Select
              value={tipo}
              onValueChange={(v: string | null) =>
                setTipo((v ?? "ninguno") as TipoIdentificadorRequisito)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_OPCIONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipoActivo && (
              <p className="text-xs text-muted-foreground">{tipoActivo.hint}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="identificador_label">Etiqueta de columna</Label>
            <Input
              id="identificador_label"
              name="identificador_label"
              defaultValue={categoria?.identificador_label ?? ""}
              placeholder="Opcional. Ej. Vehículo, Persona"
            />
            <p className="text-xs text-muted-foreground">
              Texto que aparece como encabezado de la primera columna de la
              tabla. Si lo dejás vacío, se usa el tipo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="orden">Orden</Label>
            <Input
              id="orden"
              name="orden"
              type="number"
              defaultValue={categoria?.orden ?? ""}
              placeholder={editing ? undefined : "Auto (al final)"}
            />
            <p className="text-xs text-muted-foreground">
              Define la posición en la matriz y en los tabs. Vacío = al final.
            </p>
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
              {editing ? "Guardar cambios" : "Crear tarjeta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
