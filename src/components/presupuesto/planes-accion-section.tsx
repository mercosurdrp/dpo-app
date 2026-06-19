"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Pencil,
  Trash2,
  Info,
  ClipboardList,
  ListChecks,
  CheckCircle2,
  Link2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  eliminarPlanAccion,
  eliminarPaso,
} from "@/actions/presupuesto-planes-accion"
import type {
  PlanAccionPresupuestoConDetalle,
  PlanAccionPaso,
  PresupuestoTareaConResponsable,
} from "@/types/database"
import {
  ESTADO_PASO_BADGE_CLASS,
  ESTADO_PASO_LABEL,
  ESTADO_PLAN_BADGE_CLASS,
  ESTADO_PLAN_LABEL,
  MESES_CORTOS,
} from "./planes-accion-constantes"
import { PlanAccionFormDialog } from "./plan-accion-form-dialog"
import { PasoPlanAccionDialog } from "./paso-plan-accion-dialog"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  anio: number
  planes: PlanAccionPresupuestoConDetalle[]
  responsables: ResponsableOpt[]
  tareas: PresupuestoTareaConResponsable[]
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

function progresoPlan(pasos: PlanAccionPaso[]): number | null {
  if (pasos.length === 0) return null
  const completados = pasos.filter((p) => p.estado === "completado").length
  return completados / pasos.length
}

function barColor(frac: number | null): string {
  if (frac === null) return "bg-slate-300"
  if (frac >= 1) return "bg-emerald-500"
  if (frac >= 0.5) return "bg-amber-500"
  return "bg-orange-500"
}

export function PlanesAccionSection({
  anio,
  planes,
  responsables,
  tareas,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [openForm, setOpenForm] = useState(false)
  const [editando, setEditando] = useState<PlanAccionPresupuestoConDetalle | null>(null)

  // Diálogo de paso: el plan al que pertenece + el paso (null = nuevo)
  const [pasoPlan, setPasoPlan] = useState<PlanAccionPresupuestoConDetalle | null>(null)
  const [pasoEditando, setPasoEditando] = useState<PlanAccionPaso | null>(null)

  function refrescar() {
    router.refresh()
  }

  function handleEliminarPlan(plan: PlanAccionPresupuestoConDetalle) {
    if (
      !confirm(
        `¿Eliminar el plan de acción "${plan.titulo}"? Se borran también sus acciones. No se puede deshacer.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarPlanAccion(plan.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  function handleEliminarPaso(paso: PlanAccionPaso) {
    if (!confirm("¿Eliminar esta acción del plan?")) return
    startTransition(async () => {
      const result = await eliminarPaso(paso.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  function abrirNuevoPaso(plan: PlanAccionPresupuestoConDetalle) {
    setPasoEditando(null)
    setPasoPlan(plan)
  }

  function abrirEditarPaso(plan: PlanAccionPresupuestoConDetalle, paso: PlanAccionPaso) {
    setPasoEditando(paso)
    setPasoPlan(plan)
  }

  const resumen = useMemo(() => {
    let abiertos = 0
    let cerrados = 0
    let accionesPend = 0
    for (const p of planes) {
      if (p.estado === "cerrado") cerrados++
      else if (p.estado !== "cancelado") abiertos++
      accionesPend += p.pasos.filter((x) => x.estado !== "completado").length
    }
    return { abiertos, cerrados, accionesPend }
  }, [planes])

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <Info className="size-5 shrink-0 text-blue-600" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Planes de acción</p>
            <p className="mt-1">
              Registrá un plan de acción para trabajar un{" "}
              <strong>desvío significativo</strong> del presupuesto. Vinculalo a
              la tarea de análisis del desvío y cargá las{" "}
              <strong>acciones</strong> con responsable, fecha y avance.
            </p>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <ClipboardList className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Planes activos</p>
              <p className="text-lg font-bold text-slate-900">
                {resumen.abiertos}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <ListChecks className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Acciones pendientes
              </p>
              <p className="text-lg font-bold text-slate-900">
                {resumen.accionesPend}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Planes cerrados</p>
              <p className="text-lg font-bold text-slate-900">
                {resumen.cerrados}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Acción */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Planes de acción {anio}
        </h2>
        {puedeEditar && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditando(null)
              setOpenForm(true)
            }}
          >
            <Plus className="mr-2 size-4" />
            Nuevo plan
          </Button>
        )}
      </div>

      {/* Lista de planes */}
      {planes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sin planes de acción cargados para {anio}.
            {puedeEditar && (
              <>
                {" "}
                <button
                  className="font-medium text-blue-600 hover:underline"
                  onClick={() => {
                    setEditando(null)
                    setOpenForm(true)
                  }}
                >
                  Cargá el primero
                </button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {planes.map((plan) => {
            const frac = progresoPlan(plan.pasos)
            const completados = plan.pasos.filter(
              (p) => p.estado === "completado",
            ).length
            return (
              <Card key={plan.id}>
                <CardContent className="space-y-4 py-4">
                  {/* Cabecera */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={`${ESTADO_PLAN_BADGE_CLASS[plan.estado]} hover:opacity-100`}
                        >
                          {ESTADO_PLAN_LABEL[plan.estado]}
                        </Badge>
                        {plan.tarea_rubro && (
                          <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
                            <Link2 className="mr-1 size-3" />
                            {plan.tarea_mes
                              ? `${MESES_CORTOS[plan.tarea_mes - 1]} · `
                              : ""}
                            {plan.tarea_rubro}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1.5 font-semibold text-slate-900">
                        {plan.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {plan.responsable_nombre ?? "Sin responsable"}
                        {plan.fecha_limite &&
                          ` · Límite: ${formatDate(plan.fecha_limite)}`}
                      </p>
                      {plan.desvio_detectado && (
                        <p className="mt-1 text-sm text-slate-600">
                          <span className="font-medium text-slate-700">
                            Desvío:
                          </span>{" "}
                          {plan.desvio_detectado}
                        </p>
                      )}
                      {plan.causa_raiz && (
                        <p className="mt-0.5 text-sm text-slate-600">
                          <span className="font-medium text-slate-700">
                            Causa raíz:
                          </span>{" "}
                          {plan.causa_raiz}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {puedeEditar && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditando(plan)
                              setOpenForm(true)
                            }}
                            title="Editar plan"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEliminarPlan(plan)}
                            title="Eliminar plan"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progreso */}
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Avance de acciones</span>
                      <span>
                        {completados}/{plan.pasos.length}
                        {frac !== null ? ` · ${Math.round(frac * 100)}%` : ""}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full ${barColor(frac)}`}
                        style={{
                          width: `${Math.max(0, Math.min(100, (frac ?? 0) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Acciones / pasos */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Acciones
                      </p>
                      {puedeEditar && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => abrirNuevoPaso(plan)}
                        >
                          <Plus className="mr-1 size-3.5" />
                          Agregar acción
                        </Button>
                      )}
                    </div>

                    {plan.pasos.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-sm text-muted-foreground">
                        Sin acciones cargadas.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {plan.pasos.map((paso) => (
                          <div
                            key={paso.id}
                            className="rounded-lg border border-slate-200 bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    className={`${ESTADO_PASO_BADGE_CLASS[paso.estado]} hover:opacity-100`}
                                  >
                                    {ESTADO_PASO_LABEL[paso.estado]}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {paso.responsable_nombre ?? "Sin asignar"}
                                    {paso.fecha_limite &&
                                      ` · ${formatDate(paso.fecha_limite)}`}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm font-medium text-slate-900">
                                  {paso.que}
                                </p>
                                {paso.como && (
                                  <p className="mt-0.5 text-xs text-slate-600">
                                    <span className="font-medium">Cómo:</span>{" "}
                                    {paso.como}
                                  </p>
                                )}
                                {paso.avance && (
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    <span className="font-medium">Avance:</span>{" "}
                                    {paso.avance}
                                  </p>
                                )}
                              </div>
                              {puedeEditar && (
                                <div className="flex shrink-0 gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => abrirEditarPaso(plan, paso)}
                                    title="Editar acción"
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEliminarPaso(paso)}
                                    title="Eliminar acción"
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {plan.observaciones && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Observaciones:</span>{" "}
                      {plan.observaciones}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Diálogos */}
      {puedeEditar && (
        <PlanAccionFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          anio={anio}
          plan={editando}
          responsables={responsables}
          tareas={tareas}
          onSaved={refrescar}
        />
      )}

      {puedeEditar && pasoPlan && (
        <PasoPlanAccionDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) {
              setPasoPlan(null)
              setPasoEditando(null)
            }
          }}
          plan={pasoPlan}
          paso={pasoEditando}
          responsables={responsables}
          onSaved={refrescar}
        />
      )}
    </div>
  )
}
