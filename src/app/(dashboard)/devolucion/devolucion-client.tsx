"use client"

// Devolución de Auditoría DPO H1 2026: tareas del auditor por pilar con check
// de resuelta y plan de acción (responsable + fecha límite) por tarea.

import { useMemo, useOptimistic, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  MessageSquareQuote,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  addTarea,
  deleteTarea,
  toggleTareaResuelta,
  updateTareaPlan,
  type DevolucionPregunta,
  type DevolucionTarea,
} from "@/actions/devolucion"

const PILARES_ORDEN = [
  "Seguridad",
  "Gente",
  "Gestión",
  "Entrega",
  "Flota",
  "Almacén",
  "Planeamiento",
]

const PILAR_COLORS: Record<string, { dot: string; active: string }> = {
  Seguridad: { dot: "bg-red-400", active: "border-transparent bg-red-500 text-white shadow-lg shadow-red-500/25" },
  Gente: { dot: "bg-amber-400", active: "border-transparent bg-amber-500 text-white shadow-lg shadow-amber-500/25" },
  Gestión: { dot: "bg-violet-400", active: "border-transparent bg-violet-500 text-white shadow-lg shadow-violet-500/25" },
  Entrega: { dot: "bg-blue-400", active: "border-transparent bg-blue-500 text-white shadow-lg shadow-blue-500/25" },
  Flota: { dot: "bg-orange-400", active: "border-transparent bg-orange-500 text-white shadow-lg shadow-orange-500/25" },
  Almacén: { dot: "bg-emerald-400", active: "border-transparent bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" },
  Planeamiento: { dot: "bg-cyan-400", active: "border-transparent bg-cyan-500 text-white shadow-lg shadow-cyan-500/25" },
}

const NOTA_STYLES: Record<string, string> = {
  "0": "bg-red-100 text-red-700 border-red-200",
  "1": "bg-orange-100 text-orange-700 border-orange-200",
  "3": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "5": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "N/A": "bg-slate-100 text-slate-500 border-slate-200",
}

function formatFecha(iso: string): string {
  // fecha_limite viene como YYYY-MM-DD; evitar el corrimiento de timezone
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  })
}

type TareaUpdate =
  | { tipo: "toggle"; tareaId: string; resuelta: boolean }
  | { tipo: "plan"; tareaId: string; responsable: string | null; fecha_limite: string | null; notas: string | null }

function aplicarUpdate(preguntas: DevolucionPregunta[], u: TareaUpdate): DevolucionPregunta[] {
  return preguntas.map((p) => ({
    ...p,
    tareas: p.tareas.map((t) => {
      if (t.id !== u.tareaId) return t
      if (u.tipo === "toggle") {
        return { ...t, resuelta: u.resuelta, resuelta_at: u.resuelta ? new Date().toISOString() : null }
      }
      return { ...t, responsable: u.responsable, fecha_limite: u.fecha_limite, notas: u.notas }
    }),
  }))
}

export function DevolucionClient({
  preguntas,
  isAdmin,
}: {
  preguntas: DevolucionPregunta[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [optimisticPreguntas, pushUpdate] = useOptimistic(preguntas, aplicarUpdate)
  const [pilarActivo, setPilarActivo] = useState<string>("Seguridad")
  const [search, setSearch] = useState("")
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [soloMandatorias, setSoloMandatorias] = useState(false)
  const [comentarioAbierto, setComentarioAbierto] = useState<Record<string, boolean>>({})
  const [planTarea, setPlanTarea] = useState<DevolucionTarea | null>(null)
  const [nuevaTareaEn, setNuevaTareaEn] = useState<string | null>(null)
  const [nuevaTareaTexto, setNuevaTareaTexto] = useState("")
  const [guardando, setGuardando] = useState(false)

  const pilares = useMemo(() => {
    const set = new Set(optimisticPreguntas.map((p) => p.pilar))
    return PILARES_ORDEN.filter((p) => set.has(p))
  }, [optimisticPreguntas])

  const statsPorPilar = useMemo(() => {
    const stats: Record<string, { total: number; resueltas: number }> = {}
    for (const p of optimisticPreguntas) {
      const s = (stats[p.pilar] ??= { total: 0, resueltas: 0 })
      s.total += p.tareas.length
      s.resueltas += p.tareas.filter((t) => t.resuelta).length
    }
    return stats
  }, [optimisticPreguntas])

  const totales = useMemo(() => {
    let total = 0
    let resueltas = 0
    for (const s of Object.values(statsPorPilar)) {
      total += s.total
      resueltas += s.resueltas
    }
    return { total, resueltas }
  }, [statsPorPilar])

  const visibles = useMemo(() => {
    let list = optimisticPreguntas.filter((p) => p.pilar === pilarActivo)
    if (soloMandatorias) list = list.filter((p) => p.mandatoria)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.pregunta.toLowerCase().includes(q) ||
          p.bloque.toLowerCase().includes(q) ||
          p.numero.includes(q) ||
          p.tareas.some((t) => t.descripcion.toLowerCase().includes(q))
      )
    }
    // preguntas sin tareas pendientes se ocultan con el filtro de pendientes
    if (soloPendientes) {
      list = list
        .map((p) => ({ ...p, tareas: p.tareas.filter((t) => !t.resuelta) }))
        .filter((p) => p.tareas.length > 0)
    }
    return list
  }, [optimisticPreguntas, pilarActivo, search, soloPendientes, soloMandatorias])

  function handleToggle(tarea: DevolucionTarea) {
    const resuelta = !tarea.resuelta
    startTransition(async () => {
      pushUpdate({ tipo: "toggle", tareaId: tarea.id, resuelta })
      const res = await toggleTareaResuelta(tarea.id, resuelta)
      if ("error" in res) toast.error(res.error)
      else router.refresh()
    })
  }

  async function handleGuardarPlan(form: FormData) {
    if (!planTarea) return
    const responsable = String(form.get("responsable") ?? "").trim() || null
    const fecha_limite = String(form.get("fecha_limite") ?? "") || null
    const notas = String(form.get("notas") ?? "").trim() || null
    setGuardando(true)
    startTransition(async () => {
      pushUpdate({ tipo: "plan", tareaId: planTarea.id, responsable, fecha_limite, notas })
      const res = await updateTareaPlan(planTarea.id, { responsable, fecha_limite, notas })
      setGuardando(false)
      setPlanTarea(null)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Plan de acción guardado")
        router.refresh()
      }
    })
  }

  async function handleAgregarTarea(preguntaId: string) {
    const texto = nuevaTareaTexto.trim()
    if (!texto) return
    setGuardando(true)
    const res = await addTarea(preguntaId, texto)
    setGuardando(false)
    if ("error" in res) toast.error(res.error)
    else {
      setNuevaTareaTexto("")
      setNuevaTareaEn(null)
      toast.success("Tarea agregada")
      router.refresh()
    }
  }

  async function handleEliminarTarea(tareaId: string) {
    const res = await deleteTarea(tareaId)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success("Tarea eliminada")
      router.refresh()
    }
  }

  const pct = totales.total ? Math.round((totales.resueltas / totales.total) * 100) : 0

  return (
    // Full-bleed sobre el navy del sidebar: anula el padding del layout
    // (p-4 pt-14 / md:p-6) y lo repone adentro.
    <div className="-mx-4 -mb-4 -mt-14 min-h-dvh bg-gradient-to-b from-navy-light to-navy px-4 pb-12 pt-20 md:-m-6 md:px-8 md:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Devolución H1 2026</h1>
          <p className="mt-1.5 text-[15px] text-blue-200/80">
            Correcciones de la auditoría DPO 2.1 por pilar — {totales.resueltas} de {totales.total}{" "}
            tareas resueltas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-44 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-2xl font-bold tabular-nums text-white">{pct}%</span>
        </div>
      </div>

      {/* Pills por pilar */}
      <div className="flex flex-wrap gap-2">
        {pilares.map((pilar) => {
          const s = statsPorPilar[pilar] ?? { total: 0, resueltas: 0 }
          const activo = pilar === pilarActivo
          const colors = PILAR_COLORS[pilar] ?? PILAR_COLORS.Seguridad
          return (
            <button
              key={pilar}
              onClick={() => setPilarActivo(pilar)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
                activo
                  ? colors.active
                  : "border-white/10 bg-white/5 text-blue-100 hover:bg-white/10 hover:text-white"
              )}
            >
              <span className={cn("size-2 rounded-full", activo ? "bg-white/80" : colors.dot)} />
              {pilar}
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  activo ? "text-white/80" : "text-blue-200/60"
                )}
              >
                {s.resueltas}/{s.total}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-blue-200/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pregunta o tarea..."
            className="border-white/10 bg-white/10 pl-8 text-white placeholder:text-blue-200/50 focus-visible:border-white/30 focus-visible:ring-white/20"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-blue-100">
          <Checkbox
            checked={soloPendientes}
            onCheckedChange={(v) => setSoloPendientes(v === true)}
            className="border-white/30"
          />
          Solo pendientes
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-blue-100">
          <Checkbox
            checked={soloMandatorias}
            onCheckedChange={(v) => setSoloMandatorias(v === true)}
            className="border-white/30"
          />
          Solo mandatorias
        </label>
      </div>

      {/* Preguntas */}
      <div className="space-y-4">
        {visibles.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/20 p-10 text-center text-[15px] text-blue-100">
            No hay preguntas que coincidan con los filtros.
          </div>
        )}
        {visibles.map((p) => {
          const pendientes = p.tareas.filter((t) => !t.resuelta).length
          const completa = p.tareas.length > 0 && pendientes === 0
          return (
            <div
              key={p.id}
              className={cn(
                "rounded-xl bg-white shadow-lg shadow-black/20",
                completa && "ring-2 ring-emerald-400/70"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-sm font-extrabold tabular-nums",
                      NOTA_STYLES[p.nota] ?? NOTA_STYLES["N/A"]
                    )}
                    title={`Nota de auditoría: ${p.nota}`}
                  >
                    {p.nota}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-snug text-slate-900">
                      {p.numero} — {p.pregunta}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {p.bloque}
                      {p.mandatoria && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 font-bold normal-case tracking-normal text-red-700">
                          Mandatoria
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {completa && <CheckCircle2 className="size-5 text-emerald-500" />}
                  {p.comentario && (
                    <button
                      onClick={() =>
                        setComentarioAbierto((s) => ({ ...s, [p.id]: !s[p.id] }))
                      }
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                    >
                      <MessageSquareQuote className="size-3.5" />
                      Devolución
                      <ChevronDown
                        className={cn(
                          "size-3.5 transition-transform",
                          comentarioAbierto[p.id] && "rotate-180"
                        )}
                      />
                    </button>
                  )}
                </div>
              </div>

              {comentarioAbierto[p.id] && p.comentario && (
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                  {p.comentario}
                </div>
              )}

              <ul className="divide-y divide-slate-50 px-1 py-1">
                {p.tareas.map((t) => (
                  <li key={t.id} className="group flex items-start gap-3 px-3 py-2.5">
                    <Checkbox
                      checked={t.resuelta}
                      onCheckedChange={() => handleToggle(t)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-[15px] leading-relaxed",
                          t.resuelta ? "text-slate-400 line-through" : "text-slate-800"
                        )}
                      >
                        {t.descripcion}
                      </p>
                      {(t.responsable || t.fecha_limite || t.notas) && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                          {t.responsable && (
                            <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                              <UserRound className="size-3" />
                              {t.responsable}
                            </span>
                          )}
                          {t.fecha_limite && (
                            <span
                              className={cn(
                                !t.resuelta &&
                                  t.fecha_limite < new Date().toISOString().slice(0, 10) &&
                                  "font-semibold text-red-600"
                              )}
                            >
                              vence {formatFecha(t.fecha_limite)}
                            </span>
                          )}
                          {t.notas && <span className="italic">{t.notas}</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setPlanTarea(t)}
                      >
                        <UserRound className="mr-1 size-3.5" />
                        {t.responsable ? "Editar plan" : "Asignar"}
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1.5 text-red-500 hover:text-red-600"
                          onClick={() => handleEliminarTarea(t.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Agregar tarea */}
              <div className="border-t border-slate-100 px-4 py-2">
                {nuevaTareaEn === p.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={nuevaTareaTexto}
                      onChange={(e) => setNuevaTareaTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAgregarTarea(p.id)
                        if (e.key === "Escape") setNuevaTareaEn(null)
                      }}
                      placeholder="Descripción de la nueva tarea..."
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={guardando || !nuevaTareaTexto.trim()}
                      onClick={() => handleAgregarTarea(p.id)}
                    >
                      {guardando ? <Loader2 className="size-4 animate-spin" /> : "Agregar"}
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setNuevaTareaEn(p.id)
                      setNuevaTareaTexto("")
                    }}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                  >
                    <Plus className="size-3.5" />
                    Agregar tarea
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Dialog plan de acción */}
      <Dialog open={planTarea !== null} onOpenChange={(open) => !open && setPlanTarea(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Plan de acción</DialogTitle>
          </DialogHeader>
          {planTarea && (
            <form action={handleGuardarPlan} className="space-y-4">
              <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {planTarea.descripcion}
              </p>
              <div className="space-y-2">
                <Label htmlFor="responsable">Responsable</Label>
                <Input
                  id="responsable"
                  name="responsable"
                  defaultValue={planTarea.responsable ?? ""}
                  placeholder="Nombre del responsable"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha_limite">Fecha límite</Label>
                <Input
                  id="fecha_limite"
                  name="fecha_limite"
                  type="date"
                  defaultValue={planTarea.fecha_limite ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notas">Notas</Label>
                <Textarea
                  id="notas"
                  name="notas"
                  rows={2}
                  defaultValue={planTarea.notas ?? ""}
                  placeholder="Observaciones del avance (opcional)"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPlanTarea(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={guardando}>
                  {guardando ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}
