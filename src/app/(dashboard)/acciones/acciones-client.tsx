"use client"

import { useState, useMemo, useOptimistic, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ListTodo,
  Trash2,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { updateAccion, deleteAccion } from "@/actions/acciones"
import {
  ESTADO_ACCION_LABELS,
  ESTADO_ACCION_COLORS,
} from "@/lib/constants"
import type { EstadoAccion } from "@/types/database"

interface AccionEnriquecida {
  id: string
  respuesta_id: string
  descripcion: string
  responsable: string
  fecha_limite: string
  estado: EstadoAccion
  evidencia_urls: string[]
  created_at: string
  updated_at: string
  pregunta_texto: string
  pregunta_numero: string
  bloque_nombre: string
  pilar_id: string
  pilar_nombre: string
  pilar_color: string
}

type EstadoFilter = "all" | EstadoAccion

const ESTADO_FILTERS: { value: EstadoFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pendiente", label: "Pendientes" },
  { value: "en_progreso", label: "En Progreso" },
  { value: "completado", label: "Completados" },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function isOverdue(fechaLimite: string, estado: string): boolean {
  if (estado === "completado") return false
  return new Date(fechaLimite) < new Date()
}

export function AccionesClient({
  acciones: initialAcciones,
}: {
  acciones: AccionEnriquecida[]
}) {
  const router = useRouter()
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("all")
  const [search, setSearch] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Optimistic state for estado changes
  const [optimisticAcciones, setOptimisticAccion] = useOptimistic(
    initialAcciones,
    (state, update: { id: string; estado: EstadoAccion }) =>
      state.map((a) =>
        a.id === update.id ? { ...a, estado: update.estado } : a
      )
  )

  // Filtered acciones
  const filtered = useMemo(() => {
    let list = optimisticAcciones

    if (estadoFilter !== "all") {
      list = list.filter((a) => a.estado === estadoFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.descripcion.toLowerCase().includes(q) ||
          a.responsable.toLowerCase().includes(q) ||
          a.pregunta_texto.toLowerCase().includes(q) ||
          a.pilar_nombre.toLowerCase().includes(q)
      )
    }

    return list
  }, [optimisticAcciones, estadoFilter, search])

  // Stats
  const stats = useMemo(() => {
    const total = optimisticAcciones.length
    const pendientes = optimisticAcciones.filter((a) => a.estado === "pendiente").length
    const enProgreso = optimisticAcciones.filter((a) => a.estado === "en_progreso").length
    const completadas = optimisticAcciones.filter((a) => a.estado === "completado").length
    return { total, pendientes, enProgreso, completadas }
  }, [optimisticAcciones])

  async function handleEstadoChange(id: string, newEstado: EstadoAccion) {
    startTransition(async () => {
      setOptimisticAccion({ id, estado: newEstado })
      const result = await updateAccion(id, { estado: newEstado })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`Estado actualizado a ${ESTADO_ACCION_LABELS[newEstado]}`)
      }
      router.refresh()
    })
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminar esta accion? Esta accion no se puede deshacer."))
      return
    setDeleting(id)
    const result = await deleteAccion(id)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Accion eliminada")
      router.refresh()
    }
    setDeleting(null)
  }

  return (
    <div className="space-y-4">
      {/* Header + Stats */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Plan de Accion</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acciones correctivas derivadas de las auditorias
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} color="#64748B" />
        <StatCard label="Pendientes" value={stats.pendientes} color={ESTADO_ACCION_COLORS.pendiente} />
        <StatCard label="En Progreso" value={stats.enProgreso} color={ESTADO_ACCION_COLORS.en_progreso} />
        <StatCard label="Completadas" value={stats.completadas} color={ESTADO_ACCION_COLORS.completado} />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Estado filter buttons */}
        <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
          {ESTADO_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setEstadoFilter(f.value)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                estadoFilter === f.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-muted-foreground hover:text-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por descripcion o responsable..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
          <ListTodo className="h-14 w-14 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold text-slate-700">
            {optimisticAcciones.length === 0
              ? "No hay acciones registradas"
              : "No se encontraron acciones"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {optimisticAcciones.length === 0
              ? "Las acciones se crean desde las respuestas de auditoria."
              : "Intenta con otros filtros de busqueda."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pilar</TableHead>
                  <TableHead>Pregunta</TableHead>
                  <TableHead>Descripcion</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Fecha limite</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((accion) => (
                  <TableRow key={accion.id}>
                    <TableCell>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: accion.pilar_color || "#64748B" }}
                      >
                        {accion.pilar_nombre}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {accion.pregunta_numero}
                        </span>
                        <p className="truncate text-sm" title={accion.pregunta_texto}>
                          {accion.pregunta_texto}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[250px] truncate text-sm" title={accion.descripcion}>
                        {accion.descripcion}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{accion.responsable}</TableCell>
                    <TableCell>
                      <span
                        className={`text-sm ${
                          isOverdue(accion.fecha_limite, accion.estado)
                            ? "font-semibold text-red-600"
                            : ""
                        }`}
                      >
                        {formatDate(accion.fecha_limite)}
                        {isOverdue(accion.fecha_limite, accion.estado) && (
                          <AlertCircle className="ml-1 inline size-3.5 text-red-500" />
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <EstadoDropdown
                        estado={accion.estado}
                        onChange={(e) => handleEstadoChange(accion.id, e)}
                        disabled={isPending}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={deleting === accion.id}
                        onClick={() => handleDelete(accion.id)}
                      >
                        {deleting === accion.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-red-500" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((accion) => (
              <div
                key={accion.id}
                className="rounded-lg border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: accion.pilar_color || "#64748B" }}
                  >
                    {accion.pilar_nombre}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={deleting === accion.id}
                    onClick={() => handleDelete(accion.id)}
                  >
                    {deleting === accion.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-red-500" />
                    )}
                  </Button>
                </div>

                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {accion.pregunta_numero}
                  </span>
                  <p className="text-sm text-slate-700 line-clamp-2">
                    {accion.pregunta_texto}
                  </p>
                </div>

                <p className="text-sm line-clamp-2">{accion.descripcion}</p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {accion.responsable}
                  </span>
                  <span
                    className={
                      isOverdue(accion.fecha_limite, accion.estado)
                        ? "font-semibold text-red-600"
                        : ""
                    }
                  >
                    {formatDate(accion.fecha_limite)}
                    {isOverdue(accion.fecha_limite, accion.estado) && (
                      <AlertCircle className="ml-1 inline size-3.5 text-red-500" />
                    )}
                  </span>
                </div>

                <EstadoDropdown
                  estado={accion.estado}
                  onChange={(e) => handleEstadoChange(accion.id, e)}
                  disabled={isPending}
                />
              </div>
            ))}
          </div>
        </>
      )}
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
  color: string
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

function EstadoDropdown({
  estado,
  onChange,
  disabled,
}: {
  estado: EstadoAccion
  onChange: (estado: EstadoAccion) => void
  disabled?: boolean
}) {
  const estados: EstadoAccion[] = ["pendiente", "en_progreso", "completado"]
  const icons: Record<EstadoAccion, React.ReactNode> = {
    pendiente: <AlertCircle className="size-3.5" />,
    en_progreso: <Clock className="size-3.5" />,
    completado: <CheckCircle2 className="size-3.5" />,
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: ESTADO_ACCION_COLORS[estado] }}
      >
        {icons[estado]}
        {ESTADO_ACCION_LABELS[estado]}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {estados.map((e) => (
          <DropdownMenuItem
            key={e}
            onClick={() => onChange(e)}
            className="gap-2"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: ESTADO_ACCION_COLORS[e] }}
            />
            {ESTADO_ACCION_LABELS[e]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
