"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Trash2 } from "lucide-react"
import {
  deleteHerramienta,
  upsertHerramienta,
  type Herramienta,
} from "@/actions/mantenimiento-herramientas"

import { DpoSeccionCinta } from "./_components/dpo-badge"

const fmtNum = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("es-AR").format(v)

interface Props {
  herramientas: Herramienta[]
  puedeEditar: boolean
}

// Registro simple de herramientas de taller: vista para todos, alta/edición/baja
// solo para admin/supervisor (prop puedeEditar). Sin sub-tabs ni OC/novedades:
// es más liviano que el inventario de repuestos.
export function HerramientasTab({ herramientas, puedeEditar }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editar, setEditar] = useState<Herramienta | null>(null)

  const borrar = async (id: string) => {
    const res = await deleteHerramienta(id)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success("Herramienta eliminada")
      refresh()
    }
  }

  return (
    <div className="space-y-3">
      <DpoSeccionCinta seccionId="herramientas" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Registro de herramientas del taller/pañol de mantenimiento.
        </p>
        {puedeEditar && (
          <Button
            size="sm"
            onClick={() => {
              setEditar(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-1 size-4" /> Agregar herramienta
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {herramientas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin herramientas cargadas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Herramienta</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Notas</TableHead>
                  {puedeEditar && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {herramientas.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">
                      {puedeEditar ? (
                        <button
                          className="text-left hover:underline"
                          onClick={() => {
                            setEditar(h)
                            setDialogOpen(true)
                          }}
                        >
                          {h.nombre}
                        </button>
                      ) : (
                        h.nombre
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtNum(h.cantidad)}
                    </TableCell>
                    <TableCell className="text-foreground">{h.estado || "—"}</TableCell>
                    <TableCell className="text-foreground">{h.ubicacion || "—"}</TableCell>
                    <TableCell className="max-w-56 text-muted-foreground">
                      {h.notas || "—"}
                    </TableCell>
                    {puedeEditar && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          onClick={() => borrar(h.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <HerramientaDialog
          herramienta={editar}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function HerramientaDialog({
  herramienta,
  onClose,
  onSaved,
}: {
  herramienta: Herramienta | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(herramienta?.nombre ?? "")
  const [cantidad, setCantidad] = useState(
    herramienta ? String(herramienta.cantidad) : "1"
  )
  const [estado, setEstado] = useState(herramienta?.estado ?? "")
  const [ubicacion, setUbicacion] = useState(herramienta?.ubicacion ?? "")
  const [notas, setNotas] = useState(herramienta?.notas ?? "")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!nombre.trim()) return toast.error("Ingresá el nombre de la herramienta")
    setSaving(true)
    const n = parseInt(cantidad, 10)
    const res = await upsertHerramienta({
      id: herramienta?.id,
      nombre,
      cantidad: isNaN(n) ? 1 : n,
      estado,
      ubicacion,
      notas,
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success(herramienta ? "Herramienta actualizada" : "Herramienta cargada")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {herramienta ? "Editar herramienta" : "Nueva herramienta"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cantidad</Label>
              <Input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
            <div>
              <Label>Estado</Label>
              <Input
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                placeholder="Ej: bueno / a reparar"
              />
            </div>
          </div>
          <div>
            <Label>Ubicación</Label>
            <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
