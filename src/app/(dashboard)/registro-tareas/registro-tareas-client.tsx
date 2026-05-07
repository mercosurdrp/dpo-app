"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Plus,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getRegistroTareasDirectas,
  type RegistroTareaItem,
  type RegistroTareasFiltros,
} from "@/actions/tareas-directas"
import {
  ESTADO_PLAN_COLORS,
  ESTADO_PLAN_LABELS,
} from "@/lib/constants"
import type { EstadoPlan } from "@/types/database"

type EstadoFiltro = "all" | EstadoPlan

interface Props {
  tareasIniciales: RegistroTareaItem[]
  operadores: Array<{
    id: string
    nombre: string
    email: string | null
    role: string
  }>
  pilares: Array<{ id: string; nombre: string; color: string }>
  bloques: Array<{ id: string; nombre: string; pilar_id: string }>
  puedeCrear: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return "-"
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function isOverdue(fechaLimite: string | null, estado: EstadoPlan): boolean {
  if (!fechaLimite || estado === "completado") return false
  return new Date(fechaLimite) < new Date()
}

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function RegistroTareasClient({
  tareasIniciales,
  operadores,
  pilares,
  bloques,
  puedeCrear,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [tareas, setTareas] = useState<RegistroTareaItem[]>(tareasIniciales)
  const [agruparPorPunto, setAgruparPorPunto] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Filtros
  const [pilarId, setPilarId] = useState<string>("")
  const [bloqueId, setBloqueId] = useState<string>("")
  const [responsableId, setResponsableId] = useState<string>("")
  const [estado, setEstado] = useState<EstadoFiltro>("all")
  const [fechaDesde, setFechaDesde] = useState<string>("")
  const [fechaHasta, setFechaHasta] = useState<string>("")
  const [query, setQuery] = useState<string>("")

  const bloquesFiltrados = useMemo(
    () => (pilarId ? bloques.filter((b) => b.pilar_id === pilarId) : bloques),
    [bloques, pilarId]
  )

  function aplicarFiltros() {
    const filtros: RegistroTareasFiltros = {
      pilarId: pilarId || undefined,
      bloqueId: bloqueId || undefined,
      responsableId: responsableId || undefined,
      estado,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      query: query || undefined,
    }
    startTransition(async () => {
      const result = await getRegistroTareasDirectas(filtros)
      if ("data" in result) setTareas(result.data)
    })
  }

  function limpiarFiltros() {
    setPilarId("")
    setBloqueId("")
    setResponsableId("")
    setEstado("all")
    setFechaDesde("")
    setFechaHasta("")
    setQuery("")
    startTransition(async () => {
      const result = await getRegistroTareasDirectas({})
      if ("data" in result) setTareas(result.data)
    })
  }

  // Agrupar por punto del manual
  const tareasAgrupadas = useMemo(() => {
    const m = new Map<
      string,
      { key: string; label: string; pilar_color: string | null; items: RegistroTareaItem[] }
    >()

    for (const t of tareas) {
      const key = t.pregunta_id ?? "__sin_punto__"
      const label =
        t.pregunta_id && t.pregunta_numero
          ? `${t.pregunta_numero} · ${t.pregunta_texto ?? ""}`
          : "Sin punto del manual asociado"
      const existing = m.get(key)
      if (existing) {
        existing.items.push(t)
      } else {
        m.set(key, {
          key,
          label,
          pilar_color: t.pilar_color,
          items: [t],
        })
      }
    }

    return Array.from(m.values()).sort((a, b) => {
      if (a.key === "__sin_punto__") return 1
      if (b.key === "__sin_punto__") return -1
      return a.label.localeCompare(b.label, "es-AR", { numeric: true })
    })
  }, [tareas])

  function toggleGrupo(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function exportarCsv() {
    const headers = [
      "Punto manual",
      "Pilar",
      "Bloque",
      "Título",
      "Descripción",
      "Estado",
      "Prioridad",
      "Fecha límite",
      "Creada",
      "Creador",
      "Responsables",
      "Evidencias",
    ]
    const rows = tareas.map((t) => [
      t.pregunta_numero ?? "—",
      t.pilar_nombre ?? "—",
      t.bloque_nombre ?? "—",
      t.titulo ?? "",
      t.descripcion,
      ESTADO_PLAN_LABELS[t.estado],
      t.prioridad,
      formatDate(t.fecha_limite),
      formatDate(t.created_at),
      t.creador_nombre,
      t.responsables.map((r) => r.nombre).join(" | "),
      String(t.evidencias_count),
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => escapeCsv(String(c))).join(","))
      .join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `registro-tareas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Registro de tareas
          </h1>
          <p className="text-xs text-slate-500">
            Trazabilidad de tareas asignadas vinculadas al manual DPO.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportarCsv}>
            <Download className="mr-1 h-4 w-4" /> Exportar CSV
          </Button>
          {puedeCrear && (
            <Button size="sm" render={<Link href="/tareas/nueva" />}>
              <Plus className="mr-1 h-4 w-4" /> Nueva tarea
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, descripción, número de punto…"
              className="pl-8"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs text-slate-600">Pilar</label>
              <Select
                value={pilarId || "all"}
                onValueChange={(v) => {
                  setPilarId(v === "all" || !v ? "" : v)
                  setBloqueId("")
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {pilares.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-slate-600">Bloque</label>
              <Select
                value={bloqueId || "all"}
                onValueChange={(v) =>
                  setBloqueId(v === "all" || !v ? "" : v)
                }
                disabled={bloquesFiltrados.length === 0}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {bloquesFiltrados.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-slate-600">Responsable</label>
              <Select
                value={responsableId || "all"}
                onValueChange={(v) =>
                  setResponsableId(v === "all" || !v ? "" : v)
                }
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {operadores.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-slate-600">Estado</label>
              <Select
                value={estado}
                onValueChange={(v) => setEstado(v as EstadoFiltro)}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="en_progreso">En progreso</SelectItem>
                  <SelectItem value="completado">Completado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs text-slate-600">Creada desde</label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-600">Creada hasta</label>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
              <Button
                size="sm"
                onClick={aplicarFiltros}
                disabled={pending}
                className="flex-1"
              >
                Aplicar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={limpiarFiltros}
                disabled={pending}
                className="flex-1"
              >
                Limpiar
              </Button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={agruparPorPunto}
              onChange={(e) => setAgruparPorPunto(e.target.checked)}
            />
            Agrupar por punto del manual
          </label>
        </CardContent>
      </Card>

      {/* Resultados */}
      <div className="text-xs text-slate-500">
        {tareas.length} tarea{tareas.length === 1 ? "" : "s"}
      </div>

      {tareas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-slate-500">
            <ClipboardList className="h-8 w-8" />
            <p className="text-sm">Sin tareas para los filtros aplicados.</p>
          </CardContent>
        </Card>
      ) : agruparPorPunto ? (
        <div className="space-y-2">
          {tareasAgrupadas.map((g) => {
            const isCollapsed = collapsed.has(g.key)
            const completadas = g.items.filter(
              (i) => i.estado === "completado"
            ).length
            return (
              <Card key={g.key}>
                <CardHeader
                  className="cursor-pointer pb-2"
                  onClick={() => toggleGrupo(g.key)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                      {g.pilar_color && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: g.pilar_color }}
                        />
                      )}
                      <CardTitle className="truncate text-sm">
                        {g.label}
                      </CardTitle>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">
                      {completadas}/{g.items.length} cerradas ·{" "}
                      {g.items.reduce((s, i) => s + i.evidencias_count, 0)} evidencias
                    </span>
                  </div>
                </CardHeader>
                {!isCollapsed && (
                  <CardContent className="space-y-2">
                    {g.items.map((t) => (
                      <TareaRow key={t.id} tarea={t} />
                    ))}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {tareas.map((t) => (
            <TareaRow key={t.id} tarea={t} />
          ))}
        </div>
      )}
    </div>
  )
}

function TareaRow({ tarea }: { tarea: RegistroTareaItem }) {
  const overdue = isOverdue(tarea.fecha_limite, tarea.estado)
  return (
    <Link
      href={`/planes/${tarea.id}`}
      className="block rounded-md border bg-white p-3 transition hover:border-slate-400 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Breadcrumb del manual */}
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            {tarea.pregunta_id ? (
              <>
                {tarea.pilar_color && tarea.pilar_nombre && (
                  <span
                    className="inline-flex rounded-full px-1.5 py-0.5 font-medium text-white"
                    style={{ backgroundColor: tarea.pilar_color }}
                  >
                    {tarea.pilar_nombre}
                  </span>
                )}
                <span className="text-slate-400">/</span>
                <span className="text-slate-600">{tarea.bloque_nombre}</span>
                <span className="text-slate-400">/</span>
                <span className="font-medium text-slate-700">
                  {tarea.pregunta_numero}
                </span>
              </>
            ) : (
              <span className="inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                Sin punto del manual
              </span>
            )}
          </div>

          {/* Título */}
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
            {tarea.titulo ?? tarea.descripcion}
          </p>

          {/* Responsables + meta */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>
              {tarea.responsables.length === 0
                ? "Sin responsables"
                : tarea.responsables.map((r) => r.nombre).join(", ")}
            </span>
            <span>·</span>
            <span>Creada {formatDate(tarea.created_at)}</span>
            {tarea.fecha_limite && (
              <>
                <span>·</span>
                <span
                  className={
                    overdue ? "text-red-600 font-medium" : "text-slate-500"
                  }
                >
                  Vence {formatDate(tarea.fecha_limite)}
                </span>
              </>
            )}
            {tarea.evidencias_count > 0 && (
              <>
                <span>·</span>
                <span>{tarea.evidencias_count} evidencia(s)</span>
              </>
            )}
          </div>
        </div>

        {/* Estado */}
        <Badge
          variant="outline"
          className="shrink-0"
          style={{
            backgroundColor: ESTADO_PLAN_COLORS[tarea.estado] + "20",
            color: ESTADO_PLAN_COLORS[tarea.estado],
            borderColor: ESTADO_PLAN_COLORS[tarea.estado] + "40",
          }}
        >
          {ESTADO_PLAN_LABELS[tarea.estado]}
        </Badge>
      </div>
    </Link>
  )
}
