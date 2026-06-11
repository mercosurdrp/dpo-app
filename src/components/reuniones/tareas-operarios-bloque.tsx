"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ClipboardList, ExternalLink, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  getRegistroTareasDirectas,
  type RegistroTareaItem,
} from "@/actions/tareas-directas"
import { ESTADO_PLAN_COLORS, ESTADO_PLAN_LABELS } from "@/lib/constants"
import type { EstadoPlan } from "@/types/database"

type FiltroTareas = "abiertas" | "pendiente" | "en_progreso" | "completado" | "todas"

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

export function TareasOperariosBloque() {
  const [tareas, setTareas] = useState<RegistroTareaItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroTareas>("abiertas")

  useEffect(() => {
    let activo = true
    getRegistroTareasDirectas({})
      .then((res) => {
        if (!activo) return
        if ("error" in res) setError(res.error)
        else setTareas(res.data)
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : "Error cargando tareas")
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [])

  const conteos = useMemo(
    () => ({
      abiertas: tareas.filter((t) => t.estado !== "completado").length,
      pendiente: tareas.filter((t) => t.estado === "pendiente").length,
      en_progreso: tareas.filter((t) => t.estado === "en_progreso").length,
      completado: tareas.filter((t) => t.estado === "completado").length,
    }),
    [tareas],
  )

  const tareasFiltradas = useMemo(() => {
    if (filtro === "todas") return tareas
    if (filtro === "abiertas") return tareas.filter((t) => t.estado !== "completado")
    return tareas.filter((t) => t.estado === filtro)
  }, [tareas, filtro])

  const chips: Array<{ key: FiltroTareas; label: string; activo: string }> = [
    {
      key: "abiertas",
      label: `Abiertas (${conteos.abiertas})`,
      activo: "border-violet-500 bg-violet-50 font-semibold text-violet-700",
    },
    {
      key: "pendiente",
      label: `Pendientes (${conteos.pendiente})`,
      activo: "border-slate-500 bg-slate-100 font-semibold text-slate-800",
    },
    {
      key: "en_progreso",
      label: `En progreso (${conteos.en_progreso})`,
      activo: "border-amber-500 bg-amber-50 font-semibold text-amber-700",
    },
    {
      key: "completado",
      label: `Completadas (${conteos.completado})`,
      activo: "border-emerald-500 bg-emerald-50 font-semibold text-emerald-700",
    },
    {
      key: "todas",
      label: `Todas (${tareas.length})`,
      activo: "border-violet-500 bg-violet-50 font-semibold text-violet-700",
    },
  ]

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-violet-900">
            <ClipboardList className="size-4 text-violet-600" />
            Tareas de operarios
            {cargando && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Asignadas desde Registro de tareas — los operarios las ven en Mis tareas.
          </p>
        </div>
        <Link
          href="/registro-tareas"
          className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline"
        >
          Ver registro completo
          <ExternalLink className="size-3" />
        </Link>
      </div>

      {error ? (
        <p className="px-4 py-4 text-sm text-red-600">{error}</p>
      ) : cargando ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Cargando tareas…</p>
      ) : tareas.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          No hay tareas asignadas a operarios.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 px-4 text-xs">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFiltro(c.key)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs transition",
                  filtro === c.key
                    ? c.activo
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          {tareasFiltradas.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              Ninguna tarea coincide con este filtro.
            </p>
          ) : (
            <div className="mt-3 space-y-2 px-4">
              {tareasFiltradas.map((t) => (
                <TareaOperarioRow key={t.id} tarea={t} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TareaOperarioRow({ tarea }: { tarea: RegistroTareaItem }) {
  const overdue = isOverdue(tarea.fecha_limite, tarea.estado)
  return (
    <Link
      href={`/planes/${tarea.id}`}
      target="_blank"
      className="block rounded-md border bg-white p-3 transition hover:border-violet-400 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
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

          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
            {tarea.titulo ?? tarea.descripcion}
          </p>

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
                  className={overdue ? "font-medium text-red-600" : "text-slate-500"}
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
