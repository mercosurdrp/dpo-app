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
  crearRequisito,
  actualizarRequisito,
} from "@/actions/requisitos-legales"
import { IS_MISIONES } from "@/lib/empresa"
import type {
  Profile,
  RequisitoLegalCategoria,
  RequisitoLegalConResponsable,
  TipoIdentificadorRequisito,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  requisito?: RequisitoLegalConResponsable | null
  categorias: RequisitoLegalCategoria[]
  defaultCategoriaId?: string
  responsables: Pick<Profile, "id" | "nombre" | "email">[]
  onSaved: () => void
}

function nombreLabel(tipo: TipoIdentificadorRequisito | undefined): string {
  switch (tipo) {
    case "vehiculo":
      return "Vehículo (patente)"
    case "persona":
      return "Persona"
    case "ubicacion":
      return "Ubicación"
    default:
      return "Requisito"
  }
}

function nombrePlaceholder(tipo: TipoIdentificadorRequisito | undefined): string {
  switch (tipo) {
    case "vehiculo":
      return "Ej. AF552QZ"
    case "persona":
      return "Ej. Juan Pérez"
    case "ubicacion":
      return "Ej. NAVE 1 - Puerta adelante"
    default:
      return "Ej. Habilitación Municipal Ramallo"
  }
}

export function RequisitoFormDialog({
  open,
  onOpenChange,
  requisito,
  categorias,
  defaultCategoriaId,
  responsables,
  onSaved,
}: Props) {
  const editing = !!requisito
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [categoriaId, setCategoriaId] = useState<string>(
    requisito?.categoria_id ?? defaultCategoriaId ?? "",
  )
  const [responsableId, setResponsableId] = useState<string>(
    requisito?.responsable_id ?? "",
  )

  useEffect(() => {
    if (open) {
      setCategoriaId(requisito?.categoria_id ?? defaultCategoriaId ?? "")
      setResponsableId(requisito?.responsable_id ?? "")
      setError(null)
    }
  }, [open, requisito, defaultCategoriaId])

  const categoriaActiva = categorias.find((c) => c.id === categoriaId)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    if (!editing) formData.set("categoria_id", categoriaId)
    if (responsableId) formData.set("responsable_id", responsableId)
    else formData.delete("responsable_id")

    startTransition(async () => {
      const result = editing
        ? await actualizarRequisito(requisito!.id, formData)
        : await crearRequisito(formData)
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
          <DialogTitle>
            {editing ? "Editar requisito" : "Nuevo requisito legal"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select
                value={categoriaId}
                onValueChange={(v: string | null) => setCategoriaId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría…" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="nombre">
              {nombreLabel(categoriaActiva?.tipo_identificador)} *
            </Label>
            <Input
              id="nombre"
              name="nombre"
              defaultValue={requisito?.nombre ?? ""}
              placeholder={nombrePlaceholder(categoriaActiva?.tipo_identificador)}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fecha_emision">Fecha de emisión</Label>
              <Input
                id="fecha_emision"
                name="fecha_emision"
                type="date"
                defaultValue={requisito?.fecha_emision ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fecha_vencimiento">Vencimiento *</Label>
              <Input
                id="fecha_vencimiento"
                name="fecha_vencimiento"
                type="date"
                defaultValue={requisito?.fecha_vencimiento ?? ""}
                required
              />
            </div>
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

          <div className={IS_MISIONES ? "space-y-1.5" : "grid gap-3 sm:grid-cols-2"}>
            <div className="space-y-1.5">
              <Label htmlFor="archivo">
                {IS_MISIONES ? "Foto / archivo" : "Foto / archivo — frente"}
              </Label>
              <Input
                id="archivo"
                name="archivo"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              />
              <p className="text-xs text-muted-foreground">
                {editing
                  ? requisito?.archivo_nombre
                    ? `Actual: ${requisito.archivo_nombre}. Subí uno para reemplazarlo.`
                    : "Opcional. Sin archivo cargado."
                  : "Opcional (PDF o imagen)."}
              </p>
            </div>
            {!IS_MISIONES && (
              <div className="space-y-1.5">
                <Label htmlFor="archivo_2">Foto / archivo — dorso</Label>
                <Input
                  id="archivo_2"
                  name="archivo_2"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                />
                <p className="text-xs text-muted-foreground">
                  {editing
                    ? requisito?.archivo_nombre_2
                      ? `Actual: ${requisito.archivo_nombre_2}. Subí uno para reemplazarlo.`
                      : "Opcional (ej. dorso del carnet)."
                    : "Opcional (ej. dorso del carnet)."}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              name="observaciones"
              defaultValue={requisito?.observaciones ?? ""}
              rows={2}
              placeholder="Proveedor, póliza, valor, etc."
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
              {editing ? "Guardar cambios" : "Crear requisito"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
