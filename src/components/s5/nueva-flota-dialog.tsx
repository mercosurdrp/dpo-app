"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { crearAuditoriaFlota } from "@/actions/s5"
import type { S5VehiculoPendiente } from "@/types/database"

function hoyISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function NuevaFlotaDialog({
  open,
  onOpenChange,
  vehiculos,
  pendientes,
  empleados,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  vehiculos: { id: string; dominio: string; descripcion: string | null }[]
  pendientes: S5VehiculoPendiente[]
  empleados: { id: string; legajo: number; nombre: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    fecha: hoyISO(),
    vehiculoId: "",
    choferEmpleadoId: "",
    ayudante1EmpleadoId: "",
    ayudante2EmpleadoId: "",
  })

  const pendientesSet = useMemo(
    () => new Set(pendientes.map((p) => p.id)),
    [pendientes]
  )

  const empleadoById = useMemo(
    () => new Map(empleados.map((e) => [e.id, e])),
    [empleados]
  )

  function reset() {
    setForm({
      fecha: hoyISO(),
      vehiculoId: "",
      choferEmpleadoId: "",
      ayudante1EmpleadoId: "",
      ayudante2EmpleadoId: "",
    })
  }

  function handleSubmit() {
    if (!form.vehiculoId) {
      toast.error("Seleccioná un vehículo")
      return
    }
    if (!form.fecha) {
      toast.error("Ingresá la fecha")
      return
    }
    const chofer = empleadoById.get(form.choferEmpleadoId)
    const ay1 = empleadoById.get(form.ayudante1EmpleadoId)
    const ay2 = empleadoById.get(form.ayudante2EmpleadoId)
    startTransition(async () => {
      const res = await crearAuditoriaFlota({
        fecha: form.fecha,
        vehiculoId: form.vehiculoId,
        choferNombre: chofer?.nombre,
        ayudante1: ay1?.nombre,
        ayudante2: ay2?.nombre,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Auditoría creada")
      reset()
      onOpenChange(false)
      router.push(`/5s/auditoria/${res.data.id}`)
    })
  }

  // Orden: pendientes primero, luego resto
  const vehiculosOrdenados = useMemo(() => {
    const pend = vehiculos.filter((v) => pendientesSet.has(v.id))
    const resto = vehiculos.filter((v) => !pendientesSet.has(v.id))
    return { pend, resto }
  }, [vehiculos, pendientesSet])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva auditoría de flota</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Fecha *</Label>
            <Input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            />
          </div>

          <div>
            <Label>Vehículo *</Label>
            <Select
              value={form.vehiculoId}
              onValueChange={(v) =>
                setForm({ ...form, vehiculoId: v ?? "" })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar vehículo" />
              </SelectTrigger>
              <SelectContent>
                {vehiculosOrdenados.pend.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                      Pendientes este mes
                    </div>
                    {vehiculosOrdenados.pend.map((v) => (
                      <SelectItem key={v.id} value={v.id} label={v.dominio}>
                        {v.dominio}
                        {v.descripcion && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            · {v.descripcion}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </>
                )}
                {vehiculosOrdenados.resto.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Todos
                    </div>
                    {vehiculosOrdenados.resto.map((v) => (
                      <SelectItem key={v.id} value={v.id} label={v.dominio}>
                        {v.dominio}
                        {v.descripcion && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            · {v.descripcion}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Chofer</Label>
            <Select
              value={form.choferEmpleadoId}
              onValueChange={(v) =>
                setForm({ ...form, choferEmpleadoId: v ?? "" })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar empleado" />
              </SelectTrigger>
              <SelectContent>
                {empleados.map((e) => (
                  <SelectItem key={e.id} value={e.id} label={e.nombre}>
                    {e.nombre}
                    <span className="ml-1 text-xs text-muted-foreground">
                      · #{e.legajo}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ayudante 1</Label>
              <Select
                value={form.ayudante1EmpleadoId}
                onValueChange={(v) =>
                  setForm({ ...form, ayudante1EmpleadoId: v ?? "" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Empleado" />
                </SelectTrigger>
                <SelectContent>
                  {empleados.map((e) => (
                    <SelectItem key={e.id} value={e.id} label={e.nombre}>
                      {e.nombre}
                      <span className="ml-1 text-xs text-muted-foreground">
                        · #{e.legajo}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ayudante 2</Label>
              <Select
                value={form.ayudante2EmpleadoId}
                onValueChange={(v) =>
                  setForm({ ...form, ayudante2EmpleadoId: v ?? "" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Empleado" />
                </SelectTrigger>
                <SelectContent>
                  {empleados.map((e) => (
                    <SelectItem key={e.id} value={e.id} label={e.nombre}>
                      {e.nombre}
                      <span className="ml-1 text-xs text-muted-foreground">
                        · #{e.legajo}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Creando..." : "Crear"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
