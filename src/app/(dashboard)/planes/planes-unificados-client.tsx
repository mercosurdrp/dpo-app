"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Search,
  ExternalLink,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PRIORIDAD_COLORS, PRIORIDAD_LABELS } from "@/lib/constants"
import type {
  PlanUnificado,
  PlanOrigen,
  EstadoUnificado,
} from "@/actions/planes-unificados"

const ORIGENES: { value: PlanOrigen; label: string; color: string }[] = [
  { value: "plan_accion", label: "Auditoría", color: "#64748B" },
  { value: "nps", label: "NPS", color: "#8B5CF6" },
  { value: "rechazos", label: "Rechazos", color: "#EF4444" },
  { value: "owd", label: "OWD", color: "#0EA5E9" },
  { value: "roturas", label: "Roturas en calle", color: "#F59E0B" },
  { value: "s5", label: "5S", color: "#10B981" },
  { value: "tlp", label: "TLP", color: "#0D9488" },
  { value: "tiempo_pdv", label: "Tiempo por PDV", color: "#EA580C" },
  { value: "reunion", label: "Reunión", color: "#6366F1" },
  { value: "presupuesto", label: "Presupuesto", color: "#A16207" },
  { value: "presupuesto_plan", label: "Plan de presupuesto", color: "#B45309" },
  { value: "riesgo", label: "Riesgo externo", color: "#BE123C" },
]
const ORIGEN_COLOR: Record<PlanOrigen, string> = Object.fromEntries(
  ORIGENES.map((o) => [o.value, o.color])
) as Record<PlanOrigen, string>

const ESTADO_META: Record<
  EstadoUnificado,
  { label: string; color: string; icon: React.ReactNode }
> = {
  no_comenzada: {
    label: "No comenzada",
    color: "#64748B",
    icon: <Circle className="h-3.5 w-3.5" />,
  },
  en_curso: {
    label: "En curso",
    color: "#F59E0B",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  cerrada: {
    label: "Cerrada",
    color: "#22C55E",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
}

type EstadoFilter = "all" | EstadoUnificado
type OrigenFilter = "all" | PlanOrigen

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
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

export function PlanesUnificadosClient({
  planes,
}: {
  planes: PlanUnificado[]
}) {
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("all")
  const [origenFilter, setOrigenFilter] = useState<OrigenFilter>("all")
  const [responsableFilter, setResponsableFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  // Responsables presentes (de todos los orígenes) para el selector.
  const responsablesOpts = useMemo(() => {
    const set = new Set<string>()
    for (const p of planes) {
      if (p.responsable_nombre) set.add(p.responsable_nombre)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"))
  }, [planes])

  const filteredSinEstado = useMemo(() => {
    let list = planes
    if (origenFilter !== "all") list = list.filter((p) => p.origen === origenFilter)
    if (responsableFilter !== "all") {
      list = list.filter((p) => p.responsable_nombre === responsableFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.titulo.toLowerCase().includes(q) ||
          (p.descripcion ?? "").toLowerCase().includes(q) ||
          (p.responsable_nombre ?? "").toLowerCase().includes(q) ||
          p.origen_label.toLowerCase().includes(q)
      )
    }
    return list
  }, [planes, origenFilter, responsableFilter, search])

  const filtered = useMemo(() => {
    if (estadoFilter === "all") return filteredSinEstado
    return filteredSinEstado.filter((p) => p.estado_unificado === estadoFilter)
  }, [filteredSinEstado, estadoFilter])

  const stats = useMemo(() => {
    const total = filteredSinEstado.length
    const vencidos = filteredSinEstado.filter((p) => p.is_overdue).length
    const abiertos = filteredSinEstado.filter(
      (p) => p.estado_unificado !== "cerrada"
    ).length
    const cerrados = filteredSinEstado.filter(
      (p) => p.estado_unificado === "cerrada"
    ).length
    return { total, vencidos, abiertos, cerrados }
  }, [filteredSinEstado])

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Todos los planes de acción de la app en un solo lugar: planes de
          auditoría, NPS, Rechazos, OWD, Roturas en calle y 5S. Hacé clic en un
          plan para gestionarlo en su módulo.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} color="#64748B" />
        <StatCard label="Vencidos" value={stats.vencidos} color="#EF4444" />
        <StatCard label="Abiertos" value={stats.abiertos} color="#F59E0B" />
        <StatCard label="Cerrados" value={stats.cerrados} color="#22C55E" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
          {(
            [
              { value: "all", label: "Todos" },
              { value: "no_comenzada", label: "No comenzadas" },
              { value: "en_curso", label: "En curso" },
              { value: "cerrada", label: "Cerradas" },
            ] as { value: EstadoFilter; label: string }[]
          ).map((f) => (
            <button
              key={f.value}
              onClick={() => setEstadoFilter(f.value)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                estadoFilter === f.value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Select
          value={origenFilter}
          onValueChange={(v) => setOrigenFilter(v as OrigenFilter)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Módulo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los módulos</SelectItem>
            {ORIGENES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={responsableFilter}
          onValueChange={(v) => setResponsableFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Responsable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los responsables</SelectItem>
            {responsablesOpts.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar plan, responsable o módulo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay planes que coincidan con los filtros.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const est = ESTADO_META[p.estado_unificado]
            return (
              <Link
                key={`${p.origen}-${p.id}`}
                href={p.href}
                className="group flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
              >
                {/* Chip de módulo */}
                <span
                  className="mt-0.5 shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: ORIGEN_COLOR[p.origen] }}
                >
                  {p.origen_label}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {p.titulo}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span style={{ color: est.color }}>{est.icon}</span>
                      {est.label}
                    </span>
                    <span>
                      Resp.:{" "}
                      <span className="text-slate-700">
                        {p.responsable_nombre ?? "Sin asignar"}
                      </span>
                    </span>
                    <span>Límite: {formatDate(p.fecha_limite)}</span>
                    {p.is_overdue && (
                      <span className="inline-flex items-center gap-1 font-medium text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Vencido
                      </span>
                    )}
                  </div>
                </div>

                {p.prioridad && (
                  <Badge
                    variant="outline"
                    className="shrink-0"
                    style={{
                      borderColor: PRIORIDAD_COLORS[p.prioridad],
                      color: PRIORIDAD_COLORS[p.prioridad],
                    }}
                  >
                    {PRIORIDAD_LABELS[p.prioridad]}
                  </Badge>
                )}
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
