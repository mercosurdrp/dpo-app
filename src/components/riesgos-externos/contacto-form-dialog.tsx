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
  actualizarContacto,
  crearContacto,
} from "@/actions/riesgos-externos-contactos"
import {
  CATEGORIA_CONTACTO_RIESGO_LABELS,
  TIPO_RIESGO_EXTERNO_LABELS,
  type CategoriaContactoRiesgo,
  type RiesgoExternoContacto,
  type TipoRiesgoExterno,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacto?: RiesgoExternoContacto | null
  tipoRiesgoInicial?: TipoRiesgoExterno | null
  onSaved: () => void
}

export function ContactoFormDialog({
  open,
  onOpenChange,
  contacto,
  tipoRiesgoInicial,
  onSaved,
}: Props) {
  const editing = !!contacto
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [tipoRiesgo, setTipoRiesgo] = useState<TipoRiesgoExterno | "">("")
  const [categoria, setCategoria] = useState<CategoriaContactoRiesgo>("externo")

  useEffect(() => {
    if (open) {
      setTipoRiesgo(contacto?.tipo_riesgo ?? tipoRiesgoInicial ?? "")
      setCategoria(contacto?.categoria ?? "externo")
      setError(null)
    }
  }, [open, contacto, tipoRiesgoInicial])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set("tipo_riesgo", tipoRiesgo)
    formData.set("categoria", categoria)

    startTransition(async () => {
      const result = editing
        ? await actualizarContacto(contacto!.id, formData)
        : await crearContacto(formData)
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
            {editing ? `Editar contacto — ${contacto?.nombre}` : "Nuevo contacto"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Riesgo *</Label>
              <Select
                value={tipoRiesgo}
                onValueChange={(v: string | null) =>
                  setTipoRiesgo((v ?? "") as TipoRiesgoExterno | "")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar riesgo…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_RIESGO_EXTERNO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si el mismo proveedor cubre varios riesgos, cargalo una vez por
                cada uno.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select
                value={categoria}
                onValueChange={(v: string | null) =>
                  setCategoria((v ?? "externo") as CategoriaContactoRiesgo)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIA_CONTACTO_RIESGO_LABELS).map(
                    ([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre / a quién se llama *</Label>
              <Input
                id="nombre"
                name="nombre"
                defaultValue={contacto?.nombre ?? ""}
                placeholder="Ej: Club Rental, Bomberos, Jefe de Logística"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="empresa">Empresa</Label>
              <Input
                id="empresa"
                name="empresa"
                defaultValue={contacto?.empresa ?? ""}
                placeholder="Razón social"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="referente">Referente</Label>
              <Input
                id="referente"
                name="referente"
                defaultValue={contacto?.referente ?? ""}
                placeholder="Persona de contacto"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={contacto?.email ?? ""}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                name="telefono"
                defaultValue={contacto?.telefono ?? ""}
                placeholder="Ej: 3364 218522"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefono_alt">Teléfono alternativo</Label>
              <Input
                id="telefono_alt"
                name="telefono_alt"
                defaultValue={contacto?.telefono_alt ?? ""}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="horario">Horario de atención</Label>
              <Input
                id="horario"
                name="horario"
                defaultValue={contacto?.horario ?? ""}
                placeholder="Ej: 24 h, Lu-Vi 8 a 18"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orden">Orden</Label>
              <Input
                id="orden"
                name="orden"
                type="number"
                defaultValue={contacto?.orden ?? 0}
              />
              <p className="text-xs text-muted-foreground">
                A quién se llama primero dentro del riesgo.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Textarea
              id="notas"
              name="notas"
              rows={2}
              defaultValue={contacto?.notas ?? ""}
              placeholder="Cuándo llamarlo, qué pedirle, nº de contrato…"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

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
              {editing ? "Guardar cambios" : "Agregar contacto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
