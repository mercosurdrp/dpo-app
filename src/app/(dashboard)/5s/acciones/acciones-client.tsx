"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  ClipboardList,
  Filter,
  Pencil,
  Plus,
  Trash2,
  Truck,
  Warehouse,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { eliminarAccion } from "@/actions/s5-acciones"
import { CrearAccionDialog } from "./_components/crear-accion-dialog"
import { ResponderAccionDialog } from "./_components/responder-accion-dialog"
import {
  S5_ACCION_ESTADO_COLORS,
  S5_ACCION_ESTADO_LABELS,
  S5_TIPO_LABELS,
  type S5AccionConMeta,
  type S5AccionEstado,
  type S5Tipo,
  type UserRole,
} from "@/types/database"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface VehiculoOpt {
  id: string
  dominio: string
}

interface Props {
  currentUserId: string
  currentRole: UserRole
  accionesIniciales: S5AccionConMeta[]
  responsables: ResponsableOpt[]
  vehiculos: VehiculoOpt[]
}

function formatFecha(iso: string | null) {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function contextoLabel(a: S5AccionConMeta): string {
  if (a.tipo === "almacen") {
    return a.sector_numero ? `Almacén · Sector ${a.sector_numero}` : "Almacén"
  }
  return a.vehiculo_dominio ? `Flota · ${a.vehiculo_dominio}` : "Flota"
}

// Fecha en zona AR para comparar contra el mes filtrado.
function toArDate(iso: string): Date {
  return new Date(
    new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  )
}

function formatYm(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function labelMes(ym: string): string {
  const [y, m] = ym.split("-")
  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1)
  const txt = d.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

// Criterio mismo que el action log de reuniones (ver
// src/actions/reuniones.ts línea 353): no cerradas se arrastran mes a mes
// hasta cerrarse; las cerradas viven solo en el mes del cierre.
function accionEnMes(a: S5AccionConMeta, ym: string): boolean {
  const createdYm = formatYm(toArDate(a.created_at))
  if (createdYm > ym) return false
  if (a.estado !== "cerrada") return true
  if (!a.cerrada_at) return true
  const cerradaYm = formatYm(toArDate(a.cerrada_at))
  return cerradaYm === ym
}

function buildMesesOptions(currentYm: string): string[] {
  // Mes actual + 11 anteriores
  const [y, m] = currentYm.split("-").map((x) => parseInt(x, 10))
  const out: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(y, m - 1 - i, 1)
    out.push(formatYm(d))
  }
  return out
}

export function AccionesClient({
  currentUserId,
  currentRole,
  accionesIniciales,
  responsables,
  vehiculos,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const currentYm = formatYm(toArDate(new Date().toISOString()))
  const mesesOptions = useMemo(
    () => buildMesesOptions(currentYm),
    [currentYm]
  )

  const [filtroMes, setFiltroMes] = useState<string>(currentYm)
  const [filtroTipo, setFiltroTipo] = useState<S5Tipo | "todos">("todos")
  const [filtroResponsable, setFiltroResponsable] = useState<string>("todos")
  const [soloMias, setSoloMias] = useState(false)
  const [tab, setTab] = useState<S5AccionEstado | "todas">("no_comenzada")

  const [openCrear, setOpenCrear] = useState(false)
  const [responderId, setResponderId] = useState<string | null>(null)

  const canCreate = currentRole === "admin" || currentRole === "auditor"

  const accionesFiltradas = useMemo(() => {
    return accionesIniciales.filter((a) => {
      if (filtroMes !== "todos" && !accionEnMes(a, filtroMes)) return false
      if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false
      if (
        filtroResponsable !== "todos" &&
        a.responsable_id !== filtroResponsable
      )
        return false
      if (soloMias && a.responsable_id !== currentUserId) return false
      if (tab !== "todas" && a.estado !== tab) return false
      return true
    })
  }, [
    accionesIniciales,
    filtroMes,
    filtroTipo,
    filtroResponsable,
    soloMias,
    tab,
    currentUserId,
  ])

  const counts = useMemo(() => {
    const base = accionesIniciales.filter((a) => {
      if (filtroMes !== "todos" && !accionEnMes(a, filtroMes)) return false
      if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false
      if (
        filtroResponsable !== "todos" &&
        a.responsable_id !== filtroResponsable
      )
        return false
      if (soloMias && a.responsable_id !== currentUserId) return false
      return true
    })
    return {
      todas: base.length,
      no_comenzada: base.filter((a) => a.estado === "no_comenzada").length,
      en_curso: base.filter((a) => a.estado === "en_curso").length,
      cerrada: base.filter((a) => a.estado === "cerrada").length,
    }
  }, [
    accionesIniciales,
    filtroMes,
    filtroTipo,
    filtroResponsable,
    soloMias,
    currentUserId,
  ])

  function handleEliminar(id: string) {
    if (!confirm("¿Eliminar esta acción? Se borrarán también sus evidencias.")) {
      return
    }
    startTransition(async () => {
      const res = await eliminarAccion(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Acción eliminada")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/5s">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">Acciones 5S</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Tareas con historial de evidencia (comentario + archivo).
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setOpenCrear(true)}>
            <Plus className="mr-2 size-4" />
            Nueva acción
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label className="mb-1.5 text-xs">Mes</Label>
              <Select
                value={filtroMes}
                onValueChange={(v) => v && setFiltroMes(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {mesesOptions.map((ym) => (
                    <SelectItem key={ym} value={ym}>
                      {labelMes(ym)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 text-xs">Tipo</Label>
              <Select
                value={filtroTipo}
                onValueChange={(v) =>
                  setFiltroTipo(v as S5Tipo | "todos")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="flota">
                    {S5_TIPO_LABELS.flota}
                  </SelectItem>
                  <SelectItem value="almacen">
                    {S5_TIPO_LABELS.almacen}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 text-xs">Responsable</Label>
              <Select
                value={filtroResponsable}
                onValueChange={(v) => v && setFiltroResponsable(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {responsables.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={soloMias}
                  onCheckedChange={(v) => setSoloMias(!!v)}
                />
                <span>Solo mías</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={tab === "no_comenzada" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("no_comenzada")}
            >
              No comenzadas ({counts.no_comenzada})
            </Button>
            <Button
              variant={tab === "en_curso" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("en_curso")}
            >
              En curso ({counts.en_curso})
            </Button>
            <Button
              variant={tab === "cerrada" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("cerrada")}
            >
              Cerradas ({counts.cerrada})
            </Button>
            <Button
              variant={tab === "todas" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("todas")}
            >
              Todas ({counts.todas})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {accionesFiltradas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <ClipboardList className="mx-auto mb-2 size-8 opacity-50" />
              No hay acciones que coincidan con los filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Contexto</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Evid.</TableHead>
                    <TableHead className="w-[140px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accionesFiltradas.map((a) => {
                    const isMine = a.responsable_id === currentUserId
                    const canDelete = canCreate
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="max-w-md">
                          <div className="font-medium text-slate-900">
                            {a.descripcion}
                          </div>
                          {a.origen_auditoria_id && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Desde auditoría
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            {a.tipo === "flota" ? (
                              <Truck className="size-3.5 text-slate-500" />
                            ) : (
                              <Warehouse className="size-3.5 text-slate-500" />
                            )}
                            {contextoLabel(a)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {a.responsable_nombre ?? "—"}
                          </span>
                          {isMine && (
                            <Badge variant="outline" className="ml-1.5">
                              Yo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatFecha(a.fecha_compromiso)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            style={{
                              backgroundColor:
                                S5_ACCION_ESTADO_COLORS[a.estado],
                              color: "white",
                            }}
                          >
                            {S5_ACCION_ESTADO_LABELS[a.estado]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {a.evidencias_count}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setResponderId(a.id)}
                            >
                              <Pencil className="mr-1 size-3.5" />
                              {a.estado === "cerrada" ? "Ver" : "Responder"}
                            </Button>
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={pending}
                                onClick={() => handleEliminar(a.id)}
                              >
                                <Trash2 className="size-3.5 text-red-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CrearAccionDialog
        open={openCrear}
        onOpenChange={setOpenCrear}
        responsables={responsables}
        vehiculos={vehiculos}
        onSaved={() => {
          router.refresh()
        }}
      />

      {responderId && (
        <ResponderAccionDialog
          accionId={responderId}
          open={!!responderId}
          onOpenChange={(open) => {
            if (!open) setResponderId(null)
          }}
          currentUserId={currentUserId}
          currentRole={currentRole}
          onSaved={() => {
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
