"use client"

import { useState, useMemo, useTransition, useEffect, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import { useRefrescarConScroll } from "@/lib/use-refrescar-con-scroll"
import { toast } from "sonner"
import {
  Search,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Paperclip,
  AlertTriangle,
  Clock,
  TrendingUp,
  LayoutGrid,
  Table as TableIcon,
  ClipboardList,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { updatePlanEstado } from "@/actions/planes"
import { ESTADO_PLAN_LABELS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { EstadoPlan, PrioridadPlan, PlanAccionListItem } from "@/types/database"

/* ------------------------------------------------------------------ tokens */

const MONO: CSSProperties = {
  fontFamily: "var(--font-plex-mono), ui-monospace, SFMono-Regular, monospace",
}

const ESTADO_UI: Record<
  EstadoPlan,
  { label: string; fg: string; bg: string; border: string; dot: string }
> = {
  pendiente: { label: "No comenzada", fg: "#B91C1C", bg: "#FEF2F2", border: "#FECACA", dot: "#EF4444" },
  en_progreso: { label: "En curso", fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A", dot: "#F59E0B" },
  completado: { label: "Cerrada", fg: "#15803D", bg: "#F0FDF4", border: "#BBF7D0", dot: "#22C55E" },
}

const PRIORIDAD_UI: Record<PrioridadPlan, { label: string; fg: string; bg: string; border: string }> = {
  alta: { label: "Alta", fg: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
  media: { label: "Media", fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  baja: { label: "Baja", fg: "#1E40AF", bg: "#EFF6FF", border: "#BFDBFE" },
}

const AVATAR_PALETTE = [
  "#475569", "#2563EB", "#0891B2", "#7C3AED", "#0D9488", "#B45309", "#BE123C", "#4338CA",
]

/* ------------------------------------------------------------------ helpers */

function nombreResponsable(p: PlanAccionListItem): string {
  return p.responsable_principal_nombre || p.responsable || ""
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "—"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

function daysUntil(fechaLimite: string | null): number | null {
  if (!fechaLimite) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(fechaLimite.length === 10 ? `${fechaLimite}T00:00:00` : fechaLimite)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

function progresoColor(progreso: number, cerrada: boolean): string {
  if (cerrada || progreso >= 100) return "#16A34A"
  if (progreso > 0) return "#3B82F6"
  return "#CBD5E1"
}

interface PlanEnriquecido extends PlanAccionListItem {
  _resp: string
  _cerrada: boolean
  _dias: number | null
  _vencido: boolean
  _porVencer: boolean
  _sinResp: boolean
  _stripe: string
  _rank: number
}

function enriquecer(p: PlanAccionListItem): PlanEnriquecido {
  const cerrada = p.estado === "completado"
  const dias = daysUntil(p.fecha_limite)
  const vencido = !cerrada && dias != null && dias < 0
  const porVencer = !cerrada && dias != null && dias >= 0 && dias <= 7
  const resp = nombreResponsable(p)
  const sinResp = !resp
  const stripe = vencido
    ? "#EF4444"
    : porVencer
      ? "#F59E0B"
      : cerrada
        ? "#22C55E"
        : p.prioridad === "alta"
          ? "#FB923C"
          : "#E2E8F0"
  const rank = vencido ? 0 : porVencer ? 1 : sinResp ? 2 : p.estado === "pendiente" ? 3 : p.estado === "en_progreso" ? 4 : 5
  return { ...p, _resp: resp, _cerrada: cerrada, _dias: dias, _vencido: vencido, _porVencer: porVencer, _sinResp: sinResp, _stripe: stripe, _rank: rank }
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })
}

function urgenciaLabel(p: PlanEnriquecido): string | null {
  if (p._cerrada || p._dias == null) return null
  if (p._vencido) return p._dias === -1 ? "Venció ayer" : `Vencido ${-p._dias}d`
  if (p._porVencer) return p._dias === 0 ? "Vence hoy" : `Vence en ${p._dias}d`
  return null
}

type SortKey = null | "limite" | "progreso" | "estado"
const ESTADO_ORDER: Record<EstadoPlan, number> = { pendiente: 0, en_progreso: 1, completado: 2 }

/* ------------------------------------------------------------------ component */

export function PlanesListClient({
  planes: initialPlanes,
}: {
  planes: PlanAccionListItem[]
  admins: Array<{ id: string; nombre: string }>
}) {
  const router = useRouter()
  const refrescarConScroll = useRefrescarConScroll()
  const [planes, setPlanes] = useState(initialPlanes)
  const [estadoFilter, setEstadoFilter] = useState<"all" | EstadoPlan>("all")
  const [prioridadFilter, setPrioridadFilter] = useState<"all" | PrioridadPlan>("all")
  const [search, setSearch] = useState("")
  const [attention, setAttention] = useState(false)
  const [listMode, setListMode] = useState<"table" | "cards">("table")
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [isPending, startTransition] = useTransition()

  // En celular, abrir en Tarjetas (la tabla es para pantallas anchas).
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setListMode("cards")
  }, [])

  const enriquecidos = useMemo(() => planes.map(enriquecer), [planes])

  // Base de los KPIs/conteos: aplica búsqueda + prioridad, pero NO estado ni atención.
  const base = useMemo(() => {
    let list = enriquecidos
    if (prioridadFilter !== "all") list = list.filter((p) => p.prioridad === prioridadFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          (p.titulo ?? "").toLowerCase().includes(q) ||
          p.descripcion.toLowerCase().includes(q) ||
          p._resp.toLowerCase().includes(q) ||
          p.pregunta_numero.toLowerCase().includes(q) ||
          p.pilar_nombre.toLowerCase().includes(q)
      )
    }
    return list
  }, [enriquecidos, prioridadFilter, search])

  const kpis = useMemo(() => {
    const total = base.length
    const noCom = base.filter((p) => p.estado === "pendiente").length
    const enCurso = base.filter((p) => p.estado === "en_progreso").length
    const cerradas = base.filter((p) => p.estado === "completado").length
    const vencidos = base.filter((p) => p._vencido).length
    const porVencer = base.filter((p) => p._porVencer).length
    const atencion = base.filter((p) => p._vencido || p._porVencer || p._sinResp).length
    const cumplimiento = total > 0 ? Math.round((cerradas / total) * 100) : 0
    return { total, noCom, enCurso, cerradas, vencidos, porVencer, atencion, cumplimiento }
  }, [base])

  const filtered = useMemo(() => {
    let list = base
    if (estadoFilter !== "all") list = list.filter((p) => p.estado === estadoFilter)
    if (attention) list = list.filter((p) => p._vencido || p._porVencer || p._sinResp)
    const arr = [...list]
    if (sortKey == null) {
      arr.sort((a, b) => a._rank - b._rank || (a._dias ?? 1e9) - (b._dias ?? 1e9))
    } else {
      const dir = sortDir === "asc" ? 1 : -1
      arr.sort((a, b) => {
        let cmp = 0
        if (sortKey === "limite") cmp = (a._dias ?? 1e9) - (b._dias ?? 1e9)
        else if (sortKey === "progreso") cmp = a.progreso - b.progreso
        else if (sortKey === "estado") cmp = ESTADO_ORDER[a.estado] - ESTADO_ORDER[b.estado]
        return cmp * dir
      })
    }
    return arr
  }, [base, estadoFilter, attention, sortKey, sortDir])

  function toggleSort(key: Exclude<SortKey, null>) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc")
      else { setSortKey(null); setSortDir("asc") }
    } else {
      setSortKey(key); setSortDir("asc")
    }
  }

  function limpiarFiltros() {
    setEstadoFilter("all"); setPrioridadFilter("all"); setSearch(""); setAttention(false)
  }

  function handleEstadoChange(id: string, nuevo: EstadoPlan) {
    startTransition(async () => {
      setPlanes((prev) => prev.map((p) => (p.id === id ? { ...p, estado: nuevo } : p)))
      const res = await updatePlanEstado(id, nuevo)
      if ("error" in res) toast.error(res.error)
      else toast.success(`Estado: ${ESTADO_PLAN_LABELS[nuevo]}`)
      refrescarConScroll()
    })
  }

  const estadoSegments: { value: "all" | EstadoPlan; label: string; count: number }[] = [
    { value: "all", label: "Todos", count: kpis.total },
    { value: "pendiente", label: "No comenzadas", count: kpis.noCom },
    { value: "en_progreso", label: "En curso", count: kpis.enCurso },
    { value: "completado", label: "Cerradas", count: kpis.cerradas },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Planes de acción</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tareas correctivas y de mejora derivadas de auditorías e indicadores.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        {/* Cumplimiento */}
        <div className="md:border-r md:border-slate-100 md:pr-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cumplimiento general</p>
          <div className="mt-1 flex items-end gap-2">
            <span style={{ ...MONO, color: "#15803D" }} className="text-[40px] font-semibold leading-none">
              {kpis.cumplimiento}%
            </span>
            <span className="mb-1 text-xs text-slate-500">
              {kpis.cerradas} de {kpis.total} cerradas
            </span>
          </div>
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {kpis.total > 0 && (
              <>
                <div style={{ width: `${(kpis.cerradas / kpis.total) * 100}%`, backgroundColor: "#22C55E" }} />
                <div style={{ width: `${(kpis.enCurso / kpis.total) * 100}%`, backgroundColor: "#F59E0B" }} />
                <div style={{ width: `${(kpis.noCom / kpis.total) * 100}%`, backgroundColor: "#EF4444" }} />
              </>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <Legend color="#22C55E" label="Cerradas" n={kpis.cerradas} />
            <Legend color="#F59E0B" label="En curso" n={kpis.enCurso} />
            <Legend color="#EF4444" label="No comenzadas" n={kpis.noCom} />
          </div>
        </div>

        <KpiTile
          icon={<AlertTriangle className="size-4" />}
          color="#DC2626"
          value={kpis.vencidos}
          label="Vencidos"
          sub="requieren acción"
          active={attention}
          onClick={() => setAttention((v) => !v)}
        />
        <KpiTile
          icon={<Clock className="size-4" />}
          color="#D97706"
          value={kpis.porVencer}
          label="Por vencer"
          sub="próximos 7 días"
        />
        <KpiTile
          icon={<TrendingUp className="size-4" />}
          color="#2563EB"
          value={kpis.enCurso}
          label="En curso"
          sub="en progreso"
          active={estadoFilter === "en_progreso"}
          onClick={() => setEstadoFilter((v) => (v === "en_progreso" ? "all" : "en_progreso"))}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Segment>
          {estadoSegments.map((s) => (
            <SegmentBtn key={s.value} active={estadoFilter === s.value} onClick={() => setEstadoFilter(s.value)}>
              {s.label}
              <span style={MONO} className={cn("rounded px-1 text-[10px]", estadoFilter === s.value ? "bg-white/20" : "bg-slate-100 text-slate-500")}>
                {s.count}
              </span>
            </SegmentBtn>
          ))}
        </Segment>

        <Segment>
          {(["all", "alta", "media", "baja"] as const).map((p) => (
            <SegmentBtn key={p} active={prioridadFilter === p} onClick={() => setPrioridadFilter(p)}>
              {p === "all" ? "Todas" : PRIORIDAD_UI[p].label}
            </SegmentBtn>
          ))}
        </Segment>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar título, responsable, punto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>

        <button
          type="button"
          onClick={() => setAttention((v) => !v)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
            attention
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          )}
        >
          <AlertTriangle className="size-3.5" />
          Requieren atención
          <span style={MONO} className={cn("rounded px-1 text-[10px]", attention ? "bg-red-100" : "bg-slate-100")}>
            {kpis.atencion}
          </span>
        </button>

        <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          <ViewBtn active={listMode === "table"} onClick={() => setListMode("table")} icon={<TableIcon className="size-4" />} label="Tabla" />
          <ViewBtn active={listMode === "cards"} onClick={() => setListMode("cards")} icon={<LayoutGrid className="size-4" />} label="Tarjetas" />
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Mostrando <span style={MONO} className="font-medium text-slate-700">{filtered.length}</span> de {kpis.total} planes
      </p>

      {/* Contenido */}
      {filtered.length === 0 ? (
        <EmptyState hayPlanes={planes.length > 0} onClear={limpiarFiltros} />
      ) : listMode === "table" ? (
        <TablaPlanes
          planes={filtered}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          onEstado={handleEstadoChange}
          estadoDisabled={isPending}
          onRow={(id) => router.push(`/planes/${id}`)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          {filtered.map((p) => (
            <CardPlan key={p.id} p={p} onClick={() => router.push(`/planes/${p.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ subviews */

function Legend({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label} <span style={MONO} className="font-medium text-slate-600">{n}</span>
    </span>
  )
}

function KpiTile({
  icon, color, value, label, sub, active, onClick,
}: {
  icon: React.ReactNode; color: string; value: number; label: string; sub: string
  active?: boolean; onClick?: () => void
}) {
  const cls = cn(
    "flex flex-col items-start rounded-xl px-3 py-1 text-left transition-colors md:border-r md:border-slate-100 md:pr-5 md:last:border-r-0",
    onClick && "hover:bg-slate-50",
    active && "bg-slate-50"
  )
  const inner = (
    <>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
        {icon}
      </span>
      <span style={{ ...MONO, color }} className="mt-0.5 text-3xl font-semibold leading-none">{value}</span>
      <span className="mt-1 text-xs font-medium text-slate-600">{label}</span>
      <span className="text-[11px] text-slate-400">{sub}</span>
    </>
  )
  if (onClick) {
    return <button type="button" onClick={onClick} className={cls}>{inner}</button>
  }
  return <div className={cls}>{inner}</div>
}

function Segment({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">{children}</div>
}

function SegmentBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  )
}

function ViewBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function Pill({ ui, dot }: { ui: { label: string; fg: string; bg: string; border: string; dot?: string }; dot?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color: ui.fg, backgroundColor: ui.bg, borderColor: ui.border }}
    >
      {dot && ui.dot && <span className="size-1.5 rounded-full" style={{ backgroundColor: ui.dot }} />}
      {ui.label}
    </span>
  )
}

function CategoriaChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-[5px] border px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: "#64748B", backgroundColor: "#F1F5F9", borderColor: "#E8EDF3" }}
    >
      {children}
    </span>
  )
}

function CodigoChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={MONO} className="inline-flex items-center rounded-[5px] border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
      {children}
    </span>
  )
}

function UrgenciaChip({ p }: { p: PlanEnriquecido }) {
  const label = urgenciaLabel(p)
  if (!label) return null
  const ui = p._vencido
    ? { fg: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" }
    : { fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A" }
  return (
    <span
      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold"
      style={{ ...MONO, color: ui.fg, backgroundColor: ui.bg, borderColor: ui.border }}
    >
      {label}
    </span>
  )
}

function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ ...MONO, width: size, height: size, fontSize: size * 0.36, backgroundColor: avatarColor(name || "—") }}
      title={name || undefined}
    >
      {initials(name)}
    </span>
  )
}

function Progreso({ value, cerrada }: { value: number; cerrada: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ backgroundColor: "#EEF1F6" }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: progresoColor(value, cerrada) }} />
      </div>
      <span style={MONO} className="text-xs font-medium text-slate-600">{value}%</span>
    </div>
  )
}

function ResponsableCell({ p }: { p: PlanEnriquecido }) {
  if (p._sinResp) {
    return (
      <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
        style={{ color: "#B45309", backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }}>
        Sin asignar
      </span>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <Avatar name={p._resp} size={26} />
      <div className="min-w-0">
        <p className="truncate text-[13px] text-slate-700">{p._resp}</p>
        {p.coresponsables_count > 0 && (
          <p className="text-[11px] text-slate-400">+{p.coresponsables_count} co</p>
        )}
      </div>
    </div>
  )
}

function EstadoBadgeDropdown({ estado, disabled, onChange }: { estado: EstadoPlan; disabled?: boolean; onChange: (e: EstadoPlan) => void }) {
  const ui = ESTADO_UI[estado]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ color: ui.fg, backgroundColor: ui.bg, borderColor: ui.border }}
      >
        <span className="size-1.5 rounded-full" style={{ backgroundColor: ui.dot }} />
        {ui.label}
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {(["pendiente", "en_progreso", "completado"] as EstadoPlan[]).map((e) => (
          <DropdownMenuItem key={e} onClick={() => onChange(e)} className="gap-2 text-xs">
            <span className="size-2 rounded-full" style={{ backgroundColor: ESTADO_UI[e].dot }} />
            {ESTADO_UI[e].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SortHeader({ label, active, dir, onClick, className }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void; className?: string }) {
  return (
    <th className={cn("px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400", className)}>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-slate-600">
        {label}
        {active ? (dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />) : <ChevronDown className="size-3 opacity-0" />}
      </button>
    </th>
  )
}

function TablaPlanes({
  planes, sortKey, sortDir, onSort, onEstado, estadoDisabled, onRow,
}: {
  planes: PlanEnriquecido[]
  sortKey: SortKey
  sortDir: "asc" | "desc"
  onSort: (k: Exclude<SortKey, null>) => void
  onEstado: (id: string, e: EstadoPlan) => void
  estadoDisabled: boolean
  onRow: (id: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead style={{ backgroundColor: "#F8FAFC" }}>
            <tr className="border-b border-slate-200">
              <th className="w-1" />
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Plan</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Responsable</th>
              <SortHeader label="Límite" active={sortKey === "limite"} dir={sortDir} onClick={() => onSort("limite")} />
              <SortHeader label="Progreso" active={sortKey === "progreso"} dir={sortDir} onClick={() => onSort("progreso")} />
              <SortHeader label="Estado" active={sortKey === "estado"} dir={sortDir} onClick={() => onSort("estado")} />
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Evid.</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {planes.map((p) => (
              <tr
                key={p.id}
                onClick={() => onRow(p.id)}
                className="group cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                style={{ backgroundColor: p._vencido ? "#FFFAFA" : p._porVencer ? "#FFFDF6" : undefined }}
              >
                <td className="p-0">
                  <div className="h-full w-[5px]" style={{ backgroundColor: p._stripe, minHeight: 56 }} />
                </td>
                <td className="max-w-[420px] px-3 py-3">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <CodigoChip>{p.pregunta_numero || "—"}</CodigoChip>
                    <CategoriaChip>{p.pilar_nombre}</CategoriaChip>
                  </div>
                  <p className="line-clamp-2 text-[14px] font-medium text-slate-800">{p.titulo || p.descripcion}</p>
                </td>
                <td className="px-3 py-3"><ResponsableCell p={p} /></td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <span style={{ ...MONO, color: p._vencido ? "#B91C1C" : p._porVencer ? "#B45309" : "#475569" }} className="text-[13px]">
                      {fmtFecha(p.fecha_limite)}
                    </span>
                    <UrgenciaChip p={p} />
                  </div>
                </td>
                <td className="px-3 py-3"><Progreso value={p.progreso} cerrada={p._cerrada} /></td>
                <td className="px-3 py-3">
                  <EstadoBadgeDropdown estado={p.estado} disabled={estadoDisabled} onChange={(e) => onEstado(p.id, e)} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5 text-slate-400">
                    <span className="inline-flex items-center gap-1 text-[12px]"><MessageSquare className="size-3.5" /><span style={MONO}>{p.comentarios_count}</span></span>
                    <span className="inline-flex items-center gap-1 text-[12px]"><Paperclip className="size-3.5" /><span style={MONO}>{p.evidencias_count}</span></span>
                  </div>
                </td>
                <td className="px-2 text-slate-300">
                  <ChevronRight className="size-4 transition-colors group-hover:text-slate-500" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CardPlan({ p, onClick }: { p: PlanEnriquecido; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: p._vencido ? "#FECACA" : p._porVencer ? "#FDE68A" : "#E3E8EF" }}
    >
      <span className="absolute inset-y-0 left-0 w-[5px]" style={{ backgroundColor: p._stripe }} />
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <CodigoChip>{p.pregunta_numero || "—"}</CodigoChip>
          <CategoriaChip>{p.pilar_nombre}</CategoriaChip>
          <Pill ui={PRIORIDAD_UI[p.prioridad]} />
        </div>
        <Pill ui={ESTADO_UI[p.estado]} dot />
      </div>
      <p className="mt-2 line-clamp-2 pl-1.5 text-[14px] font-semibold text-slate-800">{p.titulo || p.descripcion}</p>
      <div className="mt-3 pl-1.5"><Progreso value={p.progreso} cerrada={p._cerrada} /></div>
      <div className="mt-3 flex items-center justify-between gap-2 pl-1.5">
        <ResponsableCell p={p} />
        <div className="flex flex-col items-end gap-1">
          <span style={{ ...MONO, color: p._vencido ? "#B91C1C" : p._porVencer ? "#B45309" : "#475569" }} className="text-[12px]">
            {fmtFecha(p.fecha_limite)}
          </span>
          <UrgenciaChip p={p} />
        </div>
      </div>
    </button>
  )
}

function EmptyState({ hayPlanes, onClear }: { hayPlanes: boolean; onClear: () => void }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white">
      <div className="flex size-12 items-center justify-center rounded-xl" style={{ backgroundColor: "#F1F5F9" }}>
        {hayPlanes ? <Search className="size-6 text-slate-400" /> : <ClipboardList className="size-6 text-slate-400" />}
      </div>
      <h2 className="text-base font-semibold text-slate-700">
        {hayPlanes ? "No hay planes que coincidan" : "No hay planes de acción"}
      </h2>
      <p className="max-w-xs text-center text-sm text-slate-500">
        {hayPlanes ? "Probá ajustando los filtros o la búsqueda." : "Los planes se crean desde la gestión de preguntas."}
      </p>
      {hayPlanes && (
        <button type="button" onClick={onClear} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          Limpiar filtros
        </button>
      )}
    </div>
  )
}
