"use client"

// ABM del equipo WhatsApp (bot_vendedores_wa) + configuración de envíos.
// Solo admin. Los promotores necesitan teléfono cargado y activo=true para
// recibir alertas; los supervisores son filas con rol=supervisor.

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  deleteVendedorWa,
  getEquipoWa,
  updateConfigAlertas,
  upsertVendedorWa,
  type VendedorWaInput,
} from "@/actions/foxtrot-alertas"
import type { AlertasConfig, VendedorWa } from "@/lib/foxtrot-alertas/types"

const VACIO: VendedorWaInput = {
  id_promotor: "",
  nombre: "",
  phone_number: "",
  rol: "promotor",
  supervisor_id: null,
  activo: true,
  recibe_alertas_rechazo: true,
}

function esPendiente(phone: string): boolean {
  return !/^\d{8,15}$/.test(phone)
}

export function EquipoWaClient({
  equipoInicial,
  configInicial,
}: {
  equipoInicial: VendedorWa[]
  configInicial: AlertasConfig | null
}) {
  const [equipo, setEquipo] = useState(equipoInicial)
  const [config, setConfig] = useState(configInicial)
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<VendedorWaInput>(VACIO)
  const [esEdicion, setEsEdicion] = useState(false)
  const [isPending, startTransition] = useTransition()

  const supervisores = useMemo(
    () => equipo.filter((v) => v.rol === "supervisor"),
    [equipo],
  )

  const recargar = async () => {
    const r = await getEquipoWa()
    if ("data" in r) setEquipo(r.data)
  }

  const abrirNuevo = () => {
    setForm(VACIO)
    setEsEdicion(false)
    setAbierto(true)
  }

  const abrirEdicion = (v: VendedorWa) => {
    setForm({
      id_promotor: v.id_promotor,
      nombre: v.nombre,
      phone_number: esPendiente(v.phone_number) ? "" : v.phone_number,
      rol: v.rol,
      supervisor_id: v.supervisor_id,
      activo: v.activo,
      recibe_alertas_rechazo: v.recibe_alertas_rechazo,
    })
    setEsEdicion(true)
    setAbierto(true)
  }

  const guardar = () => {
    startTransition(async () => {
      const r = await upsertVendedorWa(form)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("Guardado")
      setAbierto(false)
      await recargar()
    })
  }

  const eliminar = (v: VendedorWa) => {
    if (!confirm(`¿Eliminar a ${v.nombre} del equipo WhatsApp?`)) return
    startTransition(async () => {
      const r = await deleteVendedorWa(v.id_promotor)
      if ("error" in r) toast.error(r.error)
      else {
        toast.success("Eliminado")
        await recargar()
      }
    })
  }

  const guardarConfig = (patch: Partial<AlertasConfig>) => {
    startTransition(async () => {
      const r = await updateConfigAlertas(patch)
      if ("error" in r) toast.error(r.error)
      else {
        setConfig(r.data)
        toast.success("Configuración actualizada")
      }
    })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">
        Equipo WhatsApp y configuración de alertas
      </h1>

      {/* Config */}
      {config && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Configuración de envíos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={config.envios_activos}
                onCheckedChange={(c) => guardarConfig({ envios_activos: c === true })}
                disabled={isPending}
              />
              <span>
                Envíos activos{" "}
                <span className="text-muted-foreground text-xs">
                  (apagado = las alertas se registran pero no se manda WhatsApp)
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={config.dry_run}
                onCheckedChange={(c) => guardarConfig({ dry_run: c === true })}
                disabled={isPending}
              />
              <span>
                Modo simulación{" "}
                <span className="text-muted-foreground text-xs">
                  (genera el mensaje pero NO lo envía — para probar)
                </span>
              </span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Ventana de envío (ART)</span>
              <Input
                type="time"
                className="h-8 w-28 text-xs"
                defaultValue={config.ventana_desde.slice(0, 5)}
                onBlur={(e) =>
                  e.target.value && guardarConfig({ ventana_desde: `${e.target.value}:00` })
                }
              />
              <span className="text-xs">a</span>
              <Input
                type="time"
                className="h-8 w-28 text-xs"
                defaultValue={config.ventana_hasta.slice(0, 5)}
                onBlur={(e) =>
                  e.target.value && guardarConfig({ ventana_hasta: `${e.target.value}:00` })
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Equipo */}
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">
            Equipo ({equipo.length}) — promotores y supervisores
          </CardTitle>
          <Button size="sm" onClick={abrirNuevo}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Supervisor</TableHead>
                <TableHead>Alertas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipo.map((v) => (
                <TableRow key={v.id_promotor}>
                  <TableCell className="text-xs font-mono">{v.id_promotor}</TableCell>
                  <TableCell className="text-xs font-medium">{v.nombre}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        v.rol === "supervisor"
                          ? "bg-indigo-100 text-indigo-800 text-[10px]"
                          : "bg-slate-100 text-slate-700 text-[10px]"
                      }
                    >
                      {v.rol}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {esPendiente(v.phone_number) ? (
                      <span className="text-amber-600">sin cargar</span>
                    ) : (
                      v.phone_number
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {v.supervisor_id
                      ? (equipo.find((s) => s.id_promotor === v.supervisor_id)?.nombre ??
                        v.supervisor_id)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {v.recibe_alertas_rechazo ? "Sí" : "No"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        v.activo
                          ? "bg-emerald-100 text-emerald-800 text-[10px]"
                          : "bg-slate-100 text-slate-500 text-[10px]"
                      }
                    >
                      {v.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => abrirEdicion(v)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-600"
                        onClick={() => eliminar(v)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog alta/edición */}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{esEdicion ? "Editar integrante" : "Agregar integrante"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">ID promotor (Chess)</Label>
                <Input
                  value={form.id_promotor}
                  onChange={(e) => setForm({ ...form, id_promotor: e.target.value })}
                  disabled={esEdicion}
                  placeholder="ej 107 · sup_caballero"
                />
              </div>
              <div>
                <Label className="text-xs">Rol</Label>
                <Select
                  value={form.rol}
                  onValueChange={(v) =>
                    setForm({ ...form, rol: v as "promotor" | "supervisor" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="promotor">Promotor</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="APELLIDO NOMBRE"
              />
            </div>
            <div>
              <Label className="text-xs">
                Teléfono WhatsApp (internacional sin +, ej 5492477123456)
              </Label>
              <Input
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                placeholder="549..."
              />
            </div>
            {form.rol === "promotor" && (
              <div>
                <Label className="text-xs">Supervisor</Label>
                <Select
                  value={form.supervisor_id ?? "ninguno"}
                  onValueChange={(v) =>
                    setForm({ ...form, supervisor_id: v === "ninguno" ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Sin supervisor</SelectItem>
                    {supervisores.map((s) => (
                      <SelectItem key={s.id_promotor} value={s.id_promotor}>
                        {s.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.activo}
                  onCheckedChange={(c) => setForm({ ...form, activo: c === true })}
                />
                Activo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.recibe_alertas_rechazo}
                  onCheckedChange={(c) =>
                    setForm({ ...form, recibe_alertas_rechazo: c === true })
                  }
                />
                Recibe alertas de rechazo
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
