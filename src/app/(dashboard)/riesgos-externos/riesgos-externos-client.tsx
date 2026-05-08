"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import { eliminarAccion } from "@/actions/riesgos-externos"
import { RiesgoFormDialog } from "@/components/riesgos-externos/riesgo-form-dialog"
import {
  ESTADO_RIESGO_EXTERNO_LABELS,
  TIPO_RIESGO_EXTERNO_LABELS,
  type EstadoRiesgoExterno,
  type Profile,
  type RiesgoExternoAccionConResponsable,
} from "@/types/database"

interface Props {
  acciones: RiesgoExternoAccionConResponsable[]
  responsables: Pick<Profile, "id" | "nombre" | "email">[]
  puedeEditar: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function EstadoBadge({ estado }: { estado: EstadoRiesgoExterno }) {
  if (estado === "no_iniciado") {
    return (
      <Badge className="gap-1 border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
        <Clock className="size-3.5" />
        {ESTADO_RIESGO_EXTERNO_LABELS[estado]}
      </Badge>
    )
  }
  if (estado === "en_curso") {
    return (
      <Badge className="gap-1 border-blue-200 bg-blue-100 text-blue-700 hover:bg-blue-100">
        <Clock className="size-3.5" />
        {ESTADO_RIESGO_EXTERNO_LABELS[estado]}
      </Badge>
    )
  }
  if (estado === "concluido") {
    return (
      <Badge className="gap-1 border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <CheckCircle2 className="size-3.5" />
        {ESTADO_RIESGO_EXTERNO_LABELS[estado]}
      </Badge>
    )
  }
  if (estado === "concluido_con_atraso") {
    return (
      <Badge className="gap-1 border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        <AlertTriangle className="size-3.5" />
        {ESTADO_RIESGO_EXTERNO_LABELS[estado]}
      </Badge>
    )
  }
  return (
    <Badge className="gap-1 border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
      <XCircle className="size-3.5" />
      {ESTADO_RIESGO_EXTERNO_LABELS[estado]}
    </Badge>
  )
}

export function RiesgosExternosClient({
  acciones,
  responsables,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState<RiesgoExternoAccionConResponsable | null>(
    null,
  )

  const [filtroEstado, setFiltroEstado] = useState<string>("todos")
  const [filtroTipo, setFiltroTipo] = useState<string>("todos")
  const [busqueda, setBusqueda] = useState("")

  const itemsFiltrados = useMemo(() => {
    return acciones.filter((a) => {
      if (filtroEstado !== "todos" && a.estado !== filtroEstado) return false
      if (filtroTipo !== "todos" && a.tipo_riesgo !== filtroTipo) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const matches =
          a.observaciones.toLowerCase().includes(q) ||
          (a.resolucion?.toLowerCase().includes(q) ?? false) ||
          (a.tarea_pendiente?.toLowerCase().includes(q) ?? false) ||
          (a.responsable_nombre?.toLowerCase().includes(q) ?? false) ||
          String(a.nro_correlativo).includes(q)
        if (!matches) return false
      }
      return true
    })
  }, [acciones, filtroEstado, filtroTipo, busqueda])

  const stats = useMemo(() => {
    return acciones.reduce(
      (acc, a) => {
        acc.total += 1
        acc[a.estado] += 1
        return acc
      },
      {
        total: 0,
        no_iniciado: 0,
        en_curso: 0,
        concluido: 0,
        concluido_con_atraso: 0,
        atrasado: 0,
      } as Record<EstadoRiesgoExterno | "total", number>,
    )
  }, [acciones])

  function refrescar() {
    router.refresh()
  }

  function handleEliminar(a: RiesgoExternoAccionConResponsable) {
    if (
      !confirm(
        `¿Eliminar el suceso #${a.nro_correlativo}? Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarAccion(a.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ShieldAlert className="size-6 text-slate-700" />
            Riesgos Externos — Plan de Acción
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bitácora de sucesos de riesgo externo y su tratamiento (DPO Planeamiento 2.2).
          </p>
        </div>
        {puedeEditar && (
          <Button onClick={() => { setEditing(null); setOpenForm(true) }}>
            <Plus className="mr-2 size-4" />
            Registrar suceso
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={stats.total} cls="bg-slate-50 text-slate-700 border-slate-200" />
        <StatCard label="No iniciado" value={stats.no_iniciado} cls="bg-slate-50 text-slate-700 border-slate-200" />
        <StatCard label="En curso" value={stats.en_curso} cls="bg-blue-50 text-blue-700 border-blue-200" />
        <StatCard label="Concluido" value={stats.concluido} cls="bg-emerald-50 text-emerald-700 border-emerald-200" />
        <StatCard label="C. con atraso" value={stats.concluido_con_atraso} cls="bg-amber-50 text-amber-800 border-amber-200" />
        <StatCard label="Atrasado" value={stats.atrasado} cls="bg-red-50 text-red-700 border-red-200" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar en observaciones, resolución, responsable…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filtroTipo} onValueChange={(v: string | null) => setFiltroTipo(v ?? "todos")}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {Object.entries(TIPO_RIESGO_EXTERNO_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroEstado} onValueChange={(v: string | null) => setFiltroEstado(v ?? "todos")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {Object.entries(ESTADO_RIESGO_EXTERNO_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Tipo de riesgo</TableHead>
              <TableHead>Observaciones</TableHead>
              <TableHead>Resolución</TableHead>
              <TableHead className="whitespace-nowrap">Fecha ocurrencia</TableHead>
              <TableHead className="w-12 text-center">Sem.</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Tarea pendiente</TableHead>
              <TableHead className="whitespace-nowrap">Compromiso</TableHead>
              <TableHead className="whitespace-nowrap">Cierre real</TableHead>
              <TableHead>Estado</TableHead>
              {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itemsFiltrados.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={puedeEditar ? 12 : 11}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  {acciones.length === 0
                    ? "Aún no hay sucesos registrados."
                    : "No hay resultados con los filtros aplicados."}
                  {puedeEditar && acciones.length === 0 && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="font-medium text-blue-600 hover:underline"
                        onClick={() => { setEditing(null); setOpenForm(true) }}
                      >
                        Registrar el primero
                      </button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            )}
            {itemsFiltrados.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono font-medium">{a.nro_correlativo}</TableCell>
                <TableCell className="font-medium">
                  {TIPO_RIESGO_EXTERNO_LABELS[a.tipo_riesgo]}
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <p className="line-clamp-3 text-sm">{a.observaciones}</p>
                </TableCell>
                <TableCell className="max-w-[280px]">
                  {a.resolucion ? (
                    <p className="line-clamp-3 text-sm">{a.resolucion}</p>
                  ) : (
                    <span className="italic text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(a.fecha_ocurrencia)}
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">
                  {a.semana}
                </TableCell>
                <TableCell>
                  {a.responsable_nombre ?? (
                    <span className="italic text-muted-foreground">Sin asignar</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[220px]">
                  {a.tarea_pendiente ? (
                    <p className="line-clamp-3 text-sm">{a.tarea_pendiente}</p>
                  ) : (
                    <span className="italic text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(a.fecha_compromiso)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(a.fecha_cierre_real)}
                </TableCell>
                <TableCell>
                  <EstadoBadge estado={a.estado} />
                </TableCell>
                {puedeEditar && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setEditing(a); setOpenForm(true) }}
                        title="Editar"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEliminar(a)}
                        title="Eliminar"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {puedeEditar && (
        <RiesgoFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          accion={editing}
          responsables={responsables}
          onSaved={refrescar}
        />
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  cls,
}: {
  label: string
  value: number
  cls: string
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
        {label}
      </p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}
