"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Pencil,
  CalendarClock,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  MONO,
  ESTADO_UI,
  PRIORIDAD_UI,
  Pill,
  CategoriaChip,
  CodigoChip,
  UrgenciaChip,
  Avatar,
  Progreso,
  urgencia,
  fmtFechaCorta,
} from "../_ui"
import {
  asociarPuntoManual,
  searchPuntosManual,
  type PuntoManualSearchResult,
} from "@/actions/tareas-directas"
import { AvancesSection } from "@/components/planes/avances-section"
import type { PlanAvanceConAutor } from "@/actions/plan-avances"
import { EditarPlanDialog } from "@/components/planes/editar-plan-dialog"
import type {
  PlanAccionFull,
  PlanResponsableConProfile,
  UserRole,
} from "@/types/database"

// ==================== FICHA (cabecera consolidada) ====================

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</p>
}

function ResponsablesResumen({
  responsables,
}: {
  responsables: PlanResponsableConProfile[]
}) {
  if (responsables.length === 0) {
    return <span className="text-sm text-slate-400">Sin responsable asignado</span>
  }
  const principal =
    responsables.find((r) => r.rol === "responsable_principal") ?? responsables[0]
  const otros = responsables.length - 1
  return (
    <div className="flex items-center gap-2">
      <Avatar name={principal.profile_nombre} size={30} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{principal.profile_nombre}</p>
        <p className="text-[11px] text-slate-400">
          {otros > 0 ? `Responsable principal · +${otros} coresp.` : "Responsable principal"}
        </p>
      </div>
    </div>
  )
}

function FichaCard({
  plan,
  canEditar,
  onEditar,
}: {
  plan: PlanAccionFull
  canEditar: boolean
  onEditar: () => void
}) {
  const cerrada = plan.estado === "completado"
  const urg = urgencia(plan.fecha_limite, cerrada, plan.prioridad)

  return (
    <Card className="relative overflow-hidden pt-1">
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: urg.stripe }} />
      <CardContent className="space-y-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill ui={ESTADO_UI[plan.estado]} dot />
              <Pill ui={PRIORIDAD_UI[plan.prioridad]} />
              {plan.pregunta_id ? (
                <Link href={`/pilares/${plan.pilar_id}/pregunta/${plan.pregunta_id}`} className="hover:opacity-80">
                  <CodigoChip>Punto {plan.pregunta_numero}</CodigoChip>
                </Link>
              ) : (
                <CategoriaChip>Tarea directa</CategoriaChip>
              )}
              <CategoriaChip>{plan.pilar_nombre}</CategoriaChip>
            </div>
            <h1 className="text-[23px] font-bold leading-snug text-slate-900">
              {plan.titulo || plan.descripcion}
            </h1>
            {plan.titulo && plan.descripcion && (
              <p className="max-w-2xl whitespace-pre-line text-sm text-slate-600">{plan.descripcion}</p>
            )}
            {plan.pregunta_texto && plan.tipo !== "directa" && (
              <p className="max-w-2xl text-sm text-slate-400">{plan.pregunta_texto}</p>
            )}
          </div>
          {canEditar && (
            <Button variant="outline" size="sm" onClick={onEditar} className="shrink-0">
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Editar
            </Button>
          )}
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-100 sm:grid-cols-3">
          <div className="p-3 sm:border-r sm:border-slate-100">
            <Label>Responsable</Label>
            <div className="mt-1.5">
              <ResponsablesResumen responsables={plan.responsables ?? []} />
            </div>
          </div>
          <div className="p-3 sm:border-r sm:border-slate-100">
            <Label>Fecha límite</Label>
            <div className="mt-1.5 flex flex-col items-start gap-1">
              <span style={{ ...MONO, color: urg.vencido ? "#B91C1C" : urg.porVencer ? "#B45309" : "#0F172A" }} className="text-base font-medium">
                {fmtFechaCorta(plan.fecha_limite)}
              </span>
              <UrgenciaChip chip={urg.chip} />
            </div>
          </div>
          <div className="p-3">
            <Label>Progreso</Label>
            <div className="mt-2"><Progreso value={plan.progreso} cerrada={cerrada} width={120} /></div>
          </div>
        </div>

        {plan.notas && (
          <div>
            <Label>Notas</Label>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{plan.notas}</p>
          </div>
        )}
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
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          Punto del manual
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {plan.pregunta_id ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
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
  plan,
  currentRole,
  canEditPunto = false,
  canEditar = false,
  avancesIniciales = [],
  puedeIntervenirEnAvances = false,
}: {
  plan: PlanAccionFull
  currentRole: UserRole
  canEditPunto?: boolean
  canEditar?: boolean
  avancesIniciales?: PlanAvanceConAutor[]
  puedeIntervenirEnAvances?: boolean
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const canEditResponsables =
    currentRole === "admin" || currentRole === "auditor"

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" render={<Link href="/planes" />}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Volver a planes
      </Button>

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

      {/* Ficha consolidada (cabecera amigable) */}
      <FichaCard
        plan={plan}
        canEditar={canEditar}
        onEditar={() => setEditOpen(true)}
      />

      {/* Punto del manual (asociar/cambiar) — solo para tareas directas */}
      {plan.tipo === "directa" && (
        <PuntoManualSection plan={plan} canEdit={canEditPunto} />
      )}

      {/* Respuestas: único lugar de acción (responder + cambiar estado + repetir) */}
      <AvancesSection
        planId={plan.id}
        avancesIniciales={avancesIniciales}
        comentarios={plan.comentarios}
        historial={plan.historial}
        reprogramaciones={plan.reprogramaciones ?? []}
        estadoActual={plan.estado}
        puedeIntervenir={puedeIntervenirEnAvances}
        planTitulo={plan.titulo || plan.descripcion}
        onChanged={() => router.refresh()}
      />

      <EditarPlanDialog
        plan={plan}
        canEditResponsables={canEditResponsables}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}
