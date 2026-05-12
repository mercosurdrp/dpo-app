"use client"

import { useState, useMemo, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ClipboardList,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  FileCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updatePlanEstado } from "@/actions/planes"
import {
  ESTADO_PLAN_COLORS,
  ESTADO_PLAN_LABELS,
  PRIORIDAD_COLORS,
  PRIORIDAD_LABELS,
} from "@/lib/constants"
import type { EstadoPlan, PlanAccionListItem } from "@/types/database"

type EstadoFilter = "all" | EstadoPlan
type PrioridadFilter = "all" | "alta" | "media" | "baja"

const ESTADO_FILTERS: { value: EstadoFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pendiente", label: "No comenzadas" },
  { value: "en_progreso", label: "En curso" },
  { value: "completado", label: "Cerradas" },
]

function formatDate(iso: string | null): string {
  if (!iso) return "-"
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function isOverdue(fechaLimite: string | null, estado: string): boolean {
  if (!fechaLimite || estado === "completado") return false
  return new Date(fechaLimite) < new Date()
}

function ProgressBar({ value }: { value: number }) {
  const color =
    value >= 67 ? "#22C55E" : value >= 34 ? "#F59E0B" : "#EF4444"
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{value}%</span>
    </div>
  )
}

export function PlanesListClient({
  planes: initialPlanes,
  admins,
}: {
  planes: PlanAccionListItem[]
  admins: Array<{ id: string; nombre: string }>
}) {
  const router = useRouter()
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("all")
  const [prioridadFilter, setPrioridadFilter] = useState<PrioridadFilter>("all")
  const [responsableFilter, setResponsableFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()
  const [planes, setPlanes] = useState(initialPlanes)

  function nombreResponsable(p: PlanAccionListItem): string {
    return p.responsable_principal_nombre || p.responsable || ""
  }

  // Lista de admins ordenados (de los pasados por server).
  const responsablesOpts = useMemo(
    () =>
      [...admins].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [admins]
  )

  // Lista parcialmente filtrada (sin estado): la base de los stats.
  const filteredSinEstado = useMemo(() => {
    let list = planes

    if (prioridadFilter !== "all") {
      list = list.filter((p) => p.prioridad === prioridadFilter)
    }

    if (responsableFilter !== "all") {
      list = list.filter((p) => nombreResponsable(p) === responsableFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.descripcion.toLowerCase().includes(q) ||
          nombreResponsable(p).toLowerCase().includes(q) ||
          p.pregunta_texto.toLowerCase().includes(q) ||
          p.pilar_nombre.toLowerCase().includes(q)
      )
    }

    return list
  }, [planes, prioridadFilter, responsableFilter, search])

  const filtered = useMemo(() => {
    if (estadoFilter === "all") return filteredSinEstado
    return filteredSinEstado.filter((p) => p.estado === estadoFilter)
  }, [filteredSinEstado, estadoFilter])

  const stats = useMemo(() => {
    const total = filteredSinEstado.length
    const pendientes = filteredSinEstado.filter(
      (p) => p.estado === "pendiente"
    ).length
    const enProgreso = filteredSinEstado.filter(
      (p) => p.estado === "en_progreso"
    ).length
    const completados = filteredSinEstado.filter(
      (p) => p.estado === "completado"
    ).length
    return { total, pendientes, enProgreso, completados }
  }, [filteredSinEstado])

  async function handleEstadoChange(id: string, newEstado: EstadoPlan) {
    startTransition(async () => {
      setPlanes((prev) =>
        prev.map((p) => (p.id === id ? { ...p, estado: newEstado } : p))
      )
      const result = await updatePlanEstado(id, newEstado)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`Estado actualizado a ${ESTADO_PLAN_LABELS[newEstado]}`)
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Planes de Accion</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestiona los planes de accion de todas las preguntas
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} color="#64748B" />
        <StatCard label="No comenzadas" value={stats.pendientes} color={ESTADO_PLAN_COLORS.pendiente} />
        <StatCard label="En curso" value={stats.enProgreso} color={ESTADO_PLAN_COLORS.en_progreso} />
        <StatCard label="Cerradas" value={stats.completados} color={ESTADO_PLAN_COLORS.completado} />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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

        <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
          {(["all", "alta", "media", "baja"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPrioridadFilter(p)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                prioridadFilter === p
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-muted-foreground hover:text-slate-700"
              }`}
            >
              {p === "all" ? "Todas" : PRIORIDAD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="min-w-[180px]">
          <Select
            value={responsableFilter}
            onValueChange={(v) => v && setResponsableFilter(v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Responsable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los responsables</SelectItem>
              {responsablesOpts.map((a) => (
                <SelectItem key={a.id} value={a.nombre}>
                  {a.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
          <ClipboardList className="h-14 w-14 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold text-slate-700">
            {planes.length === 0
              ? "No hay planes de accion"
              : "No se encontraron planes"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {planes.length === 0
              ? "Los planes se crean desde la gestion de preguntas."
              : "Intenta con otros filtros."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((plan) => {
            const overdue = isOverdue(plan.fecha_limite, plan.estado)
            return (
              <div
                key={plan.id}
                className={`rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30 ${
                  overdue ? "ring-2 ring-red-200" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* Pilar + Pregunta */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: plan.pilar_color || "#64748B" }}
                      >
                        {plan.pilar_nombre}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {plan.pregunta_numero}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-sm font-medium text-slate-800 line-clamp-2">
                      {plan.descripcion}
                    </p>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      <span>
                        Responsable:{" "}
                        <span className="font-medium text-slate-700">
                          {nombreResponsable(plan) || "—"}
                        </span>
                        {plan.coresponsables_count > 0 && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            (+{plan.coresponsables_count} co)
                          </span>
                        )}
                      </span>
                      {plan.fecha_limite && (
                        <span
                          className={`flex items-center gap-1 ${
                            overdue ? "font-semibold text-red-600" : ""
                          }`}
                        >
                          {overdue && <AlertCircle className="h-3 w-3" />}
                          Limite: {formatDate(plan.fecha_limite)}
                        </span>
                      )}
                      <ProgressBar value={plan.progreso} />
                      {plan.comentarios_count > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {plan.comentarios_count}
                        </span>
                      )}
                      {plan.evidencias_count > 0 && (
                        <span className="flex items-center gap-1">
                          <FileCheck className="h-3 w-3" />
                          {plan.evidencias_count}
                        </span>
                      )}
                    </div>

                    {/* Estado + Prioridad */}
                    <div className="flex flex-wrap items-center gap-2">
                      <EstadoDropdown
                        estado={plan.estado}
                        onChange={(e) => handleEstadoChange(plan.id, e)}
                        disabled={isPending}
                      />
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{
                          backgroundColor: PRIORIDAD_COLORS[plan.prioridad],
                        }}
                      >
                        {PRIORIDAD_LABELS[plan.prioridad]}
                      </span>
                    </div>
                  </div>

                  {/* Link to detail */}
                  <Link href={`/planes/${plan.id}`}>
                    <Button variant="ghost" size="icon-sm">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
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
  estado: EstadoPlan
  onChange: (estado: EstadoPlan) => void
  disabled?: boolean
}) {
  const estados: EstadoPlan[] = ["pendiente", "en_progreso", "completado"]
  const icons: Record<EstadoPlan, React.ReactNode> = {
    pendiente: <AlertCircle className="size-3.5" />,
    en_progreso: <Clock className="size-3.5" />,
    completado: <CheckCircle2 className="size-3.5" />,
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: ESTADO_PLAN_COLORS[estado] }}
      >
        {icons[estado]}
        {ESTADO_PLAN_LABELS[estado]}
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
              style={{ backgroundColor: ESTADO_PLAN_COLORS[e] }}
            />
            {ESTADO_PLAN_LABELS[e]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
