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
  tipo: S5Tipo
  currentUserId: string
  currentRole: UserRole
  accionesIniciales: S5AccionConMeta[]
  responsables: ResponsableOpt[]
  vehiculos: VehiculoOpt[]
}

const MESES_LABELS: Record<string, string> = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
}

function formatFecha(iso: string | null) {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function contextoLabel(a: S5AccionConMeta): string {
  if (a.tipo === "almacen") {
    return a.sector_numero ? `Sector ${a.sector_numero}` : "—"
  }
  return a.vehiculo_dominio ?? "Sin vehículo"
}

function toArDate(iso: string): Date {
  return new Date(
    new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  )
}

function getYearMonth(iso: string): { year: string; month: string } {
  const d = toArDate(iso)
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, "0"),
  }
}

// Mismo criterio que el action log de reuniones:
// no cerradas se arrastran mes a mes hasta cerrarse;
// cerradas viven solo en el mes del cierre.
function accionVisibleEnYearMonth(
  a: S5AccionConMeta,
  year: string,
  month: string | "todos"
): boolean {
  const created = getYearMonth(a.created_at)
  const createdYm = `${created.year}-${created.month}`

  if (month === "todos") {
    // Filtro solo por año
    if (created.year > year) return false
    if (a.estado !== "cerrada") return true
    if (!a.cerrada_at) return true
    const cerrada = getYearMonth(a.cerrada_at)
    return cerrada.year === year
  }

  const targetYm = `${year}-${month}`
  if (createdYm > targetYm) return false
  if (a.estado !== "cerrada") return true
  if (!a.cerrada_at) return true
  const cerrada = getYearMonth(a.cerrada_at)
  return `${cerrada.year}-${cerrada.month}` === targetYm
}

function buildAñosOptions(currentYear: string): string[] {
  const y = parseInt(currentYear, 10)
  return [String(y), String(y - 1), String(y - 2), String(y - 3)]
}

const MESES_KEYS: string[] = Object.keys(MESES_LABELS)

export function AccionesClient({
  tipo,
  currentUserId,
  currentRole,
  accionesIniciales,
  responsables,
  vehiculos,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const now = toArDate(new Date().toISOString())
  const currentYear = String(now.getFullYear())
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0")

  const añosOptions = useMemo(
    () => buildAñosOptions(currentYear),
    [currentYear]
  )

  const [filtroAño, setFiltroAño] = useState<string>(currentYear)
  const [filtroMes, setFiltroMes] = useState<string>(currentMonth)
  const [filtroResponsable, setFiltroResponsable] = useState<string>("todos")
  const [soloMias, setSoloMias] = useState(false)
  const [tab, setTab] = useState<S5AccionEstado | "todas">("no_comenzada")

  const [openCrear, setOpenCrear] = useState(false)
  const [responderId, setResponderId] = useState<string | null>(null)

  const canCreate = currentRole === "admin" || currentRole === "auditor"

  const accionesFiltradas = useMemo(() => {
    return accionesIniciales.filter((a) => {
      if (
        filtroAño !== "todos" &&
        !accionVisibleEnYearMonth(a, filtroAño, filtroMes)
      ) {
        return false
      }
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
    filtroAño,
    filtroMes,
    filtroResponsable,
    soloMias,
    tab,
    currentUserId,
  ])

  const counts = useMemo(() => {
    const base = accionesIniciales.filter((a) => {
      if (
        filtroAño !== "todos" &&
        !accionVisibleEnYearMonth(a, filtroAño, filtroMes)
      ) {
        return false
      }
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
    filtroAño,
    filtroMes,
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

  const subjectLabel =
    tipo === "flota"
      ? S5_TIPO_LABELS.flota
      : S5_TIPO_LABELS.almacen
  const subjectColumn = tipo === "flota" ? "Vehículo" : "Sector"

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
            <h1 className="text-2xl font-bold text-slate-900">
              Acciones 5S — {subjectLabel}
            </h1>
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

      <div className="flex items-center gap-2">
        <Link href="/5s/acciones/flota">
          <Button
            variant={tipo === "flota" ? "default" : "outline"}
            size="sm"
          >
            <Truck className="mr-1.5 size-4" />
            Flota
          </Button>
        </Link>
        <Link href="/5s/acciones/almacen">
          <Button
            variant={tipo === "almacen" ? "default" : "outline"}
            size="sm"
          >
            <Warehouse className="mr-1.5 size-4" />
            Almacén
          </Button>
        </Link>
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
              <Label className="mb-1.5 text-xs">Año</Label>
              <Select
                value={filtroAño}
                onValueChange={(v) => v && setFiltroAño(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {añosOptions.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 text-xs">Mes</Label>
              <Select
                value={filtroMes}
                onValueChange={(v) => v && setFiltroMes(v)}
                disabled={filtroAño === "todos"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {MESES_KEYS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MESES_LABELS[m]}
                    </SelectItem>
                  ))}
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
                    <TableHead>{subjectColumn}</TableHead>
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
                        <TableCell className="text-sm">
                          {contextoLabel(a)}
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
        tipo={tipo}
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
