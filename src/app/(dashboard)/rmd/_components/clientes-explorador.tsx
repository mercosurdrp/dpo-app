"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FilterX,
  Loader2,
  MapPin,
  MessageSquareQuote,
  Target,
  Truck,
  User,
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

const TODOS = "__todos__"

type AgruparPor = "ninguno" | "promotor" | "localidad"
type OrdenarPor = "rmd" | "detractoras" | "puntuaciones"

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

function puntBadge(p: number): string {
  if (p >= 4) return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (p === 3) return "bg-amber-100 text-amber-800 border-amber-200"
  return "bg-red-100 text-red-800 border-red-200"
}

interface Props {
  clientes: RmdCliente[]
  onCrearPlan: (c: RmdCliente) => void
}

export function ClientesExplorador({ clientes, onCrearPlan }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [fPromotor, setFPromotor] = useState<string>(TODOS)
  const [fLocalidad, setFLocalidad] = useState<string>(TODOS)
  // Por defecto el explorador arranca enfocado en los clientes con puntuaciones
  // bajas (1-3), que son los accionables; el botón permite ver todos.
  const [soloDetractoras, setSoloDetractoras] = useState(true)
  const [agruparPor, setAgruparPor] = useState<AgruparPor>("ninguno")
  const [ordenarPor, setOrdenarPor] = useState<OrdenarPor>("rmd")
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())
  const [clienteModal, setClienteModal] = useState<RmdCliente | null>(null)

  const promotores = useMemo(
    () =>
      [
        ...new Set(clientes.map((c) => c.promotor).filter(Boolean)),
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
        (fPromotor === TODOS || c.promotor === fPromotor) &&
        (fLocalidad === TODOS || c.localidad === fLocalidad) &&
        (!soloDetractoras || c.detractoras > 0) &&
        (!q ||
          c.nombre_cliente.toLowerCase().includes(q) ||
          String(c.cod_cliente).includes(q)),
    )
  }, [clientes, busqueda, fPromotor, fLocalidad, soloDetractoras])

  const ordenar = useMemo(
    () => (arr: RmdCliente[]) =>
      [...arr].sort((a, b) =>
        ordenarPor === "rmd"
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
    fPromotor !== TODOS ||
    fLocalidad !== TODOS ||
    soloDetractoras

  function limpiarFiltros() {
    setBusqueda("")
    setFPromotor(TODOS)
    setFLocalidad(TODOS)
    setSoloDetractoras(false)
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
      if (agruparPor === "promotor") push(c.promotor ?? "Sin promotor", c)
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
        <span className="col-span-4">Cliente</span>
        <span className="col-span-1 text-center">RMD</span>
        <span className="col-span-2 text-right">Puntuaciones</span>
        <span className="col-span-3">Promotor</span>
        <span className="col-span-2 text-right">Acción</span>
      </div>
    )
  }

  function filaCliente(c: RmdCliente) {
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
        <span className="col-span-2 text-right text-xs text-slate-600">
          {c.puntuaciones}
          {c.detractoras > 0 && (
            <span className="ml-1 font-medium text-red-600">
              ({c.detractoras} baja{c.detractoras > 1 ? "s" : ""})
            </span>
          )}
        </span>
        <span className="col-span-3 min-w-0 truncate text-xs text-slate-700">
          {c.promotor ?? "—"}
        </span>
        <span className="col-span-2 text-right">
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
          <Button
            variant={soloDetractoras ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setSoloDetractoras((v) => !v)}
          >
            Con puntuaciones bajas
          </Button>
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
                <SelectItem value="promotor">Promotor</SelectItem>
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
          onClose={() => setClienteModal(null)}
          onCrearPlan={(c) => {
            setClienteModal(null)
            onCrearPlan(c)
          }}
        />
      )}
    </Card>
  )
}

function ClienteModal({
  cliente,
  onClose,
  onCrearPlan,
}: {
  cliente: RmdCliente
  onClose: () => void
  onCrearPlan: (c: RmdCliente) => void
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
            <User className="h-4 w-4 shrink-0 text-slate-400" />
            <span>
              <span className="font-medium text-slate-700">Promotor: </span>
              {cliente.promotor ?? "Sin promotor vigente"}
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
                      <td className="px-2 py-1.5 text-center">
                        <Badge
                          variant="outline"
                          className={puntBadge(p.puntuacion)}
                        >
                          {p.puntuacion}
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

        <div className="flex justify-end">
          <Button size="sm" onClick={() => onCrearPlan(cliente)}>
            <Target className="mr-1 h-4 w-4" />
            Crear plan para este cliente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
