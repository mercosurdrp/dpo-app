"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Calendar,
  ClipboardList,
  MessageSquare,
  Plus,
  Target,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { listResponsablesPosibles } from "@/actions/reuniones"
import {
  listarPlanesRmd,
  type EstadoRmdPlan,
  type RmdPlan,
  type RecuperacionRmdPlan,
} from "@/actions/rmd-planes"
import { PlanFormDialog, type FocoInicial } from "./plan-form-dialog"
import { PlanDetalleDialog } from "./plan-detalle-dialog"

const ESTADO_LABELS: Record<EstadoRmdPlan, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}

const ESTADO_BADGE: Record<EstadoRmdPlan, string> = {
  pendiente: "bg-amber-100 text-amber-800 border-amber-200",
  en_progreso: "bg-blue-100 text-blue-800 border-blue-200",
  completado: "bg-emerald-100 text-emerald-800 border-emerald-200",
}

const PRIORIDAD_LABELS: Record<string, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
}

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-800 border-red-200",
  media: "bg-amber-100 text-amber-800 border-amber-200",
  baja: "bg-slate-100 text-slate-700 border-slate-200",
}

const RECUPERACION_BADGE: Record<
  RecuperacionRmdPlan,
  { label: string; cls: string }
> = {
  recuperado: {
    label: "🟢 Recuperado",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  mejorando: {
    label: "🟡 Mejorando",
    cls: "bg-amber-100 text-amber-800 border-amber-200",
  },
  critico: {
    label: "🔴 Sigue crítico",
    cls: "bg-red-100 text-red-800 border-red-200",
  },
  sin_reencuesta: {
    label: "⏳ Sin nuevas puntuaciones",
    cls: "bg-slate-100 text-slate-600 border-slate-200",
  },
}

const TODOS = "__todos__"

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

function fechaDia(iso: string | null): string {
  if (!iso) return "—"
  try {
    return FMT_DIA.format(new Date(iso + "T00:00:00"))
  } catch {
    return iso
  }
}

interface Props {
  planesIniciales: RmdPlan[]
  motivos: string[]
  clientes: { cod_cliente: number; nombre_cliente: string }[]
  choferes: string[]
  /** Foco prellenado al abrir el form desde la tabla de clientes con RMD bajo. */
  focoInicial?: FocoInicial | null
  /** Cambia cada vez que hay que abrir el form con el foco actual. */
  abrirNonce?: number
}

export function PlanesAccionBloque({
  planesIniciales,
  motivos,
  clientes,
  choferes,
  focoInicial = null,
  abrirNonce = 0,
}: Props) {
  const [planes, setPlanes] = useState<RmdPlan[]>(planesIniciales)
  const [responsables, setResponsables] = useState<
    { id: string; nombre: string }[]
  >([])
  const [filtroEstado, setFiltroEstado] = useState<string>(TODOS)

  const [formOpen, setFormOpen] = useState(false)
  const [planEditar, setPlanEditar] = useState<RmdPlan | null>(null)
  const [planDetalle, setPlanDetalle] = useState<RmdPlan | null>(null)

  useEffect(() => {
    listResponsablesPosibles().then((r) => {
      if ("data" in r) {
        setResponsables(r.data.map((u) => ({ id: u.id, nombre: u.nombre })))
      }
    })
  }, [])

  // Abrir el form con foco prellenado (botón "Plan" de la tabla de clientes).
  useEffect(() => {
    if (abrirNonce > 0) {
      setPlanEditar(null)
      setFormOpen(true)
    }
  }, [abrirNonce])

  async function refetch() {
    const r = await listarPlanesRmd()
    if ("data" in r) {
      setPlanes(r.data)
      setPlanDetalle((prev) =>
        prev ? (r.data.find((p) => p.id === prev.id) ?? null) : prev,
      )
    }
  }

  const planesFiltrados = useMemo(() => {
    if (filtroEstado === TODOS) return planes
    return planes.filter((p) => p.estado === filtroEstado)
  }, [planes, filtroEstado])

  function abrirNuevo() {
    setPlanEditar(null)
    setFormOpen(true)
  }

  function abrirEditarDesdeDetalle() {
    if (!planDetalle) return
    setPlanEditar(planDetalle)
    setFormOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-slate-500" />
            Plan de Acción Centrado en el Cliente (R4.1.2)
          </span>
          <span className="flex items-center gap-2">
            <Select
              value={filtroEstado}
              onValueChange={(v) => v && setFiltroEstado(v)}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="en_progreso">En progreso</SelectItem>
                <SelectItem value="completado">Completado</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={abrirNuevo}>
              <Plus className="mr-1 h-4 w-4" />
              Nuevo plan
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="border-t pt-4">
        {planesFiltrados.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            {planes.length === 0 ? (
              <>
                Todavía no hay planes. Creá el primero desde un cliente con RMD
                bajo, un motivo de baja puntuación o un promotor.
              </>
            ) : (
              <>No hay planes con ese estado.</>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {planesFiltrados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPlanDetalle(p)}
                  className="w-full rounded-md border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 font-medium text-slate-900">
                      {p.titulo}
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {p.recuperacion && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${RECUPERACION_BADGE[p.recuperacion].cls}`}
                          title={
                            p.post_rmd_avg != null
                              ? `RMD: ${p.baseline_rmd?.toFixed(2) ?? "?"} → ${p.post_rmd_avg.toFixed(2)} /5`
                              : "El cliente todavía no puntuó entregas desde el plan"
                          }
                        >
                          {RECUPERACION_BADGE[p.recuperacion].label}
                          {p.post_rmd_avg != null &&
                            ` ${p.baseline_rmd?.toFixed(2) ?? "?"}→${p.post_rmd_avg.toFixed(2)}`}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${ESTADO_BADGE[p.estado]}`}
                      >
                        {ESTADO_LABELS[p.estado]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          PRIORIDAD_BADGE[p.prioridad] ?? ""
                        }`}
                      >
                        {PRIORIDAD_LABELS[p.prioridad] ?? p.prioridad}
                      </Badge>
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    {(p.foco_motivo ||
                      p.foco_cliente_nombre ||
                      p.foco_chofer ||
                      p.foco_promotor) && (
                      <span className="flex items-center gap-1">
                        <Target className="h-3.5 w-3.5" />
                        {[
                          p.foco_motivo,
                          p.foco_cliente_nombre,
                          p.foco_chofer
                            ? `Chofer: ${p.foco_chofer}`
                            : p.foco_promotor,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {p.responsable_nombre ?? "Sin asignar"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {fechaDia(p.fecha_objetivo)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {p.avances_count}{" "}
                      {p.avances_count === 1 ? "avance" : "avances"}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <PlanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        motivos={motivos}
        clientes={clientes}
        choferes={choferes}
        responsables={responsables}
        planExistente={planEditar}
        focoInicial={planEditar ? null : focoInicial}
        onSaved={refetch}
      />

      {planDetalle && (
        <PlanDetalleDialog
          open={planDetalle !== null}
          onOpenChange={(o) => {
            if (!o) setPlanDetalle(null)
          }}
          plan={planDetalle}
          onChanged={refetch}
          onEditar={abrirEditarDesdeDetalle}
        />
      )}
    </Card>
  )
}
