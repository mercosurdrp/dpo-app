"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Network,
  TrendingUp,
  TrendingDown,
  Trophy,
  Sprout,
  Box,
  ArrowDownRight,
  Info,
  Star,
  ClipboardList,
  Plus,
} from "lucide-react"
import {
  CLUSTER_LABELS,
  type ClusterId,
  type ClienteClusterizado,
  type ClusterizacionData,
} from "@/actions/clusterizacion-tipos"
import {
  crearPlanCluster,
  getPlanesCluster,
  actualizarEstadoPlanCluster,
  type ClusterPlan,
} from "@/actions/clusterizacion-planes"

interface Props {
  data: ClusterizacionData
  planesIniciales: ClusterPlan[]
}

// Estética por cluster (color + ícono + descripción del cuadrante).
const CLUSTER_META: Record<
  ClusterId,
  { color: string; bg: string; icon: React.ReactNode; desc: string }
> = {
  ganador: {
    color: "#059669",
    bg: "bg-emerald-50",
    icon: <Trophy className="h-5 w-5" />,
    desc: "Alta facturación · creciendo",
  },
  en_crecimiento: {
    color: "#2563EB",
    bg: "bg-blue-50",
    icon: <Sprout className="h-5 w-5" />,
    desc: "Baja facturación · creciendo",
  },
  basico: {
    color: "#D97706",
    bg: "bg-amber-50",
    icon: <Box className="h-5 w-5" />,
    desc: "Alta facturación · sin crecer",
  },
  ventas_bajas: {
    color: "#DC2626",
    bg: "bg-red-50",
    icon: <ArrowDownRight className="h-5 w-5" />,
    desc: "Baja facturación · sin crecer",
  },
}

const fmtMoneda = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
    notation: n >= 1_000_000 ? "compact" : "standard",
  }).format(n)

const fmtPct = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(n)

const fmtNum = (n: number, dec = 0) =>
  new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: dec,
    minimumFractionDigits: dec,
  }).format(n)

const ESTADO_PLAN: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-slate-100 text-slate-700" },
  en_proceso: { label: "En proceso", cls: "bg-blue-100 text-blue-700" },
  hecho: { label: "Hecho", cls: "bg-emerald-100 text-emerald-700" },
}

function CrecimientoBadge({ pct }: { pct: number | null }) {
  if (pct === null)
    return (
      <Badge variant="secondary" className="text-xs">
        nuevo
      </Badge>
    )
  const positivo = pct >= 0
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${positivo ? "text-emerald-600" : "text-red-600"}`}
    >
      {positivo ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {fmtPct(pct)}
    </span>
  )
}

function SelectFiltro({
  label, value, onChange, opciones,
}: { label: string; value: string; onChange: (v: string) => void; opciones: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="todos">Todos</option>
        {opciones.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}

const MOSTRADOR = "VTA. MOSTRADOR"
const MAX_FILAS = 300

export function ClusterizacionClient({ data, planesIniciales }: Props) {
  const [tab, setTab] = useState<"clientes" | "planes">("clientes")
  const [filtroCluster, setFiltroCluster] = useState<ClusterId | "todos">("todos")
  const [busqueda, setBusqueda] = useState("")
  const [fLocalidad, setFLocalidad] = useState("todos")
  const [fPromotor, setFPromotor] = useState("todos")
  const [fSupervisor, setFSupervisor] = useState("todos")
  const [fEstado, setFEstado] = useState<"todos" | "pasa" | "no_pasa">("todos")
  const [fSalud, setFSalud] = useState<"todos" | "sano" | "atencion">("todos")
  const [incluirMostrador, setIncluirMostrador] = useState(false)
  const [planes, setPlanes] = useState<ClusterPlan[]>(planesIniciales)
  const [planCliente, setPlanCliente] = useState<ClienteClusterizado | null>(null)

  const { periodo, umbral_ingresos, resumen, clientes } = data

  const refrescarPlanes = async () => setPlanes(await getPlanesCluster())

  const opciones = useMemo(() => {
    const loc = new Set<string>(), prom = new Set<string>(), sup = new Set<string>()
    for (const c of clientes) {
      if (c.localidad) loc.add(c.localidad)
      if (c.promotor) prom.add(c.promotor)
      if (c.supervisor) sup.add(c.supervisor)
    }
    const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b))
    return { localidades: ord(loc), promotores: ord(prom), supervisores: ord(sup) }
  }, [clientes])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return clientes
      .filter((c) => filtroCluster === "todos" || c.cluster === filtroCluster)
      .filter((c) => fLocalidad === "todos" || c.localidad === fLocalidad)
      .filter((c) => fPromotor === "todos" || c.promotor === fPromotor)
      .filter((c) => fSupervisor === "todos" || c.supervisor === fSupervisor)
      .filter((c) => fEstado === "todos" || c.estado === fEstado)
      .filter((c) => fSalud === "todos" || c.salud === fSalud)
      .filter(
        (c) =>
          incluirMostrador ||
          fPromotor === MOSTRADOR ||
          (c.promotor ?? "").trim().toUpperCase() !== MOSTRADOR,
      )
      .filter(
        (c) =>
          q === "" ||
          (c.nombre ?? "").toLowerCase().includes(q) ||
          String(c.id_cliente).includes(q) ||
          (c.localidad ?? "").toLowerCase().includes(q) ||
          (c.promotor ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => b.ingresos_actual - a.ingresos_actual)
  }, [clientes, filtroCluster, busqueda, fLocalidad, fPromotor, fSupervisor, fEstado, fSalud, incluirMostrador])

  const visibles = filtrados.slice(0, MAX_FILAS)
  const resumenById = (cl: ClusterId) => resumen.find((r) => r.cluster === cl)

  const TABS = [
    { k: "clientes" as const, label: "Clientes" },
    { k: "planes" as const, label: `Planes (${planes.length})` },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-100 p-3 text-indigo-600">
            <Network className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Clusterización de Clientes
            </h1>
            <p className="text-sm text-muted-foreground">
              Planeamiento 4.2 · Plan de agrupación de clientes (PDV)
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
          Encuadre YTD · {periodo.ytd_desde} → {periodo.ytd_hasta}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg border bg-white p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "planes" ? (
        <SolapaPlanes planes={planes} onChange={refrescarPlanes} />
      ) : (
        <>
          {/* Metodología */}
          <Card className="border-l-4 border-l-indigo-400 bg-indigo-50/40">
            <CardContent className="flex gap-3 pt-5 text-sm text-slate-700">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
              <div className="space-y-1">
                <p>
                  4 clústeres por el cruce <strong>facturación × crecimiento</strong>{" "}
                  en modo <strong>YTD</strong>: acumulado <strong>{periodo.ytd_desde} → {periodo.ytd_hasta}</strong>{" "}
                  vs. el mismo tramo del año anterior (<strong>{periodo.ytd_prev_desde} → {periodo.ytd_prev_hasta}</strong>).
                  Umbral de facturación alta/baja = mediana = <strong>{fmtMoneda(umbral_ingresos)}</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Estado</strong> (responsabilidad del cliente):{" "}
                  <strong className="text-red-600">No pasa</strong> = rechazó ≥ 1 entrega por su culpa
                  (sin dinero / cerrado / sin envases) en los <strong>últimos 45 días</strong>; los rechazos por
                  error interno no cuentan.{" "}
                  <strong>Salud</strong> (costo de servir):{" "}
                  <strong className="text-amber-600">Atención</strong> = drop bajo (&lt; 3 b/vis, 45 días)
                  o RMD bajo (&lt; 4,5, 6 meses); si no, <strong className="text-emerald-600">Sano</strong>.
                  Se ocultan los clientes sin compras en 45 días (drop 0).
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Matriz 2×2 de clústeres */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["ganador", "en_crecimiento", "basico", "ventas_bajas"] as ClusterId[]).map((cl) => {
              const r = resumenById(cl)
              const meta = CLUSTER_META[cl]
              const activo = filtroCluster === cl
              return (
                <button key={cl} onClick={() => setFiltroCluster(activo ? "todos" : cl)} className="text-left">
                  <Card
                    className={`h-full transition-all hover:shadow-md ${activo ? "ring-2" : ""}`}
                    style={{
                      // @ts-expect-error ring color via CSS var
                      "--tw-ring-color": meta.color,
                    }}
                  >
                    <CardContent className={`space-y-3 pt-5 ${meta.bg}`}>
                      <div className="flex items-center justify-between">
                        <div className="rounded-lg p-2" style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
                          {meta.icon}
                        </div>
                        <span className="text-2xl font-bold" style={{ color: meta.color }}>
                          {r?.clientes ?? 0}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{CLUSTER_LABELS[cl]}</p>
                        <p className="text-xs text-muted-foreground">{meta.desc}</p>
                      </div>
                      <div className="space-y-1 border-t pt-2 text-xs text-slate-600">
                        <div className="flex justify-between">
                          <span>% PDV</span>
                          <span className="font-medium">{fmtPct(r?.pct_clientes ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>% facturación</span>
                          <span className="font-medium">{fmtPct(r?.pct_ingresos ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Drop size</span>
                          <span className="font-medium">{fmtNum(r?.drop_size_prom ?? 0, 1)} b/vis</span>
                        </div>
                        <div className="flex justify-between">
                          <span>RMD prom</span>
                          <span className="font-medium">
                            {r?.rmd_prom != null ? `${fmtNum(r.rmd_prom, 2)} ★` : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                          <span>No pasa / Atención</span>
                          <span className="font-medium">
                            <span className="text-red-600">{fmtNum(r?.no_pasan ?? 0)}</span>
                            {" / "}
                            <span className="text-amber-600">{fmtNum(r?.en_atencion ?? 0)}</span>
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              )
            })}
          </div>

          {/* Filtros (explorador) */}
          <Card>
            <CardContent className="pt-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <SelectFiltro label="Localidad" value={fLocalidad} onChange={setFLocalidad} opciones={opciones.localidades} />
                <SelectFiltro label="Promotor" value={fPromotor} onChange={setFPromotor} opciones={opciones.promotores} />
                <SelectFiltro label="Supervisor" value={fSupervisor} onChange={setFSupervisor} opciones={opciones.supervisores} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Estado</label>
                  <select
                    value={fEstado}
                    onChange={(e) => setFEstado(e.target.value as "todos" | "pasa" | "no_pasa")}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="todos">Todos</option>
                    <option value="pasa">Pasa</option>
                    <option value="no_pasa">No pasa</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Salud</label>
                  <select
                    value={fSalud}
                    onChange={(e) => setFSalud(e.target.value as "todos" | "sano" | "atencion")}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="todos">Todos</option>
                    <option value="sano">Sano</option>
                    <option value="atencion">Atención</option>
                  </select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={incluirMostrador}
                    onChange={(e) => setIncluirMostrador(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Incluir VTA. MOSTRADOR
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Tabla de clientes */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">
                Clientes ({fmtNum(filtrados.length)})
                {filtroCluster !== "todos" && (
                  <Badge
                    className="ml-2"
                    style={{
                      backgroundColor: `${CLUSTER_META[filtroCluster].color}22`,
                      color: CLUSTER_META[filtroCluster].color,
                    }}
                  >
                    {CLUSTER_LABELS[filtroCluster]}
                  </Badge>
                )}
              </CardTitle>
              <Input
                placeholder="Buscar por nombre, ID, localidad o promotor…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="max-w-xs"
              />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Localidad</TableHead>
                      <TableHead>Cluster</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Salud</TableHead>
                      <TableHead className="text-right">Facturación YTD</TableHead>
                      <TableHead className="text-right">Crec.</TableHead>
                      <TableHead className="text-right">Drop size</TableHead>
                      <TableHead className="text-right">RMD</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibles.map((c) => {
                      const meta = CLUSTER_META[c.cluster]
                      return (
                        <TableRow key={c.id_cliente}>
                          <TableCell className="max-w-[170px]">
                            <div className="truncate font-medium text-slate-900" title={c.nombre ?? undefined}>
                              {c.nombre ?? `Cliente ${c.id_cliente}`}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              #{c.id_cliente}
                              {c.promotor ? ` · ${c.promotor}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[100px] truncate text-sm text-slate-600" title={c.localidad ?? undefined}>
                            {c.localidad ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
                            >
                              {CLUSTER_LABELS[c.cluster]}
                            </Badge>
                          </TableCell>
                          {/* Estado */}
                          <TableCell>
                            {c.estado === "no_pasa" ? (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span className="cursor-help">
                                      <Badge variant="secondary" className="w-fit bg-red-100 text-red-700 hover:bg-red-100">
                                        No pasa
                                        <span className="ml-1 text-[10px] opacity-70">{fmtNum(c.rechazos_culpa)} rech.</span>
                                      </Badge>
                                    </span>
                                  }
                                />
                                <TooltipContent className="w-60 items-stretch">
                                  <div className="flex w-full flex-col text-left">
                                    <p className="mb-1 font-semibold">Rechazos del cliente (últimos 45 días)</p>
                                    {c.rechazos_detalle.map((d) => (
                                      <div key={d.motivo} className="flex justify-between gap-3 py-0.5">
                                        <span className="opacity-80">{d.motivo}</span>
                                        <span className="tabular-nums">
                                          {fmtNum(d.eventos)} ent · {fmtNum(d.bultos, 1)} blt
                                        </span>
                                      </div>
                                    ))}
                                    {c.rechazos_total > c.rechazos_culpa && (
                                      <p className="mt-1 border-t border-white/20 pt-1 text-[10px] opacity-70">
                                        + {fmtNum(c.rechazos_total - c.rechazos_culpa)} rechazo(s) por otros motivos (no cuentan para “no pasa”)
                                      </p>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-emerald-600">Pasa</span>
                            )}
                          </TableCell>
                          {/* Salud */}
                          <TableCell>
                            {c.salud === "atencion" ? (
                              <Badge variant="secondary" className="w-fit bg-amber-100 text-amber-700 hover:bg-amber-100">
                                Atención
                                <span className="ml-1 text-[10px] opacity-70">
                                  {[c.drop_bajo ? "drop" : null, c.rmd_bajo ? "RMD" : null].filter(Boolean).join("·")}
                                </span>
                              </Badge>
                            ) : (
                              <span className="text-xs text-emerald-600">Sano</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmtMoneda(c.ingresos_actual)}</TableCell>
                          <TableCell className="text-right">
                            <CrecimientoBadge pct={c.crecimiento_pct} />
                          </TableCell>
                          <TableCell className="text-right text-sm">{fmtNum(c.drop_size, 1)}</TableCell>
                          <TableCell className="text-right text-sm">
                            {c.rmd_prom != null ? (
                              <span className="inline-flex items-center gap-0.5">
                                {fmtNum(c.rmd_prom, 1)}
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => setPlanCliente(c)}>
                              <ClipboardList className="h-4 w-4" /> Plan
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {visibles.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                          Sin clientes para los filtros aplicados.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {filtrados.length > MAX_FILAS && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Mostrando los {MAX_FILAS} de mayor facturación de {fmtNum(filtrados.length)}.
                  Refiná con la búsqueda o los filtros.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialog: crear plan para un cliente */}
      <CrearPlanDialog
        cliente={planCliente}
        onClose={() => setPlanCliente(null)}
        onCreated={async () => {
          setPlanCliente(null)
          await refrescarPlanes()
        }}
      />
    </div>
  )
}

/** Solapa con todos los planes de acción creados desde la clusterización. */
function SolapaPlanes({ planes, onChange }: { planes: ClusterPlan[]; onChange: () => void | Promise<void> }) {
  async function cambiarEstado(id: string, estado: string) {
    await actualizarEstadoPlanCluster(id, estado)
    await onChange()
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Planes de acción ({planes.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Planes creados sobre clientes desde la clusterización. También aparecen en el tablero unificado de planes.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Límite</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planes.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium text-slate-900">
                      {p.nombre_cliente ?? `Cliente ${p.id_cliente}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      #{p.id_cliente}
                      {p.cluster ? ` · ${CLUSTER_LABELS[p.cluster as ClusterId] ?? p.cluster}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-slate-700">{p.descripcion}</TableCell>
                  <TableCell className="text-sm text-slate-600">{p.responsable ?? "—"}</TableCell>
                  <TableCell className="text-sm text-slate-600">{p.fecha_limite ?? "—"}</TableCell>
                  <TableCell>
                    <select
                      value={p.estado}
                      onChange={(e) => cambiarEstado(p.id, e.target.value)}
                      className={`h-8 rounded-md border-0 px-2 text-xs font-medium ${ESTADO_PLAN[p.estado]?.cls ?? ""}`}
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="en_proceso">En proceso</option>
                      <option value="hecho">Hecho</option>
                    </select>
                  </TableCell>
                </TableRow>
              ))}
              {planes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Todavía no hay planes. Creá uno desde el botón “Plan” en la pestaña Clientes.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

/** Diálogo para crear un plan de acción puntual sobre un cliente. */
function CrearPlanDialog({
  cliente, onClose, onCreated,
}: {
  cliente: ClienteClusterizado | null
  onClose: () => void
  onCreated: () => void | Promise<void>
}) {
  const [descripcion, setDescripcion] = useState("")
  const [responsable, setResponsable] = useState("")
  const [fechaLimite, setFechaLimite] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reinicio el form cuando cambia el cliente objetivo.
  const clienteId = cliente?.id_cliente
  const [lastId, setLastId] = useState<number | undefined>(undefined)
  if (clienteId !== lastId) {
    setLastId(clienteId)
    setDescripcion("")
    setResponsable("")
    setFechaLimite("")
    setError(null)
  }

  async function guardar() {
    if (!cliente) return
    if (!descripcion.trim()) {
      setError("Escribí la acción a tomar.")
      return
    }
    setSaving(true)
    setError(null)
    const res = await crearPlanCluster({
      id_cliente: cliente.id_cliente,
      nombre_cliente: cliente.nombre,
      cluster: cliente.cluster,
      estado_cliente: cliente.estado,
      salud_cliente: cliente.salud,
      descripcion,
      responsable,
      fecha_limite: fechaLimite || null,
    })
    setSaving(false)
    if ("error" in res) {
      setError(res.error)
      return
    }
    await onCreated()
  }

  return (
    <Dialog open={cliente !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan de acción</DialogTitle>
        </DialogHeader>
        {cliente && (
          <div className="space-y-3">
            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-900">
                {cliente.nombre ?? `Cliente ${cliente.id_cliente}`}
              </div>
              <div className="text-xs text-muted-foreground">
                #{cliente.id_cliente} · {CLUSTER_LABELS[cliente.cluster]}
                {cliente.estado === "no_pasa" ? " · No pasa" : ""}
                {cliente.salud === "atencion" ? " · Atención" : ""}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Acción a tomar *</label>
              <Textarea
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej.: visitar para acordar pedido mínimo y reducir rechazos…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Responsable</label>
                <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nombre" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Fecha límite</label>
                <Input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>
            <Plus className="h-4 w-4" /> {saving ? "Guardando…" : "Crear plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
