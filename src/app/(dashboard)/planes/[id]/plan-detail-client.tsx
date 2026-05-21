"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { format } from "date-fns"
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Users,
  CalendarClock,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  ESTADO_PLAN_COLORS,
  ESTADO_PLAN_LABELS,
  PRIORIDAD_COLORS,
  PRIORIDAD_LABELS,
} from "@/lib/constants"
import { updatePlanProgreso, updatePlanNotas } from "@/actions/planes"
import {
  asociarPuntoManual,
  searchPuntosManual,
  type PuntoManualSearchResult,
} from "@/actions/tareas-directas"
import { AvancesSection } from "@/components/planes/avances-section"
import type { PlanAvanceConAutor } from "@/actions/plan-avances"
import { ResponsablesMultiPicker } from "@/components/planes/responsables-multi-picker"
import type { PlanAccionFull, UserRole } from "@/types/database"

// ==================== INFO SECTION ====================

function InfoSection({
  plan,
  onProgresoChange,
  onNotasChange,
}: {
  plan: PlanAccionFull
  onProgresoChange: (progreso: number) => void
  onNotasChange: (notas: string) => void
}) {
  const [progreso, setProgreso] = useState(plan.progreso)
  const [notas, setNotas] = useState(plan.notas ?? "")
  const [savingNotas, setSavingNotas] = useState(false)
  const [savingProgreso, setSavingProgreso] = useState(false)
  const now = new Date()
  const overdue =
    plan.fecha_limite &&
    plan.estado !== "completado" &&
    new Date(plan.fecha_limite) < now

  const progresoColor =
    progreso >= 67 ? "#22C55E" : progreso >= 34 ? "#F59E0B" : "#EF4444"

  async function handleProgresoSave() {
    setSavingProgreso(true)
    onProgresoChange(progreso)
    setSavingProgreso(false)
  }

  async function handleNotasSave() {
    setSavingNotas(true)
    onNotasChange(notas)
    setSavingNotas(false)
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        {/* Estado + Prioridad row (estado de sólo lectura: se cambia respondiendo) */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: ESTADO_PLAN_COLORS[plan.estado] }}
          >
            {ESTADO_PLAN_LABELS[plan.estado]}
          </span>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: PRIORIDAD_COLORS[plan.prioridad] }}
          >
            {PRIORIDAD_LABELS[plan.prioridad]}
          </span>
        </div>

        {/* Details grid */}
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Fecha inicio</p>
            <p className="font-medium text-slate-800">
              {plan.fecha_inicio
                ? format(new Date(plan.fecha_inicio), "dd/MM/yyyy")
                : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fecha limite</p>
            <p
              className={`font-medium ${
                overdue ? "text-red-600" : "text-slate-800"
              }`}
            >
              {plan.fecha_limite
                ? format(new Date(plan.fecha_limite), "dd/MM/yyyy")
                : "-"}
              {overdue && (
                <AlertCircle className="ml-1 inline h-3.5 w-3.5 text-red-500" />
              )}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Progreso</p>
            <span className="text-sm font-bold" style={{ color: progresoColor }}>
              {progreso}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progreso}
              onChange={(e) => setProgreso(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleProgresoSave}
              disabled={savingProgreso || progreso === plan.progreso}
            >
              Guardar
            </Button>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progreso}%`, backgroundColor: progresoColor }}
            />
          </div>
        </div>

        {/* Notas */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Notas</p>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas del plan..."
            className="min-h-16"
          />
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNotasSave}
              disabled={savingNotas || notas === (plan.notas ?? "")}
            >
              Guardar notas
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ==================== PUNTO MANUAL SECTION (tarea directa) ====================

function PuntoManualSection({
  plan,
  canEdit,
}: {
  plan: PlanAccionFull
  canEdit: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PuntoManualSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [pending, startTransition] = useTransition()

  async function runSearch(q: string) {
    setSearching(true)
    try {
      const result = await searchPuntosManual(q, 25)
      setResults(result)
    } finally {
      setSearching(false)
    }
  }

  function elegirPunto(p: PuntoManualSearchResult) {
    startTransition(async () => {
      const result = await asociarPuntoManual(plan.id, p.pregunta_id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Punto del manual asociado")
      setOpen(false)
      setQuery("")
      setResults([])
      router.refresh()
    })
  }

  function quitarPunto() {
    if (!confirm("¿Quitar la asociación al punto del manual?")) return
    startTransition(async () => {
      const result = await asociarPuntoManual(plan.id, null)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Asociación quitada")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4" />
          Punto del manual
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {plan.pregunta_id ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: plan.pilar_color || "#64748B" }}
              >
                {plan.pilar_nombre}
              </span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-700">{plan.bloque_nombre}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {plan.pregunta_numero} · {plan.pregunta_texto}
            </p>
            {canEdit && (
              <div className="mt-2 flex gap-2">
                <Dialog
                  open={open}
                  onOpenChange={(v) => {
                    setOpen(v)
                    if (v) runSearch("")
                  }}
                >
                  <DialogTrigger render={<Button size="sm" variant="outline" />}>
                    Cambiar
                  </DialogTrigger>
                  <PuntoSearchDialogContent
                    query={query}
                    setQuery={setQuery}
                    results={results}
                    runSearch={runSearch}
                    searching={searching}
                    onSelect={elegirPunto}
                    pending={pending}
                  />
                </Dialog>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={quitarPunto}
                  disabled={pending}
                >
                  Quitar
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">
              Esta tarea no está asociada a un punto del manual.
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Asociar al manual deja la tarea trazable para auditorías.
            </p>
            {canEdit && (
              <div className="mt-2">
                <Dialog
                  open={open}
                  onOpenChange={(v) => {
                    setOpen(v)
                    if (v) runSearch("")
                  }}
                >
                  <DialogTrigger render={<Button size="sm" />}>
                    Asociar punto
                  </DialogTrigger>
                  <PuntoSearchDialogContent
                    query={query}
                    setQuery={setQuery}
                    results={results}
                    runSearch={runSearch}
                    searching={searching}
                    onSelect={elegirPunto}
                    pending={pending}
                  />
                </Dialog>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PuntoSearchDialogContent({
  query,
  setQuery,
  results,
  runSearch,
  searching,
  onSelect,
  pending,
}: {
  query: string
  setQuery: (q: string) => void
  results: PuntoManualSearchResult[]
  runSearch: (q: string) => void
  searching: boolean
  onSelect: (p: PuntoManualSearchResult) => void
  pending: boolean
}) {
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Buscar punto del manual</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            runSearch(e.target.value)
          }}
          placeholder="Buscar por número, texto, guía o requerimiento…"
        />
        <div className="max-h-96 overflow-y-auto rounded-md border">
          {searching && (
            <div className="flex items-center justify-center gap-2 p-3 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
            </div>
          )}
          {!searching && results.length === 0 && (
            <div className="p-3 text-xs text-slate-500">Sin resultados.</div>
          )}
          {!searching &&
            results.map((p) => (
              <button
                key={p.pregunta_id}
                type="button"
                onClick={() => onSelect(p)}
                disabled={pending}
                className="block w-full border-b px-3 py-2 text-left text-xs hover:bg-slate-50 disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white"
                    style={{ backgroundColor: p.pilar_color }}
                  >
                    {p.pilar_nombre}
                  </span>
                  <span className="text-slate-500">{p.numero}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-slate-800">{p.texto}</p>
              </button>
            ))}
        </div>
      </div>
    </DialogContent>
  )
}

// ==================== MAIN COMPONENT ====================

export function PlanDetailClient({
  plan: initialPlan,
  currentRole,
  canEditPunto = false,
  avancesIniciales = [],
  puedeIntervenirEnAvances = false,
}: {
  plan: PlanAccionFull
  currentRole: UserRole
  canEditPunto?: boolean
  avancesIniciales?: PlanAvanceConAutor[]
  puedeIntervenirEnAvances?: boolean
}) {
  const router = useRouter()
  const [plan, setPlan] = useState(initialPlan)

  const canEditResponsables =
    currentRole === "admin" || currentRole === "auditor"

  async function handleProgresoChange(progreso: number) {
    const result = await updatePlanProgreso(plan.id, progreso)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setPlan((prev) => ({ ...prev, progreso }))
      toast.success("Progreso actualizado")
    }
  }

  async function handleNotasChange(notas: string) {
    const result = await updatePlanNotas(plan.id, notas)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      setPlan((prev) => ({ ...prev, notas: notas || null }))
      toast.success("Notas guardadas")
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/planes" />}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {plan.pregunta_id ? (
              <>
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: plan.pilar_color || "#64748B" }}
                >
                  {plan.pilar_nombre}
                </span>
                <span>/</span>
                <span>{plan.bloque_nombre}</span>
                <span>/</span>
                <Link
                  href={`/pilares/${plan.pilar_id}/pregunta/${plan.pregunta_id}`}
                  className="hover:underline"
                >
                  {plan.pregunta_numero}
                </Link>
              </>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                Tarea directa · sin punto del manual
              </span>
            )}
          </div>
          <h1 className="mt-1 text-lg font-bold text-slate-900 leading-snug">
            {plan.titulo || plan.descripcion}
          </h1>
          {plan.pregunta_texto && plan.tipo !== "directa" && (
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
              {plan.pregunta_texto}
            </p>
          )}
        </div>
      </div>

      {/* Banners de seguimiento (trazabilidad entre tareas encadenadas) */}
      {plan.origen && (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            Seguimiento de{" "}
            <Link
              href={`/planes/${plan.origen.id}`}
              className="font-medium text-blue-600 hover:underline"
            >
              {plan.origen.titulo}
            </Link>
          </span>
        </div>
      )}
      {plan.seguimientos && plan.seguimientos.length > 0 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="font-medium">
              Generó {plan.seguimientos.length} tarea
              {plan.seguimientos.length === 1 ? "" : "s"} de seguimiento:
            </span>
          </div>
          <ul className="mt-1 space-y-0.5 pl-5">
            {plan.seguimientos.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/planes/${s.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {s.titulo}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Punto del manual (asociar/cambiar) — solo para tareas directas */}
      {plan.tipo === "directa" && (
        <PuntoManualSection plan={plan} canEdit={canEditPunto} />
      )}

      {/* Info */}
      <InfoSection
        plan={plan}
        onProgresoChange={handleProgresoChange}
        onNotasChange={handleNotasChange}
      />

      {/* Responsables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" />
            Responsables ({plan.responsables?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="border-t pt-4">
          <ResponsablesMultiPicker
            planId={plan.id}
            responsables={plan.responsables ?? []}
            canEdit={canEditResponsables}
            onChange={() => router.refresh()}
          />
        </CardContent>
      </Card>

      {/* Respuestas: único lugar de acción (responder + cambiar estado + repetir) */}
      <AvancesSection
        planId={plan.id}
        avancesIniciales={avancesIniciales}
        comentarios={plan.comentarios}
        historial={plan.historial}
        reprogramaciones={plan.reprogramaciones ?? []}
        estadoActual={plan.estado}
        puedeIntervenir={puedeIntervenirEnAvances}
        onChanged={() => router.refresh()}
      />
    </div>
  )
}
