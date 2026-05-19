"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  actualizarIndicadorConfig,
  crearIndicadorConfig,
  eliminarIndicadorConfig,
  listIndicadoresConfig,
} from "@/actions/reuniones"
import type {
  ReunionIndicadorConfig,
  TipoReunion,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tipo: TipoReunion
  tipoLabel: string
  onSaved: () => void
}

export function ConfigurarIndicadoresDialog({
  open,
  onOpenChange,
  tipo,
  tipoLabel,
  onSaved,
}: Props) {
  const [items, setItems] = useState<ReunionIndicadorConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [nuevoAgregacion, setNuevoAgregacion] = useState<"suma" | "promedio">(
    "promedio",
  )

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await listIndicadoresConfig(tipo)
    if ("data" in result) {
      setItems(result.data)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [tipo])

  useEffect(() => {
    if (open) {
      cargar()
      setEditingId(null)
    }
  }, [open, cargar])

  function handleCrear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set("tipo", tipo)
    formData.set("agregacion", nuevoAgregacion)

    const nombre = ((formData.get("nombre") as string | null) ?? "").trim()
    if (!nombre) {
      setError("El nombre es obligatorio.")
      return
    }

    startTransition(async () => {
      const result = await crearIndicadorConfig(formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      form.reset()
      setNuevoAgregacion("promedio")
      cargar()
      onSaved()
    })
  }

  function handleEliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar el indicador "${nombre}"?`)) return
    startTransition(async () => {
      const result = await eliminarIndicadorConfig(id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      cargar()
      onSaved()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Indicadores — {tipoLabel}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando…
          </div>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="w-24">Unidad</TableHead>
                    <TableHead className="w-24">Meta</TableHead>
                    <TableHead className="w-20">Orden</TableHead>
                    <TableHead className="w-44 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        Sin indicadores configurados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((it) => (
                      <IndicadorConfigRow
                        key={it.id}
                        item={it}
                        editing={editingId === it.id}
                        onStartEdit={() => setEditingId(it.id)}
                        onCancelEdit={() => setEditingId(null)}
                        onSaved={() => {
                          setEditingId(null)
                          cargar()
                          onSaved()
                        }}
                        onDelete={() => handleEliminar(it.id, it.nombre)}
                        pending={pending}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <form
              onSubmit={handleCrear}
              className="space-y-3 rounded-lg border bg-slate-50 p-3"
            >
              <p className="text-sm font-medium text-slate-900">
                <Plus className="mr-1 inline size-4 text-slate-600" />
                Nuevo indicador
              </p>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 sm:col-span-5 space-y-1.5">
                  <Label htmlFor="ind_nombre" className="text-xs">
                    Nombre *
                  </Label>
                  <Input
                    id="ind_nombre"
                    name="nombre"
                    placeholder="Ej: Asistencia"
                    required
                  />
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1.5">
                  <Label htmlFor="ind_unidad" className="text-xs">
                    Unidad
                  </Label>
                  <Input id="ind_unidad" name="unidad" placeholder="%" />
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1.5">
                  <Label htmlFor="ind_meta" className="text-xs">
                    Meta
                  </Label>
                  <Input
                    id="ind_meta"
                    name="meta"
                    type="number"
                    step="any"
                    placeholder="100"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1.5">
                  <Label htmlFor="ind_orden" className="text-xs">
                    Orden
                  </Label>
                  <Input
                    id="ind_orden"
                    name="orden"
                    type="number"
                    placeholder="1"
                  />
                </div>
                <div className="col-span-8 sm:col-span-4 space-y-1.5">
                  <Label
                    htmlFor="ind_agregacion"
                    className="text-xs"
                    title="Cómo se calcula el MTD (Month-to-Date): suma de los valores diarios o promedio."
                  >
                    Agregación MTD
                  </Label>
                  <Select
                    value={nuevoAgregacion}
                    onValueChange={(v: string | null) =>
                      setNuevoAgregacion(
                        v === "suma" ? "suma" : "promedio",
                      )
                    }
                  >
                    <SelectTrigger id="ind_agregacion">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="promedio">Promedio</SelectItem>
                      <SelectItem value="suma">Suma</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Cómo se calcula el MTD: suma o promedio de los valores diarios.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 size-4" />
                  )}
                  Agregar indicador
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function IndicadorConfigRow({
  item,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onDelete,
  pending,
}: {
  item: ReunionIndicadorConfig
  editing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaved: () => void
  onDelete: () => void
  pending: boolean
}) {
  const [savingLocal, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [agregacion, setAgregacion] = useState<"suma" | "promedio">(
    item.agregacion === "suma" ? "suma" : "promedio",
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set("agregacion", agregacion)
    const nombre = ((formData.get("nombre") as string | null) ?? "").trim()
    if (!nombre) {
      setError("Nombre obligatorio")
      return
    }
    startSaving(async () => {
      const result = await actualizarIndicadorConfig(item.id, formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved()
    })
  }

  if (!editing) {
    return (
      <TableRow>
        <TableCell className="font-medium">{item.nombre}</TableCell>
        <TableCell>{item.unidad ?? "—"}</TableCell>
        <TableCell>{item.meta ?? "—"}</TableCell>
        <TableCell>{item.orden}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onStartEdit}
              disabled={pending}
            >
              <Pencil className="mr-1.5 size-3.5" />
              Editar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={onDelete}
              disabled={pending}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Eliminar
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow>
      <TableCell colSpan={5} className="bg-slate-50">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 sm:col-span-5">
              <Input
                name="nombre"
                defaultValue={item.nombre}
                placeholder="Nombre"
                required
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Input
                name="unidad"
                defaultValue={item.unidad ?? ""}
                placeholder="Unidad"
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Input
                name="meta"
                type="number"
                step="any"
                defaultValue={item.meta ?? ""}
                placeholder="Meta"
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Input
                name="orden"
                type="number"
                defaultValue={item.orden}
                placeholder="Orden"
              />
            </div>
            <div className="col-span-8 sm:col-span-3">
              <Select
                value={agregacion}
                onValueChange={(v: string | null) =>
                  setAgregacion(v === "suma" ? "suma" : "promedio")
                }
              >
                <SelectTrigger title="Agregación MTD: cómo se calcula el MTD (Month-to-Date), suma o promedio de los valores diarios.">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="promedio">Promedio</SelectItem>
                  <SelectItem value="suma">Suma</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && (
            <p className="text-xs text-red-700">{error}</p>
          )}
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancelEdit}
              disabled={savingLocal}
            >
              <X className="mr-1.5 size-3.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={savingLocal}>
              {savingLocal ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Pencil className="mr-2 size-4" />
              )}
              Guardar
            </Button>
          </div>
        </form>
      </TableCell>
    </TableRow>
  )
}
