"use client"

// Proveedores de piezas y talleres (DPO Flota 2.3, R2.3.1a / R2.3.2a).
//
// El auditor lo dice textual: «en caso de que no tengan taller interno, tienen
// que tener ANS/SLA con sus principales proveedores». Esta solapa es la
// planilla oficial "Listado de Proveedores" (razón social, teléfono, mail,
// localidad, tipo de vehículo) más lo que la planilla no tiene y la app sí: el
// lead time acordado contra el medido en los pedidos, cuántas piezas del pañol
// se le compran a cada uno y si el ANS está firmado en /sla.

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FileSignature, Pencil, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { createProveedor, updateProveedor } from "@/actions/mantenimiento-gastos"
import { getPedidosRepuestos, type PedidoRepuestos } from "@/actions/pedidos-repuestos"
import { getSlas } from "@/actions/sla"
import type { Repuesto } from "@/actions/mantenimiento-vehiculos"
import type { MantenimientoProveedor } from "@/types/database"
import { DpoResponde } from "./dpo-badge"

const TIPOS_VEHICULO = ["Camión", "Autoelevador", "Camioneta", "Ambos", "Todos"] as const

interface SlaMin {
  nombre: string
  parte_proveedor: string | null
  estado: "pendiente" | "firmado" | "no_aplica"
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** ¿El SLA nombra a este proveedor? Por la primera palabra significativa del nombre. */
function slaDeProveedor(slas: SlaMin[], proveedor: string): SlaMin | null {
  const claves = norm(proveedor)
    .split(" ")
    .filter((w) => w.length >= 4)
  if (claves.length === 0) return null
  return (
    slas.find((s) => {
      const texto = `${norm(s.parte_proveedor)} ${norm(s.nombre)}`
      return claves.some((k) => texto.includes(k))
    }) ?? null
  )
}

export function ProveedoresRepuestos({
  proveedores,
  repuestos,
  puedeEditar,
  columnasNuevas,
}: {
  proveedores: MantenimientoProveedor[]
  repuestos: Repuesto[]
  puedeEditar: boolean
  columnasNuevas: boolean
}) {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<PedidoRepuestos[]>([])
  const [slas, setSlas] = useState<SlaMin[]>([])
  const [edit, setEdit] = useState<MantenimientoProveedor | null | "nuevo">(null)
  const [soloRepuestos, setSoloRepuestos] = useState(true)

  useEffect(() => {
    getPedidosRepuestos().then((r) => {
      if ("data" in r) setPedidos(r.data)
    })
    getSlas().then((r) => {
      if ("data" in r)
        setSlas(
          (r.data as unknown as Array<{ nombre: string; parte_proveedor: string | null; estado: SlaMin["estado"]; pilar: string }>)
            .filter((s) => s.pilar === "flota")
            .map((s) => ({ nombre: s.nombre, parte_proveedor: s.parte_proveedor, estado: s.estado }))
        )
    })
  }, [])

  // Lead time medido: pedidos retirados por proveedor (texto, normalizado).
  const medido = useMemo(() => {
    const m = new Map<string, { dias: number; n: number }>()
    for (const p of pedidos) {
      if (!p.proveedor || p.diasEspera == null || p.estado !== "retirado") continue
      const k = norm(p.proveedor)
      const acc = m.get(k) ?? { dias: 0, n: 0 }
      acc.dias += p.diasEspera
      acc.n++
      m.set(k, acc)
    }
    return m
  }, [pedidos])

  const piezasPorProveedor = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of repuestos) if (r.proveedor_id) m.set(r.proveedor_id, (m.get(r.proveedor_id) ?? 0) + 1)
    return m
  }, [repuestos])

  const lista = proveedores
    .filter((p) => p.activo)
    .filter((p) => !soloRepuestos || p.es_repuestos || piezasPorProveedor.has(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))

  const firmados = lista.filter((p) => slaDeProveedor(slas, p.nombre)?.estado === "firmado").length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Proveedores de piezas y talleres</h3>
          <p className="text-sm text-muted-foreground">
            Sin taller interno, el requisito pide ANS con los principales proveedores. Acá: datos de
            contacto (planilla DPO 2.3), lead time acordado contra el medido en los pedidos, y si el ANS
            está firmado.
          </p>
          <DpoResponde puntos={["2.3"]} requisitos={["R2.3.1", "R2.3.3", "R2.3.4"]} />
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{lista.length} proveedores</Badge>
            <Badge
              variant="outline"
              className={cn(
                firmados > 0
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              )}
            >
              {firmados} con ANS firmado
            </Badge>
            <label className="ml-1 flex items-center gap-1.5">
              <Checkbox checked={soloRepuestos} onCheckedChange={(c) => setSoloRepuestos(c === true)} />
              Solo repuestos
            </label>
          </div>
          {!columnasNuevas && (
            <p className="text-xs text-amber-700">
              Falta aplicar APLICAR_EN_PAMPEANA_INVENTARIO_2_3.sql: hasta entonces solo se ve el nombre.
            </p>
          )}
        </div>
        {puedeEditar && (
          <Button size="sm" onClick={() => setEdit("nuevo")}>
            <Plus className="mr-1 size-4" /> Nuevo proveedor
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin proveedores de repuestos marcados. Editá uno y tildá «Provee repuestos».
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Razón social / CUIT</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Localidad</TableHead>
                  <TableHead>Vehículo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-right">Piezas</TableHead>
                  <TableHead className="text-right">Lead time</TableHead>
                  <TableHead>ANS</TableHead>
                  {puedeEditar && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((p) => {
                  const med = medido.get(norm(p.nombre))
                  const sla = slaDeProveedor(slas, p.nombre)
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.razon_social || "—"}
                        {p.cuit && <div>CUIT {p.cuit}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.telefono || "—"}
                        {p.email && <div>{p.email}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{p.localidad || "—"}</TableCell>
                      <TableCell className="text-xs">{p.tipo_vehiculo || "—"}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {p.es_repuestos && <Badge variant="outline">Repuestos</Badge>}
                          {p.es_taller && <Badge variant="outline">Taller</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{piezasPorProveedor.get(p.id) ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {p.lead_time_dias != null ? `${p.lead_time_dias} d acordados` : "—"}
                        {med && (
                          <div
                            className={cn(
                              "text-muted-foreground",
                              p.lead_time_dias != null && med.dias / med.n > p.lead_time_dias && "text-destructive"
                            )}
                          >
                            {(med.dias / med.n).toFixed(0)} d medidos ({med.n})
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {sla ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1",
                              sla.estado === "firmado"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            )}
                            title={sla.nombre}
                          >
                            <FileSignature className="size-3" />
                            {sla.estado === "firmado" ? "Firmado" : "Pendiente de firma"}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin ANS</span>
                        )}
                      </TableCell>
                      {puedeEditar && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="size-7" onClick={() => setEdit(p)}>
                            <Pencil className="size-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {edit && (
        <ProveedorDialog
          proveedor={edit === "nuevo" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function ProveedorDialog({
  proveedor,
  onClose,
  onSaved,
}: {
  proveedor: MantenimientoProveedor | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(proveedor?.nombre ?? "")
  const [razon, setRazon] = useState(proveedor?.razon_social ?? "")
  const [cuit, setCuit] = useState(proveedor?.cuit ?? "")
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? "")
  const [email, setEmail] = useState(proveedor?.email ?? "")
  const [localidad, setLocalidad] = useState(proveedor?.localidad ?? "")
  const [tipoVeh, setTipoVeh] = useState(proveedor?.tipo_vehiculo ?? "none")
  const [esRepuestos, setEsRepuestos] = useState(proveedor?.es_repuestos ?? true)
  const [esTaller, setEsTaller] = useState(proveedor?.es_taller ?? false)
  const [leadTime, setLeadTime] = useState(proveedor?.lead_time_dias != null ? String(proveedor.lead_time_dias) : "")
  const [notas, setNotas] = useState(proveedor?.notas ?? "")
  const [activo, setActivo] = useState(proveedor?.activo ?? true)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!nombre.trim()) return toast.error("Ingresá el nombre")
    setSaving(true)
    let id = proveedor?.id
    if (!id) {
      const c = await createProveedor(nombre)
      if ("error" in c) {
        setSaving(false)
        return toast.error(c.error)
      }
      id = c.data.id
    }
    const lt = leadTime.trim() === "" ? null : Number(leadTime)
    const res = await updateProveedor(id, {
      nombre,
      activo,
      razon_social: razon,
      cuit,
      telefono,
      email,
      localidad,
      tipo_vehiculo: tipoVeh === "none" ? null : tipoVeh,
      es_repuestos: esRepuestos,
      es_taller: esTaller,
      lead_time_dias: lt != null && !isNaN(lt) ? lt : null,
      notas,
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Proveedor guardado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{proveedor ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nombre (como se lo conoce)</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <Label>Razón social</Label>
              <Input value={razon} onChange={(e) => setRazon(e.target.value)} />
            </div>
            <div>
              <Label>CUIT</Label>
              <Input value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="30-12345678-9" />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
            <div>
              <Label>Mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Localidad</Label>
              <Input value={localidad} onChange={(e) => setLocalidad(e.target.value)} />
            </div>
            <div>
              <Label>Tipo de vehículo</Label>
              <Select value={tipoVeh} onValueChange={(v) => setTipoVeh(v ?? "none")}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {TIPOS_VEHICULO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lead time acordado (días)</Label>
              <Input type="number" min={0} value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
            </div>
            <div className="flex flex-col justify-end gap-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={esRepuestos} onCheckedChange={(c) => setEsRepuestos(c === true)} /> Provee repuestos
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={esTaller} onCheckedChange={(c) => setEsTaller(c === true)} /> Es taller
              </label>
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
          {proveedor && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={activo} onCheckedChange={(c) => setActivo(c === true)} /> Activo
            </label>
          )}
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
