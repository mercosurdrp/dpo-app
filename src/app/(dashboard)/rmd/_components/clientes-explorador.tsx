"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FilterX,
  Loader2,
  MapPin,
  MessageSquareQuote,
  Target,
  Truck,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import {
  getRmdPuntuacionesCliente,
  type RmdCliente,
  type RmdPunto,
} from "@/actions/rmd"
import type { RmdPlan } from "@/actions/rmd-planes"
import {
  ESTADO_PLAN,
  PlanBadge,
  planesPorClienteFoco,
  type PlanMarcable,
} from "@/components/plan-badge"

const TODOS = "__todos__"

type AgruparPor = "ninguno" | "chofer" | "localidad"
type OrdenarPor = "fecha" | "rmd" | "detractoras" | "puntuaciones"

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

export function rmdBadge(rmd: number): string {
  if (rmd >= 4.5) return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (rmd >= 4) return "bg-amber-100 text-amber-800 border-amber-200"
  return "bg-red-100 text-red-800 border-red-200"
}

// Categoría de una puntuación individual: detractora 1-3 · pasiva 4 · promotora 5.
type Categoria = "detractor" | "pasivo" | "promotor"

function categoriaPunt(p: number): Categoria {
  if (p <= 3) return "detractor"
  if (p === 4) return "pasivo"
  return "promotor"
}

const CAT_UI: Record<Categoria, { label: string; badge: string; activo: string }> = {
  detractor: {
    label: "Detractora",
    badge: "bg-red-100 text-red-800 border-red-200",
    activo: "bg-red-600 text-white border-red-600 hover:bg-red-600",
  },
  pasivo: {
    label: "Pasiva",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    activo: "bg-amber-500 text-white border-amber-500 hover:bg-amber-500",
  },
  promotor: {
    label: "Promotora",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    activo: "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600",
  },
}

function puntBadge(p: number): string {
  return CAT_UI[categoriaPunt(p)].badge
}

interface Props {
  clientes: RmdCliente[]
  /** Planes de acción vivos: los que tienen foco en un cliente lo marcan acá. */
  planes: RmdPlan[]
  onCrearPlan: (c: RmdCliente) => void
  /** Abre el plan del cliente en el bloque de planes de abajo. */
  onVerPlan: (plan: PlanMarcable) => void
}

export function ClientesExplorador({
  clientes,
  planes,
  onCrearPlan,
  onVerPlan,
}: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [fChofer, setFChofer] = useState<string>(TODOS)
  const [fLocalidad, setFLocalidad] = useState<string>(TODOS)
  // Por defecto el explorador arranca enfocado en los clientes cuya ÚLTIMA
  // puntuación los deja detractores (1-3) — los accionables hoy; los botones
  // permiten cambiar a pasivos (4), promotores (5) o ver todos.
  const [fCategoria, setFCategoria] = useState<Categoria | "todas">("detractor")
  const [agruparPor, setAgruparPor] = useState<AgruparPor>("ninguno")
  const [ordenarPor, setOrdenarPor] = useState<OrdenarPor>("fecha")
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())
  const [clienteModal, setClienteModal] = useState<RmdCliente | null>(null)

  /** Planes de acción por cliente foco (un cliente puede tener más de uno). */
  const planesPorCliente = useMemo(() => planesPorClienteFoco(planes), [planes])

  const choferes = useMemo(
    () =>
      [
        ...new Set(clientes.map((c) => c.chofer).filter(Boolean)),
      ].sort() as string[],
    [clientes],
  )
  const localidades = useMemo(
    () =>
      [
        ...new Set(clientes.map((c) => c.localidad).filter(Boolean)),
      ].sort() as string[],
    [clientes],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return clientes.filter(
      (c) =>
        (fChofer === TODOS || c.chofer === fChofer) &&
        (fLocalidad === TODOS || c.localidad === fLocalidad) &&
        // La categoría del cliente sale de su ÚLTIMA puntuación (un detractor
        // que se recuperó a 5 hoy es promotor y aparece en su propia vitrina)
        (fCategoria === "todas" ||
          categoriaPunt(c.ultima_puntuacion) === fCategoria) &&
        (!q ||
          c.nombre_cliente.toLowerCase().includes(q) ||
          String(c.cod_cliente).includes(q)),
    )
  }, [clientes, busqueda, fChofer, fLocalidad, fCategoria])

  const ordenar = useMemo(
    () => (arr: RmdCliente[]) =>
      [...arr].sort((a, b) =>
        ordenarPor === "fecha"
          ? b.ultima_fecha.localeCompare(a.ultima_fecha) || a.rmd - b.rmd
          : ordenarPor === "rmd"
            ? a.rmd - b.rmd || b.detractoras - a.detractoras
            : ordenarPor === "detractoras"
              ? b.detractoras - a.detractoras || a.rmd - b.rmd
              : b.puntuaciones - a.puntuaciones || a.rmd - b.rmd,
      ),
    [ordenarPor],
  )

  const filtradosOrden = useMemo(
    () => ordenar(filtrados),
    [filtrados, ordenar],
  )

  const hayFiltros =
    !!busqueda.trim() ||
    fChofer !== TODOS ||
    fLocalidad !== TODOS ||
    fCategoria !== "todas"

  function limpiarFiltros() {
    setBusqueda("")
    setFChofer(TODOS)
    setFLocalidad(TODOS)
    setFCategoria("todas")
  }

  const grupos = useMemo(() => {
    if (agruparPor === "ninguno") return null
    const m = new Map<string, RmdCliente[]>()
    const push = (k: string, c: RmdCliente) => {
      const arr = m.get(k) ?? []
      arr.push(c)
      m.set(k, arr)
    }
    for (const c of filtrados) {
      if (agruparPor === "chofer") push(c.chofer ?? "Sin chofer", c)
      else push(c.localidad ?? "Sin localidad", c)
    }
    return [...m.entries()].sort(
      (a, b) =>
        b[1].reduce((s, x) => s + x.detractoras, 0) -
          a[1].reduce((s, x) => s + x.detractoras, 0) ||
        b[1].length - a[1].length,
    )
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
        <span className="col-span-3">Cliente</span>
        <span className="col-span-1 text-center">RMD</span>
        <span className="col-span-2 text-center">Última</span>
        <span className="col-span-2 text-right">Puntuaciones</span>
        <span className="col-span-2">Chofer</span>
        <span className="col-span-2 text-right">Acción</span>
      </div>
    )
  }

  function filaCliente(c: RmdCliente) {
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
        <span className="col-span-3 min-w-0">
          <span className="block truncate font-medium text-slate-800">
            {c.nombre_cliente}
          </span>
          <span className="block truncate text-xs text-slate-400">
            #{c.cod_cliente} · {c.localidad ?? "—"} · últ.{" "}
            {FMT_DIA.format(new Date(c.ultima_fecha))}
          </span>
        </span>
        <span className="col-span-1 text-center">
          <Badge variant="outline" className={rmdBadge(c.rmd)}>
            {c.rmd.toFixed(2)}
          </Badge>
        </span>
        <span className="col-span-2 text-center">
          <Badge variant="outline" className={puntBadge(c.ultima_puntuacion)}>
            {CAT_UI[categoriaPunt(c.ultima_puntuacion)].label} ·{" "}
            {c.ultima_puntuacion}
          </Badge>
        </span>
        <span className="col-span-2 text-right text-xs text-slate-600">
          {c.puntuaciones}
          {c.detractoras > 0 && (
            <span className="ml-1 font-medium text-red-600">
              ({c.detractoras} baja{c.detractoras > 1 ? "s" : ""})
            </span>
          )}
        </span>
        <span className="col-span-2 min-w-0 truncate text-xs text-slate-700">
          {c.chofer ?? "—"}
        </span>
        <span className="col-span-2 text-right">
          {planesCli.length > 0 ? (
            <PlanBadge planes={planesCli} onVerPlan={onVerPlan} />
          ) : (
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
          )}
        </span>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          Clientes — explorador de toda la base de RMD
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 border-t pt-4">
        {/* Controles */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="h-8 w-[220px] text-xs"
          />
          <Select value={fChofer} onValueChange={(v) => v && setFChofer(v)}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Chofer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los choferes</SelectItem>
              {choferes.map((p) => (
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
          <div className="flex items-center gap-1" title="Categoría según la última puntuación del cliente: detractora 1-3, pasiva 4, promotora 5">
            {(
              [
                ["todas", "Todas"],
                ["detractor", "Detractoras (1-3)"],
                ["pasivo", "Pasivas (4)"],
                ["promotor", "Promotoras (5)"],
              ] as Array<[Categoria | "todas", string]>
            ).map(([valor, label]) => (
              <Button
                key={valor}
                variant="outline"
                size="sm"
                className={`h-8 text-xs ${
                  fCategoria === valor
                    ? valor === "todas"
                      ? "bg-slate-700 text-white border-slate-700 hover:bg-slate-700"
                      : CAT_UI[valor].activo
                    : ""
                }`}
                onClick={() => setFCategoria(valor)}
              >
                {label}
              </Button>
            ))}
          </div>
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
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fecha">Fecha (más reciente)</SelectItem>
                <SelectItem value="rmd">RMD (peor primero)</SelectItem>
                <SelectItem value="detractoras">Puntuaciones bajas</SelectItem>
                <SelectItem value="puntuaciones">Más puntuaciones</SelectItem>
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
                <SelectItem value="chofer">Chofer</SelectItem>
                <SelectItem value="localidad">Localidad</SelectItem>
              </SelectContent>
            </Select>
          </span>
        </div>

        <p className="text-xs text-slate-500">
          {filtrados.length} de {clientes.length} clientes. Clic en un cliente
          para ver el detalle de sus puntuaciones.
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
              const det = items.reduce((s, x) => s + x.detractoras, 0)
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
                        {det} bajas
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

      {/* Modal de detalle del cliente (puntuaciones individuales) */}
      {clienteModal && (
        <ClienteModal
          cliente={clienteModal}
          planesCliente={planesPorCliente.get(clienteModal.cod_cliente) ?? []}
          onClose={() => setClienteModal(null)}
          onVerPlan={onVerPlan}
          onCrearPlan={(c) => {
            setClienteModal(null)
            onCrearPlan(c)
          }}
        />
      )}
    </Card>
  )
}

export function ClienteModal({
  cliente,
  planesCliente = [],
  onClose,
  onCrearPlan,
  onVerPlan,
}: {
  cliente: RmdCliente
  /** Planes de acción que ya enfocan a este cliente. */
  planesCliente?: RmdPlan[]
  onClose: () => void
  onCrearPlan: (c: RmdCliente) => void
  onVerPlan?: (plan: PlanMarcable) => void
}) {
  const [puntos, setPuntos] = useState<RmdPunto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setPuntos(null)
    setError(null)
    void getRmdPuntuacionesCliente(cliente.cod_cliente).then((res) => {
      if (cancel) return
      if ("error" in res) setError(res.error)
      else setPuntos(res.data)
    })
    return () => {
      cancel = true
    }
  }, [cliente.cod_cliente])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 text-left">
            {cliente.nombre_cliente}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={rmdBadge(cliente.rmd)}>
            RMD {cliente.rmd.toFixed(2)} /5
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            #{cliente.cod_cliente}
          </Badge>
          <span className="text-xs text-slate-500">
            {cliente.puntuaciones} entregas puntuadas en el año
            {cliente.detractoras > 0 &&
              ` · ${cliente.detractoras} con puntuación baja`}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 shrink-0 text-slate-400" />
            <span>
              <span className="font-medium text-slate-700">
                Chofer (últ. entrega):{" "}
              </span>
              {cliente.chofer ?? "Sin chofer"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
            <span>
              <span className="font-medium text-slate-700">Localidad: </span>
              {cliente.localidad ?? "—"}
            </span>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">
            Puntuaciones de entrega (RMD)
          </h3>
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : puntos === null ? (
            <p className="flex items-center gap-2 py-4 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando puntuaciones…
            </p>
          ) : puntos.length === 0 ? (
            <p className="text-sm text-slate-400">Sin puntuaciones cargadas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="py-1.5 pr-2">Fecha</th>
                    <th className="px-2 py-1.5 text-center">Punt.</th>
                    <th className="px-2 py-1.5">Entrega</th>
                    <th className="px-2 py-1.5">Motivo</th>
                    <th className="px-2 py-1.5">Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {puntos.map((p, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-100 align-top last:border-0"
                    >
                      <td className="whitespace-nowrap py-1.5 pr-2 text-slate-600">
                        {FMT_DIA.format(new Date(p.fecha_puntuacion))}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-center">
                        <Badge
                          variant="outline"
                          className={puntBadge(p.puntuacion)}
                        >
                          {p.puntuacion} ·{" "}
                          {CAT_UI[categoriaPunt(p.puntuacion)].label}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-slate-600">
                        {p.vehiculo_entrega ? (
                          <span className="flex items-start gap-1">
                            <Truck className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                            <span>
                              <span className="block font-medium text-slate-700">
                                {p.chofer ?? "Chofer no asignado"}
                                {p.chofer && !p.chofer_exacto && (
                                  <span
                                    className="ml-1 font-normal text-slate-400"
                                    title="Chofer asignado al camión (ese día no hubo TML/check para confirmar quién manejó)"
                                  >
                                    (asignado)
                                  </span>
                                )}
                              </span>
                              <span className="block text-[11px] text-slate-400">
                                {p.vehiculo_entrega}
                              </span>
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-slate-600">
                        {p.motivos ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-slate-500">
                        {p.comentario ? (
                          <span className="flex items-start gap-1">
                            <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                            <span className="whitespace-pre-wrap">
                              {p.comentario}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {planesCliente.length > 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-emerald-800">
              <ClipboardCheck className="h-4 w-4" />
              Este cliente ya tiene{" "}
              {planesCliente.length === 1
                ? "un plan de acción"
                : `${planesCliente.length} planes de acción`}
            </p>
            <ul className="mt-1 space-y-0.5 text-emerald-900">
              {planesCliente.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onVerPlan?.(p)
                    }}
                    className="text-left underline decoration-emerald-300 underline-offset-2 hover:decoration-emerald-600"
                  >
                    {p.titulo} — {ESTADO_PLAN[p.estado]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            variant={planesCliente.length > 0 ? "outline" : "default"}
            onClick={() => onCrearPlan(cliente)}
          >
            <Target className="mr-1 h-4 w-4" />
            {planesCliente.length > 0
              ? "Crear otro plan"
              : "Crear plan para este cliente"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
