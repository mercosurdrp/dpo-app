"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Columns3,
  List,
  Loader2,
  MessageSquare,
  Paperclip,
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
  listarPlanesRechazos,
  type EstadoRechazoPlan,
  type RechazoPlan,
} from "@/actions/rechazos-planes"
import { PlanFormDialog } from "./plan-form-dialog"
import { PlanDetalleDialog } from "./plan-detalle-dialog"

const ESTADO_LABELS: Record<EstadoRechazoPlan, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}

const ESTADO_BADGE: Record<EstadoRechazoPlan, string> = {
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

/** Borde izquierdo de la tarjeta según prioridad. */
const PRIORIDAD_BORDE: Record<string, string> = {
  alta: "border-l-red-400",
  media: "border-l-amber-300",
  baja: "border-l-slate-200",
}

const COLUMNAS: Array<{
  estado: EstadoRechazoPlan
  titulo: string
  header: string
  dot: string
}> = [
  {
    estado: "pendiente",
    titulo: "Pendiente",
    header: "bg-amber-50 border-amber-200 text-amber-800",
    dot: "bg-amber-400",
  },
  {
    estado: "en_progreso",
    titulo: "En progreso",
    header: "bg-blue-50 border-blue-200 text-blue-800",
    dot: "bg-blue-400",
  },
  {
    estado: "completado",
    titulo: "Completado",
    header: "bg-emerald-50 border-emerald-200 text-emerald-800",
    dot: "bg-emerald-400",
  },
]

const TODOS = "__todos__"

const FMT_DIA_CORTO = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
})

function fechaDia(iso: string | null): string {
  if (!iso) return "—"
  try {
    return FMT_DIA_CORTO.format(new Date(iso.slice(0, 10) + "T00:00:00"))
  } catch {
    return iso
  }
}

/** Hoy (YYYY-MM-DD) en horario argentino. */
function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date())
}

function estaVencido(p: RechazoPlan, hoy: string): boolean {
  return (
    p.estado !== "completado" &&
    p.fecha_objetivo != null &&
    p.fecha_objetivo < hoy
  )
}

/** Normaliza para comparar título vs foco (tildes, "&"/"y", espacios). */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "y")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/** Tarjeta de plan — se usa en el tablero y en la lista. */
function PlanCard({
  plan,
  hoy,
  compacta,
  onClick,
}: {
  plan: RechazoPlan
  hoy: string
  compacta: boolean
  onClick: () => void
}) {
  const vencido = estaVencido(plan, hoy)
  // Si el título es solo el nombre del cliente o el motivo, el titular de
  // la tarjeta es la ACCIÓN (descripción) y el foco lo acompaña debajo.
  const tituloEsFoco =
    (plan.foco_cliente_nombre &&
      normalizar(plan.titulo) === normalizar(plan.foco_cliente_nombre)) ||
    (plan.foco_motivo_ds &&
      normalizar(plan.titulo) === normalizar(plan.foco_motivo_ds))
  const titular =
    tituloEsFoco && plan.descripcion ? plan.descripcion : plan.titulo
  const descripcionAparte =
    plan.descripcion && plan.descripcion !== titular ? plan.descripcion : null
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border border-l-4 bg-white p-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 ${
        PRIORIDAD_BORDE[plan.prioridad] ?? "border-l-slate-200"
      } ${vencido ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-slate-900">
          {titular}
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {compacta && (
            <Badge
              variant="outline"
              className={`text-[10px] ${ESTADO_BADGE[plan.estado]}`}
            >
              {ESTADO_LABELS[plan.estado]}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-[10px] ${PRIORIDAD_BADGE[plan.prioridad] ?? ""}`}
          >
            {PRIORIDAD_LABELS[plan.prioridad] ?? plan.prioridad}
          </Badge>
        </span>
      </div>

      {/* La acción propiamente dicha (cuando no es ya el titular) */}
      {descripcionAparte && (
        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap rounded border-l-2 border-slate-300 bg-slate-50 px-2 py-1 text-[13px] font-semibold text-slate-800">
          {descripcionAparte}
        </p>
      )}

      {/* Foco del plan */}
      {(plan.foco_motivo_ds || plan.foco_cliente_nombre) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {plan.foco_motivo_ds && (
            <span className="inline-flex max-w-full items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
              <Target className="h-3 w-3 shrink-0" />
              <span className="truncate">{plan.foco_motivo_ds}</span>
            </span>
          )}
          {plan.foco_cliente_nombre && (
            <span className="inline-flex max-w-full items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[12px] font-semibold text-sky-800">
              <span className="truncate">{plan.foco_cliente_nombre}</span>
            </span>
          )}
        </div>
      )}

      {/* Pie: responsable, fecha, avances */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <span className="flex min-w-0 items-center gap-1">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {plan.responsable_nombre ?? "Sin asignar"}
          </span>
        </span>
        <span
          className={`flex items-center gap-1 ${
            vencido ? "font-semibold text-red-600" : ""
          }`}
        >
          {vencido ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Calendar className="h-3 w-3" />
          )}
          {fechaDia(plan.fecha_objetivo)}
          {vencido && " · vencido"}
        </span>
        <span
          className={`flex items-center gap-1 ${
            plan.avances_count === 0 ? "text-slate-400" : ""
          }`}
          title={`${plan.avances_count} avance(s) de seguimiento cargados`}
        >
          {plan.avances_count > 0 ? (
            <Paperclip className="h-3 w-3" />
          ) : (
            <MessageSquare className="h-3 w-3" />
          )}
          {plan.avances_count} av.
        </span>
      </div>
    </button>
  )
}

interface Props {
  planesIniciales: RechazoPlan[]
  motivos: { id_rechazo: number; ds_rechazo: string }[]
  clientes: { id_cliente: number; nombre_cliente: string }[]
}

export function PlanesAccionBloque({
  planesIniciales,
  motivos,
  clientes,
}: Props) {
  const [planes, setPlanes] = useState<RechazoPlan[]>(planesIniciales)
  const [responsables, setResponsables] = useState<
    { id: string; nombre: string }[]
  >([])
  const [vista, setVista] = useState<"tablero" | "lista">("tablero")
  const [filtroEstado, setFiltroEstado] = useState<string>(TODOS)
  const [filtroMotivo, setFiltroMotivo] = useState<string>(TODOS)
  const [filtroResponsable, setFiltroResponsable] = useState<string>(TODOS)

  const [formOpen, setFormOpen] = useState(false)
  const [planEditar, setPlanEditar] = useState<RechazoPlan | null>(null)
  const [planDetalle, setPlanDetalle] = useState<RechazoPlan | null>(null)

  const hoy = useMemo(() => hoyISO(), [])

  useEffect(() => {
    listResponsablesPosibles().then((r) => {
      if ("data" in r) {
        setResponsables(r.data.map((u) => ({ id: u.id, nombre: u.nombre })))
      }
    })
  }, [])

  async function refetch() {
    const r = await listarPlanesRechazos()
    if ("data" in r) {
      setPlanes(r.data)
      // Mantener sincronizado el plan abierto en el detalle.
      setPlanDetalle((prev) =>
        prev ? (r.data.find((p) => p.id === prev.id) ?? null) : prev,
      )
    }
  }

  const motivosEnPlanes = useMemo(
    () =>
      [
        ...new Set(planes.map((p) => p.foco_motivo_ds).filter(Boolean)),
      ] as string[],
    [planes],
  )
  const responsablesEnPlanes = useMemo(
    () =>
      [
        ...new Set(planes.map((p) => p.responsable_nombre).filter(Boolean)),
      ] as string[],
    [planes],
  )

  const planesFiltrados = useMemo(() => {
    return planes.filter((p) => {
      if (filtroMotivo !== TODOS && p.foco_motivo_ds !== filtroMotivo)
        return false
      if (
        filtroResponsable !== TODOS &&
        p.responsable_nombre !== filtroResponsable
      )
        return false
      return true
    })
  }, [planes, filtroMotivo, filtroResponsable])

  // En la lista además aplica el filtro de estado (el tablero ya separa por columnas).
  const planesLista = useMemo(() => {
    if (filtroEstado === TODOS) return planesFiltrados
    return planesFiltrados.filter((p) => p.estado === filtroEstado)
  }, [planesFiltrados, filtroEstado])

  const resumen = useMemo(() => {
    const porEstado = { pendiente: 0, en_progreso: 0, completado: 0 }
    let vencidos = 0
    for (const p of planesFiltrados) {
      porEstado[p.estado] += 1
      if (estaVencido(p, hoy)) vencidos += 1
    }
    return { porEstado, vencidos }
  }, [planesFiltrados, hoy])

  const hayFiltros = filtroMotivo !== TODOS || filtroResponsable !== TODOS

  function abrirNuevo() {
    setPlanEditar(null)
    setFormOpen(true)
  }

  function abrirEditarDesdeDetalle() {
    if (!planDetalle) return
    setPlanEditar(planDetalle)
    setFormOpen(true)
  }

  const resumenTiles: Array<{
    icono: React.ReactNode
    valor: number | string
    etiqueta: string
    cls: string
  }> = [
    {
      icono: <ClipboardList className="h-4 w-4" />,
      valor: planesFiltrados.length,
      etiqueta: "Planes",
      cls: "text-slate-700",
    },
    {
      icono: <Loader2 className="h-4 w-4" />,
      valor: resumen.porEstado.pendiente + resumen.porEstado.en_progreso,
      etiqueta: "Abiertos",
      cls: "text-blue-700",
    },
    {
      icono: <CheckCircle2 className="h-4 w-4" />,
      valor: resumen.porEstado.completado,
      etiqueta: "Completados",
      cls: "text-emerald-700",
    },
    {
      icono: <AlertTriangle className="h-4 w-4" />,
      valor: resumen.vencidos,
      etiqueta: "Vencidos",
      cls: resumen.vencidos > 0 ? "text-red-600" : "text-slate-400",
    },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-slate-500" />
            Planes de acción sobre rechazos
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-slate-200">
              <button
                type="button"
                onClick={() => setVista("tablero")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  vista === "tablero"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Columns3 className="h-3.5 w-3.5" />
                Tablero
              </button>
              <button
                type="button"
                onClick={() => setVista("lista")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  vista === "lista"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Lista
              </button>
            </div>
            <Button size="sm" onClick={abrirNuevo}>
              <Plus className="mr-1 h-4 w-4" />
              Nuevo plan
            </Button>
          </span>
        </CardTitle>

        {/* Resumen */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {resumenTiles.map((t) => (
            <div
              key={t.etiqueta}
              className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-1.5"
            >
              <span className={t.cls}>{t.icono}</span>
              <span className={`text-lg font-bold tabular-nums ${t.cls}`}>
                {t.valor}
              </span>
              <span className="text-[11px] leading-tight text-slate-500">
                {t.etiqueta}
              </span>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {vista === "lista" && (
            <Select
              value={filtroEstado}
              onValueChange={(v) => v && setFiltroEstado(v)}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="en_progreso">En progreso</SelectItem>
                <SelectItem value="completado">Completado</SelectItem>
              </SelectContent>
            </Select>
          )}
          {motivosEnPlanes.length > 0 && (
            <Select
              value={filtroMotivo}
              onValueChange={(v) => v && setFiltroMotivo(v)}
            >
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los motivos</SelectItem>
                {motivosEnPlanes.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {responsablesEnPlanes.length > 0 && (
            <Select
              value={filtroResponsable}
              onValueChange={(v) => v && setFiltroResponsable(v)}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los responsables</SelectItem>
                {responsablesEnPlanes.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hayFiltros && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-slate-500"
              onClick={() => {
                setFiltroMotivo(TODOS)
                setFiltroResponsable(TODOS)
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="border-t pt-4">
        {planesFiltrados.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            {planes.length === 0 ? (
              <>
                Todavía no hay planes de acción. Creá el primero para hacer
                seguimiento de los rechazos.
              </>
            ) : (
              <>No hay planes con esos filtros.</>
            )}
          </div>
        ) : vista === "tablero" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {COLUMNAS.map((col) => {
              const items = planesFiltrados.filter(
                (p) => p.estado === col.estado,
              )
              return (
                <div
                  key={col.estado}
                  className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/50"
                >
                  <div
                    className={`flex items-center justify-between gap-2 rounded-t-lg border-b px-3 py-2 text-sm font-semibold ${col.header}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                      {col.titulo}
                    </span>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold tabular-nums">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 p-2">
                    {items.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-400">
                        Sin planes
                      </p>
                    ) : (
                      items.map((p) => (
                        <PlanCard
                          key={p.id}
                          plan={p}
                          hoy={hoy}
                          compacta={false}
                          onClick={() => setPlanDetalle(p)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : planesLista.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            No hay planes con ese estado.
          </div>
        ) : (
          <ul className="space-y-2">
            {planesLista.map((p) => (
              <li key={p.id}>
                <PlanCard
                  plan={p}
                  hoy={hoy}
                  compacta
                  onClick={() => setPlanDetalle(p)}
                />
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
        responsables={responsables}
        planExistente={planEditar}
        onSaved={refetch}
      />

      {planDetalle && (
        <PlanDetalleDialog
          open={planDetalle !== null}
          onOpenChange={(o) => {
            if (!o) setPlanDetalle(null)
          }}
          plan={planDetalle}
          responsables={responsables}
          onChanged={refetch}
          onEditar={abrirEditarDesdeDetalle}
        />
      )}
    </Card>
  )
}
