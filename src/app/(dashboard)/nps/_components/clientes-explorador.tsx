"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
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

const TODOS = "__todos__"

type AgruparPor = "ninguno" | "promotor" | "localidad" | "driver" | "categoria"

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

interface Props {
  clientes: NpsClienteDP[]
  onCrearPlan: (c: NpsClienteDP) => void
}

export function ClientesExplorador({ clientes, onCrearPlan }: Props) {
  const [fCategoria, setFCategoria] = useState<string>(TODOS)
  const [fPromotor, setFPromotor] = useState<string>(TODOS)
  const [fLocalidad, setFLocalidad] = useState<string>(TODOS)
  const [fDriver, setFDriver] = useState<string>(TODOS)
  const [agruparPor, setAgruparPor] = useState<AgruparPor>("ninguno")
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())
  const [clienteModal, setClienteModal] = useState<NpsClienteDP | null>(null)

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

  function filaCliente(c: NpsClienteDP) {
    return (
      <button
        key={`${c.cod_cliente}`}
        type="button"
        onClick={() => setClienteModal(c)}
        className="grid w-full grid-cols-12 items-center gap-2 rounded-md border border-slate-100 bg-white px-2 py-1.5 text-left text-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <span className="col-span-4 min-w-0">
          <span className="block truncate font-medium text-slate-800">
            {c.nombre_cliente}
          </span>
          <span className="block truncate text-xs text-slate-400">
            #{c.cod_cliente} · {c.localidad ?? "—"}
          </span>
        </span>
        <span className="col-span-1 text-center">
          <Badge variant="outline" className={catBadge(c.categoria)}>
            {c.score}
          </Badge>
        </span>
        <span className="col-span-4 min-w-0 truncate text-xs text-slate-600">
          {c.drivers.join(" · ") || "—"}
        </span>
        <span className="col-span-3 min-w-0 truncate text-xs text-slate-700">
          {c.promotor ?? "—"}
        </span>
      </button>
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
          <div className="space-y-1">{filtrados.map((c) => filaCliente(c))}</div>
        ) : (
          <div className="space-y-2">
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
                      {items.map((c) => filaCliente(c))}
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

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  const c = clienteModal
                  setClienteModal(null)
                  onCrearPlan(c)
                }}
              >
                <Target className="mr-1 h-4 w-4" />
                Crear plan para este cliente
              </Button>
            </div>
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
