"use client"

import { useCallback, useMemo, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FilterX,
  MapPin,
  MessageSquareQuote,
  Target,
  User,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { NpsClienteDP } from "@/actions/nps"
import type { EstadoNpsPlan, NpsPlan } from "@/actions/nps-planes"

const TODOS = "__todos__"

type AgruparPor = "ninguno" | "promotor" | "localidad" | "driver" | "categoria"
type OrdenarPor = "score" | "fecha"

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

function catBadge(categoria: "Detractor" | "Passive"): string {
  return categoria === "Detractor"
    ? "bg-red-100 text-red-800 border-red-200"
    : "bg-amber-100 text-amber-800 border-amber-200"
}

const ESTADO_PLAN: Record<EstadoNpsPlan, string> = {
  pendiente: "pendiente",
  en_progreso: "en progreso",
  completado: "completado",
}

/**
 * Marca al cliente que ya tiene un plan de acción creado abajo, para no
 * duplicarlo. Un plan cerrado se muestra distinto de uno todavía abierto.
 */
function PlanBadge({ planes }: { planes: NpsPlan[] }) {
  if (planes.length === 0) return null

  const abiertos = planes.filter((p) => p.estado !== "completado")
  const cerrado = abiertos.length === 0
  const detalle = planes
    .map((p) => `${p.titulo} (${ESTADO_PLAN[p.estado]})`)
    .join(" · ")

  return (
    <Badge
      variant="outline"
      title={`Ya tiene ${planes.length === 1 ? "un plan de acción" : `${planes.length} planes de acción`}: ${detalle}`}
      className={`shrink-0 gap-1 px-1.5 py-0 text-[10px] font-medium ${
        cerrado
          ? "border-slate-200 bg-slate-100 text-slate-600"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <ClipboardCheck className="h-3 w-3" />
      {cerrado ? "Plan cerrado" : "Con plan"}
      {planes.length > 1 && ` (${planes.length})`}
    </Badge>
  )
}

interface Props {
  clientes: NpsClienteDP[]
  /** Planes de acción vivos: los que tienen foco en un cliente lo marcan acá. */
  planes: NpsPlan[]
  onCrearPlan: (c: NpsClienteDP) => void
}

export function ClientesExplorador({ clientes, planes, onCrearPlan }: Props) {
  // Arranca donde se mira primero: los detractores, los más recientes arriba.
  const [fCategoria, setFCategoria] = useState<string>("Detractor")
  const [fPromotor, setFPromotor] = useState<string>(TODOS)
  const [fLocalidad, setFLocalidad] = useState<string>(TODOS)
  const [fDriver, setFDriver] = useState<string>(TODOS)
  const [agruparPor, setAgruparPor] = useState<AgruparPor>("ninguno")
  const [ordenarPor, setOrdenarPor] = useState<OrdenarPor>("fecha")
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())
  const [clienteModal, setClienteModal] = useState<NpsClienteDP | null>(null)

  /** Planes de acción por cliente foco (un cliente puede tener más de uno). */
  const planesPorCliente = useMemo(() => {
    const m = new Map<number, NpsPlan[]>()
    for (const p of planes) {
      if (p.foco_cliente_id == null) continue
      const ps = m.get(p.foco_cliente_id)
      if (ps) ps.push(p)
      else m.set(p.foco_cliente_id, [p])
    }
    return m
  }, [planes])

  const promotores = useMemo(
    () =>
      [...new Set(clientes.map((c) => c.promotor).filter(Boolean))].sort() as string[],
    [clientes],
  )
  const localidades = useMemo(
    () =>
      [...new Set(clientes.map((c) => c.localidad).filter(Boolean))].sort() as string[],
    [clientes],
  )
  const driversTodos = useMemo(
    () => [...new Set(clientes.flatMap((c) => c.drivers))].sort(),
    [clientes],
  )

  const filtrados = useMemo(
    () =>
      clientes.filter(
        (c) =>
          (fCategoria === TODOS || c.categoria === fCategoria) &&
          (fPromotor === TODOS || c.promotor === fPromotor) &&
          (fLocalidad === TODOS || c.localidad === fLocalidad) &&
          (fDriver === TODOS || c.drivers.includes(fDriver)),
      ),
    [clientes, fCategoria, fPromotor, fLocalidad, fDriver],
  )

  // Orden: por score (peor primero) o por fecha de última encuesta (más
  // reciente primero). El criterio secundario desempata.
  const ordenar = useCallback(
    (arr: NpsClienteDP[]) =>
      [...arr].sort((a, b) =>
        ordenarPor === "score"
          ? a.score - b.score ||
            +new Date(b.fecha_enc) - +new Date(a.fecha_enc)
          : +new Date(b.fecha_enc) - +new Date(a.fecha_enc) ||
            a.score - b.score,
      ),
    [ordenarPor],
  )

  const filtradosOrden = useMemo(
    () => ordenar(filtrados),
    [filtrados, ordenar],
  )

  const hayFiltros =
    fCategoria !== TODOS ||
    fPromotor !== TODOS ||
    fLocalidad !== TODOS ||
    fDriver !== TODOS

  function limpiarFiltros() {
    setFCategoria(TODOS)
    setFPromotor(TODOS)
    setFLocalidad(TODOS)
    setFDriver(TODOS)
  }

  // Agrupación: un cliente puede aparecer en varios grupos cuando se agrupa
  // por driver (marcó más de uno).
  const grupos = useMemo(() => {
    if (agruparPor === "ninguno") return null
    const m = new Map<string, NpsClienteDP[]>()
    const push = (k: string, c: NpsClienteDP) => {
      const arr = m.get(k) ?? []
      arr.push(c)
      m.set(k, arr)
    }
    for (const c of filtrados) {
      if (agruparPor === "promotor") push(c.promotor ?? "Sin promotor", c)
      else if (agruparPor === "localidad") push(c.localidad ?? "Sin localidad", c)
      else if (agruparPor === "categoria")
        push(c.categoria === "Detractor" ? "Detractores" : "Pasivos", c)
      else if (agruparPor === "driver") {
        if (c.drivers.length === 0) push("Sin driver", c)
        for (const d of c.drivers) push(d, c)
      }
    }
    // Orden: más detractores primero, después por tamaño.
    return [...m.entries()].sort((a, b) => {
      const detA = a[1].filter((x) => x.categoria === "Detractor").length
      const detB = b[1].filter((x) => x.categoria === "Detractor").length
      return detB - detA || b[1].length - a[1].length
    })
  }, [filtrados, agruparPor])

  function toggleGrupo(k: string) {
    setColapsados((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }

  function encabezadoColumnas() {
    return (
      <div className="grid grid-cols-12 items-center gap-2 px-2 pb-1 text-xs font-medium uppercase text-slate-500">
        <span className="col-span-4">Cliente</span>
        <span className="col-span-1 text-center">Score</span>
        <span className="col-span-3">Drivers</span>
        <span className="col-span-3">Promotor</span>
        <span className="col-span-1 text-right">Acción</span>
      </div>
    )
  }

  function filaCliente(c: NpsClienteDP) {
    const planesCli = planesPorCliente.get(c.cod_cliente) ?? []
    return (
      <div
        key={`${c.cod_cliente}`}
        role="button"
        tabIndex={0}
        onClick={() => setClienteModal(c)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setClienteModal(c)
        }}
        className="grid w-full cursor-pointer grid-cols-12 items-center gap-2 rounded-md border border-slate-100 bg-white px-2 py-1.5 text-left text-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <span className="col-span-4 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium text-slate-800">
              {c.nombre_cliente}
            </span>
            <PlanBadge planes={planesCli} />
          </span>
          <span className="block truncate text-xs text-slate-400">
            #{c.cod_cliente} · {c.localidad ?? "—"} ·{" "}
            {FMT_DIA.format(new Date(c.fecha_enc))}
          </span>
        </span>
        <span className="col-span-1 text-center">
          <Badge variant="outline" className={catBadge(c.categoria)}>
            {c.score}
          </Badge>
        </span>
        <span className="col-span-3 min-w-0 truncate text-xs text-slate-600">
          {c.drivers.join(" · ") || "—"}
        </span>
        <span className="col-span-3 min-w-0 truncate text-xs text-slate-700">
          {c.promotor ?? "—"}
        </span>
        <span className="col-span-1 text-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onCrearPlan(c)
            }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100"
            title="Crear plan de acción para este cliente"
          >
            <Target className="h-3.5 w-3.5" />
            Plan
          </button>
        </span>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          Clientes detractores y pasivos — explorador
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 border-t pt-4">
        {/* Controles */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={fCategoria} onValueChange={(v) => v && setFCategoria(v)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Det. + Pasivos</SelectItem>
              <SelectItem value="Detractor">Solo detractores</SelectItem>
              <SelectItem value="Passive">Solo pasivos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fPromotor} onValueChange={(v) => v && setFPromotor(v)}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Promotor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los promotores</SelectItem>
              {promotores.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={fLocalidad}
            onValueChange={(v) => v && setFLocalidad(v)}
          >
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Localidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas las localidades</SelectItem>
              {localidades.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fDriver} onValueChange={(v) => v && setFDriver(v)}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder="Driver" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los drivers</SelectItem>
              {driversTodos.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hayFiltros && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-slate-500"
              onClick={limpiarFiltros}
            >
              <FilterX className="mr-1 h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
          <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            Ordenar por
            <Select
              value={ordenarPor}
              onValueChange={(v) => v && setOrdenarPor(v as OrdenarPor)}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Score (peor primero)</SelectItem>
                <SelectItem value="fecha">Última encuesta</SelectItem>
              </SelectContent>
            </Select>
          </span>
          <span className="flex items-center gap-2 text-xs text-slate-500">
            Agrupar por
            <Select
              value={agruparPor}
              onValueChange={(v) => v && setAgruparPor(v as AgruparPor)}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguno">Sin agrupar</SelectItem>
                <SelectItem value="promotor">Promotor</SelectItem>
                <SelectItem value="driver">Driver</SelectItem>
                <SelectItem value="localidad">Localidad</SelectItem>
                <SelectItem value="categoria">Categoría</SelectItem>
              </SelectContent>
            </Select>
          </span>
        </div>

        <p className="text-xs text-slate-500">
          {filtrados.length} de {clientes.length} clientes
          {agruparPor === "driver" &&
            " · al agrupar por driver un cliente puede aparecer en más de un grupo"}
          . Clic en un cliente para ver el detalle de subdrivers.
        </p>

        {/* Listado */}
        {filtrados.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Ningún cliente coincide con los filtros.
          </p>
        ) : grupos === null ? (
          <div className="space-y-1">
            {encabezadoColumnas()}
            {filtradosOrden.map((c) => filaCliente(c))}
          </div>
        ) : (
          <div className="space-y-2">
            {encabezadoColumnas()}
            {grupos.map(([nombre, items]) => {
              const det = items.filter(
                (x) => x.categoria === "Detractor",
              ).length
              const abierto = !colapsados.has(nombre)
              return (
                <div
                  key={nombre}
                  className="rounded-md border border-slate-200"
                >
                  <button
                    type="button"
                    onClick={() => toggleGrupo(nombre)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    {abierto ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                      {nombre}
                    </span>
                    {det > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-red-100 text-red-800 border-red-200 text-[10px]"
                      >
                        {det} det.
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {items.length}
                    </Badge>
                  </button>
                  {abierto && (
                    <div className="space-y-1 border-t border-slate-100 p-2">
                      {ordenar(items).map((c) => filaCliente(c))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {/* Modal de detalle del cliente */}
      {clienteModal && (
        <Dialog
          open={clienteModal !== null}
          onOpenChange={(o) => {
            if (!o) setClienteModal(null)
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="pr-6 text-left">
                {clienteModal.nombre_cliente}
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={catBadge(clienteModal.categoria)}
              >
                {clienteModal.categoria === "Detractor"
                  ? "Detractor"
                  : "Pasivo"}{" "}
                · score {clienteModal.score}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                #{clienteModal.cod_cliente}
              </Badge>
              <span className="text-xs text-slate-500">
                Última encuesta:{" "}
                {FMT_DIA.format(new Date(clienteModal.fecha_enc))}
                {clienteModal.n_encuestas > 1 &&
                  ` · ${clienteModal.n_encuestas} encuestas D+P en el año`}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  <span className="font-medium text-slate-700">
                    Promotor:{" "}
                  </span>
                  {clienteModal.promotor ?? "Sin promotor vigente"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  <span className="font-medium text-slate-700">
                    Localidad:{" "}
                  </span>
                  {clienteModal.localidad ?? "—"}
                </span>
              </div>
            </div>

            {clienteModal.comentario && (
              <p className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-700">
                <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="whitespace-pre-wrap">
                  {clienteModal.comentario}
                </span>
              </p>
            )}

            <Separator />

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">
                Qué puntuó (driver → subdriver)
              </h3>
              {clienteModal.drivers_detalle.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No marcó drivers en la encuesta.
                </p>
              ) : (
                <ul className="space-y-2">
                  {agruparDetalle(clienteModal.drivers_detalle).map(
                    ([driver, subs]) => (
                      <li key={driver}>
                        <p className="text-sm font-medium text-slate-700">
                          {driver}
                        </p>
                        {subs.length > 0 && (
                          <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-200 pl-3">
                            {subs.map((s) => (
                              <li key={s} className="text-xs text-slate-500">
                                {s}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>

            {(() => {
              const planesCli =
                planesPorCliente.get(clienteModal.cod_cliente) ?? []
              const yaTiene = planesCli.length > 0
              return (
                <>
                  {yaTiene && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
                      <p className="flex items-center gap-1.5 font-medium text-emerald-800">
                        <ClipboardCheck className="h-4 w-4" />
                        Este cliente ya tiene{" "}
                        {planesCli.length === 1
                          ? "un plan de acción"
                          : `${planesCli.length} planes de acción`}
                      </p>
                      <ul className="mt-1 space-y-0.5 text-emerald-900">
                        {planesCli.map((p) => (
                          <li key={p.id}>
                            {p.titulo} — {ESTADO_PLAN[p.estado]}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant={yaTiene ? "outline" : "default"}
                      onClick={() => {
                        const c = clienteModal
                        setClienteModal(null)
                        onCrearPlan(c)
                      }}
                    >
                      <Target className="mr-1 h-4 w-4" />
                      {yaTiene
                        ? "Crear otro plan"
                        : "Crear plan para este cliente"}
                    </Button>
                  </div>
                </>
              )
            })()}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}

function agruparDetalle(
  detalle: Array<[string, string | null]>,
): Array<[string, string[]]> {
  const m = new Map<string, string[]>()
  for (const [p, s] of detalle) {
    const arr = m.get(p) ?? []
    if (s && !arr.includes(s)) arr.push(s)
    m.set(p, arr)
  }
  return [...m.entries()]
}
