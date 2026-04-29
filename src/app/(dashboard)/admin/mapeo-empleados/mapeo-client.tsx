"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Link2,
  Link2Off,
  Truck,
  User,
  Loader2,
  Check,
  Plus,
  Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  upsertMapeoChofer,
  upsertMapeoFletero,
  createEmpleado,
  updateEmpleado,
} from "@/actions/mapeo-empleados"
import {
  SECTORES_EMPLEADO,
  type SectorEmpleado,
} from "@/actions/mapeo-empleados.types"
import type { EmpleadoCompleto } from "@/types/database"

type EmpleadoLite = {
  id: string
  legajo: number
  nombre: string
  sector: string
  numero_id: string
  activo: boolean
}

interface Props {
  mapeos: EmpleadoCompleto[]
  unmappedChoferes: { id: string; nombre: string }[]
  unmappedFleteros: string[]
  empleados: EmpleadoLite[]
  empleadosTodos: EmpleadoLite[]
}

type EmpleadoFormState = {
  legajo: string
  nombre: string
  numero_id: string
  sector: SectorEmpleado
  activo: boolean
}

const EMPTY_FORM: EmpleadoFormState = {
  legajo: "",
  nombre: "",
  numero_id: "",
  sector: "Distribución",
  activo: true,
}

export function MapeoClient({
  mapeos,
  unmappedChoferes,
  unmappedFleteros,
  empleados,
  empleadosTodos,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [savingChofer, setSavingChofer] = useState<string | null>(null)
  const [savingFletero, setSavingFletero] = useState<string | null>(null)

  // Dialog state for create/edit empleado
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EmpleadoFormState>(EMPTY_FORM)
  const [savingEmpleado, setSavingEmpleado] = useState(false)

  // Track selected empleado for each unmapped item
  const [choferSelections, setChoferSelections] = useState<
    Record<string, string>
  >({})
  const [fleteroSelections, setFleteroSelections] = useState<
    Record<string, string>
  >({})

  const totalMapeados = mapeos.filter(
    (m) => m.ds_fletero_carga || m.nombre_chofer
  ).length
  const totalSinMapear = mapeos.filter(
    (m) => !m.ds_fletero_carga && !m.nombre_chofer
  ).length

  const empleadosById = new Map(empleadosTodos.map((e) => [e.id, e]))

  function openCreateDialog() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEditDialog(empleadoId: string) {
    const emp = empleadosById.get(empleadoId)
    if (!emp) {
      toast.error("Empleado no encontrado")
      return
    }
    setEditingId(empleadoId)
    setForm({
      legajo: String(emp.legajo),
      nombre: emp.nombre,
      numero_id: emp.numero_id ?? "",
      sector: (SECTORES_EMPLEADO.includes(emp.sector as SectorEmpleado)
        ? emp.sector
        : "Distribución") as SectorEmpleado,
      activo: emp.activo,
    })
    setDialogOpen(true)
  }

  async function handleSaveEmpleado() {
    const legajoNum = Number(form.legajo)
    if (!Number.isInteger(legajoNum) || legajoNum <= 0) {
      toast.error("Legajo debe ser un entero positivo")
      return
    }
    if (!form.nombre.trim()) {
      toast.error("Nombre es obligatorio")
      return
    }
    if (!form.numero_id.trim()) {
      toast.error("Número de documento es obligatorio")
      return
    }

    setSavingEmpleado(true)
    const payload = {
      legajo: legajoNum,
      nombre: form.nombre.trim(),
      numero_id: form.numero_id.trim(),
      sector: form.sector,
      activo: form.activo,
    }

    const result = editingId
      ? await updateEmpleado(editingId, payload)
      : await createEmpleado(payload)

    setSavingEmpleado(false)

    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success(editingId ? "Empleado actualizado" : "Empleado creado")
    setDialogOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    startTransition(() => router.refresh())
  }

  async function handleSaveChofer(nombreChofer: string) {
    const empleadoId = choferSelections[nombreChofer]
    if (!empleadoId) {
      toast.error("Selecciona un empleado")
      return
    }
    setSavingChofer(nombreChofer)
    const result = await upsertMapeoChofer(empleadoId, nombreChofer)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`Chofer "${nombreChofer}" vinculado`)
      startTransition(() => router.refresh())
    }
    setSavingChofer(null)
  }

  async function handleSaveFletero(dsFletero: string) {
    const empleadoId = fleteroSelections[dsFletero]
    if (!empleadoId) {
      toast.error("Selecciona un empleado")
      return
    }
    setSavingFletero(dsFletero)
    const result = await upsertMapeoFletero(empleadoId, dsFletero)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`Fletero "${dsFletero}" vinculado`)
      startTransition(() => router.refresh())
    }
    setSavingFletero(null)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Mapeo de Empleados
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vincular identidades externas (fleteros ERP, choferes TML) con
            empleados del sistema
          </p>
        </div>
        <Button onClick={openCreateDialog} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Nuevo empleado
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Empleados" value={mapeos.length} />
        <StatCard label="Mapeados" value={totalMapeados} color="green" />
        <StatCard label="Sin mapear" value={totalSinMapear} color="amber" />
        <StatCard
          label="Pendientes"
          value={unmappedChoferes.length + unmappedFleteros.length}
          color="red"
        />
      </div>

      <Tabs defaultValue="empleados">
        <TabsList>
          <TabsTrigger value="empleados">Empleados</TabsTrigger>
          <TabsTrigger value="choferes">
            Choferes TML sin mapear ({unmappedChoferes.length})
          </TabsTrigger>
          <TabsTrigger value="fleteros">
            Fleteros ERP sin mapear ({unmappedFleteros.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab: Empleados con mapeos */}
        <TabsContent value="empleados">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Legajo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Chofer TML</TableHead>
                  <TableHead>Fletero ERP</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapeos.map((m) => {
                  const hasMaping = m.ds_fletero_carga || m.nombre_chofer
                  const editable = empleadosById.has(m.empleado_id)
                  const isInactive = !empleadosById.get(m.empleado_id)?.activo
                  return (
                    <TableRow
                      key={`${m.empleado_id}-${m.nombre_chofer}-${m.ds_fletero_carga}`}
                    >
                      <TableCell className="font-mono text-sm">
                        {m.legajo}
                      </TableCell>
                      <TableCell className="font-medium">
                        {m.nombre}
                        {isInactive && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            inactivo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{m.sector}</Badge>
                      </TableCell>
                      <TableCell>
                        {m.nombre_chofer ? (
                          <span className="text-sm">{m.nombre_chofer}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.ds_fletero_carga ? (
                          <span className="font-mono text-sm">
                            {m.ds_fletero_carga}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasMaping ? (
                          <Link2 className="size-4 text-green-600" />
                        ) : (
                          <Link2Off className="size-4 text-amber-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(m.empleado_id)}
                          disabled={!editable}
                          title="Editar empleado"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab: Choferes TML sin mapear */}
        <TabsContent value="choferes">
          {unmappedChoferes.length === 0 ? (
            <EmptyState
              icon={<User className="h-14 w-14 text-muted-foreground/40" />}
              title="Todos los choferes mapeados"
              description="No hay choferes TML pendientes de vincular."
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chofer TML</TableHead>
                    <TableHead>Vincular a empleado</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmappedChoferes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell>
                        <Select
                          value={choferSelections[c.nombre] ?? ""}
                          onValueChange={(val: string | null) =>
                            setChoferSelections((prev) => ({
                              ...prev,
                              [c.nombre]: val ?? "",
                            }))
                          }
                        >
                          <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Seleccionar empleado..." />
                          </SelectTrigger>
                          <SelectContent>
                            {empleados.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.legajo} - {e.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          disabled={
                            !choferSelections[c.nombre] ||
                            savingChofer === c.nombre ||
                            isPending
                          }
                          onClick={() => handleSaveChofer(c.nombre)}
                        >
                          {savingChofer === c.nombre ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3.5 w-3.5" />
                          )}
                          Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Tab: Fleteros ERP sin mapear */}
        <TabsContent value="fleteros">
          {unmappedFleteros.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-14 w-14 text-muted-foreground/40" />}
              title="Todos los fleteros mapeados"
              description="No hay patentes de fletero pendientes de vincular."
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patente (ERP)</TableHead>
                    <TableHead>Vincular a empleado</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmappedFleteros.map((f) => (
                    <TableRow key={f}>
                      <TableCell className="font-mono font-medium">
                        {f}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={fleteroSelections[f] ?? ""}
                          onValueChange={(val: string | null) =>
                            setFleteroSelections((prev) => ({
                              ...prev,
                              [f]: val ?? "",
                            }))
                          }
                        >
                          <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Seleccionar empleado..." />
                          </SelectTrigger>
                          <SelectContent>
                            {empleados.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.legajo} - {e.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          disabled={
                            !fleteroSelections[f] ||
                            savingFletero === f ||
                            isPending
                          }
                          onClick={() => handleSaveFletero(f)}
                        >
                          {savingFletero === f ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3.5 w-3.5" />
                          )}
                          Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar empleado" : "Nuevo empleado"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Modificá los datos del empleado seleccionado."
                : "Completá los datos del nuevo empleado."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="empleado-legajo">Legajo</Label>
              <Input
                id="empleado-legajo"
                type="number"
                inputMode="numeric"
                value={form.legajo}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, legajo: e.target.value }))
                }
                placeholder="Ej: 245"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="empleado-nombre">Nombre completo</Label>
              <Input
                id="empleado-nombre"
                value={form.nombre}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nombre: e.target.value }))
                }
                placeholder="Apellido, Nombre"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="empleado-numero-id">Número de documento</Label>
              <Input
                id="empleado-numero-id"
                value={form.numero_id}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, numero_id: e.target.value }))
                }
                placeholder="DNI sin puntos"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="empleado-sector">Sector</Label>
              <Select
                value={form.sector}
                onValueChange={(val: string | null) =>
                  setForm((prev) => ({
                    ...prev,
                    sector: (val ?? "Distribución") as SectorEmpleado,
                  }))
                }
              >
                <SelectTrigger id="empleado-sector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTORES_EMPLEADO.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={form.activo}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, activo: checked === true }))
                }
              />
              <span>Empleado activo</span>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={savingEmpleado}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveEmpleado} disabled={savingEmpleado}>
              {savingEmpleado ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1 h-3.5 w-3.5" />
              )}
              {editingId ? "Guardar cambios" : "Crear empleado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: "green" | "amber" | "red"
}) {
  const colorClass =
    color === "green"
      ? "text-green-600"
      : color === "amber"
        ? "text-amber-600"
        : color === "red"
          ? "text-red-600"
          : "text-slate-900"

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3">
      {icon}
      <h2 className="text-lg font-semibold text-slate-700">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
