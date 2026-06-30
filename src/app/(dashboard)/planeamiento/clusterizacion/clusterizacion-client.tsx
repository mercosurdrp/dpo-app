"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
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
  Download,
  LayoutGrid,
  Snowflake,
  Boxes,
  ClipboardCheck,
  FileDown,
} from "lucide-react"
import {
  CLUSTER_LABELS,
  CUADRANTE_LABELS,
  CUBO_META,
  type ClusterId,
  type CuadranteId,
  type CuboId,
  type ClienteClusterizado,
  type ClusterizacionData,
} from "@/actions/clusterizacion-tipos"
import type { Punto3D } from "./diagrama-3d"
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts"
import {
  crearPlanCluster,
  getPlanesCluster,
  actualizarEstadoPlanCluster,
  guardarPlanCubo,
  getPlanesCubo,
  actualizarEstadoPlanCubo,
  type ClusterPlan,
  type ClusterPlanCubo,
} from "@/actions/clusterizacion-planes"

// El gráfico 3D (Three.js/WebGL) se carga solo en el cliente.
const Diagrama3D = dynamic(() => import("./diagrama-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] items-center justify-center text-sm text-muted-foreground">
      Cargando gráfico 3D…
    </div>
  ),
})

interface Props {
  data: ClusterizacionData
  planesIniciales: ClusterPlan[]
  planesCuboIniciales: ClusterPlanCubo[]
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

// Estética de los 4 cuadrantes de la matriz Valor × Costo.
const CUADRANTE_META: Record<
  CuadranteId,
  { color: string; bg: string; desc: string }
> = {
  proteger: { color: "#059669", bg: "bg-emerald-50", desc: "Facturación alta · barato de servir" },
  optimizar: { color: "#D97706", bg: "bg-amber-50", desc: "Facturación alta · caro de servir" },
  mantener: { color: "#2563EB", bg: "bg-blue-50", desc: "Facturación baja · barato de servir" },
  revisar: { color: "#DC2626", bg: "bg-red-50", desc: "Facturación baja · caro de servir" },
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

/** "2026-06-25" → "25/06" */
const fmtFechaCorta = (f: string) => {
  const p = f.split("-")
  return p.length === 3 ? `${p[2]}/${p[1]}` : f
}

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

export function ClusterizacionClient({ data, planesIniciales, planesCuboIniciales }: Props) {
  const [tab, setTab] = useState<"clientes" | "analisis" | "diagrama" | "planes">("clientes")
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
  const [planesCubo, setPlanesCubo] = useState<ClusterPlanCubo[]>(planesCuboIniciales)
  const [planCuboTarget, setPlanCuboTarget] = useState<CuboId | null>(null)

  const { periodo, umbral_ingresos, resumen, clientes } = data

  const refrescarPlanes = async () => setPlanes(await getPlanesCluster())
  const refrescarPlanesCubo = async () => setPlanesCubo(await getPlanesCubo())

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

  // Tarjeta de un cluster (clickeable = filtra). Se ubica en la matriz 2×2.
  const tarjetaCluster = (cl: ClusterId) => {
    const r = resumenById(cl)
    const meta = CLUSTER_META[cl]
    const activo = filtroCluster === cl
    return (
      <button onClick={() => setFiltroCluster(activo ? "todos" : cl)} className="text-left">
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
  }

  const TABS = [
    { k: "clientes" as const, label: "Clientes" },
    { k: "analisis" as const, label: "Análisis Valor×Costo" },
    { k: "diagrama" as const, label: "Diagrama" },
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
        <SolapaPlanes planes={planes} onChange={refrescarPlanes} planesCubo={planesCubo} onChangeCubo={refrescarPlanesCubo} />
      ) : tab === "analisis" ? (
        <SolapaAnalisis data={data} />
      ) : tab === "diagrama" ? (
        <SolapaDiagrama data={data} planesCubo={planesCubo} onPlanCubo={setPlanCuboTarget} />
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

          {/* Matriz 2×2 de clústeres: facturación (alta/baja) × crecimiento */}
          <div className="grid grid-cols-[auto_1fr_1fr] gap-4">
            <div />
            <div className="pb-1 text-center text-xs font-medium text-slate-500">Creciendo</div>
            <div className="pb-1 text-center text-xs font-medium text-slate-500">Sin crecer</div>

            <div className="flex items-center justify-center text-xs font-medium text-slate-500 [writing-mode:vertical-rl] rotate-180">
              Facturación alta
            </div>
            {tarjetaCluster("ganador")}
            {tarjetaCluster("basico")}

            <div className="flex items-center justify-center text-xs font-medium text-slate-500 [writing-mode:vertical-rl] rotate-180">
              Facturación baja
            </div>
            {tarjetaCluster("en_crecimiento")}
            {tarjetaCluster("ventas_bajas")}
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
                      <TableHead className="text-right">Costo/PDV<br />($/HL año)</TableHead>
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
                                    {c.rechazos_detalle.slice(0, 12).map((d, i) => (
                                      <div key={i} className="flex justify-between gap-3 py-0.5">
                                        <span className="opacity-80">{fmtFechaCorta(d.fecha)} · {d.motivo}</span>
                                        <span className="tabular-nums">{fmtNum(d.bultos, 1)} blt</span>
                                      </div>
                                    ))}
                                    {c.rechazos_detalle.length > 12 && (
                                      <p className="text-[10px] opacity-60">+ {c.rechazos_detalle.length - 12} más…</p>
                                    )}
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
                          <TableCell className="text-right text-sm tabular-nums">
                            {c.costo_x_hl_ytd != null ? fmtMoneda(c.costo_x_hl_ytd) : "—"}
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
                        <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
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

      <CrearPlanCuboDialog
        cubo={planCuboTarget}
        planActual={planCuboTarget ? planesCubo.find((p) => p.cubo === planCuboTarget) ?? null : null}
        cantidad={planCuboTarget ? clientes.filter((c) => c.cubo === planCuboTarget).length : 0}
        onClose={() => setPlanCuboTarget(null)}
        onSaved={async () => {
          setPlanCuboTarget(null)
          await refrescarPlanesCubo()
        }}
      />
    </div>
  )
}

/**
 * Solapa "Análisis Valor × Costo": cruza la facturación (alta/baja) con el costo
 * logístico $/HL del año (alto/bajo) en una matriz 2×2, asigna a cada PDV una
 * acción recomendada según su cuadrante y permite bajar los reportes por supervisor.
 */
const CUBOS_ORDEN: CuboId[] = [
  "estrella", "rentable", "motor", "pesado",
  "promesa", "hormiga", "dilema", "critico",
]

const PIE_COLORS = [
  "#4338ca", "#0891b2", "#059669", "#d97706", "#dc2626",
  "#7c3aed", "#db2777", "#0d9488", "#64748b", "#2563eb",
]

/** Cuenta `items` por dimensión y deja top N + "Otros" (para las tortas). */
function topN(
  items: ClienteClusterizado[],
  key: (c: ClienteClusterizado) => string | null,
  n = 6,
): { name: string; value: number }[] {
  const m = new Map<string, number>()
  for (const it of items) {
    const k = (key(it) ?? "(s/d)").trim() || "(s/d)"
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  const arr = [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  if (arr.length <= n) return arr
  const otros = arr.slice(n).reduce((s, x) => s + x.value, 0)
  return [...arr.slice(0, n), { name: "Otros", value: otros }]
}

function PieMini({ titulo, datos }: { titulo: string; datos: { name: string; value: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-60">
          {datos.length === 0 ? (
            <p className="pt-8 text-center text-xs text-muted-foreground">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={datos} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={68}>
                  {datos.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Solapa "Diagrama": cubo 3D (2×2×2) = facturación × costo × crecimiento → 8 tipos
 * de cliente. Se gira/zoomea el gráfico y al clickear (o tocar la leyenda) un cubo
 * se ve la lista de PDV de ese tipo, con 3 tortas (localidad/supervisor/promotor)
 * y filtros por columna.
 */
function SolapaDiagrama({
  data,
  planesCubo,
  onPlanCubo,
}: {
  data: ClusterizacionData
  planesCubo: ClusterPlanCubo[]
  onPlanCubo: (cubo: CuboId) => void
}) {
  const { clientes } = data
  const [sel, setSel] = useState<CuboId | null>(null)
  const planPorCubo = useMemo(() => {
    const m = new Map<string, ClusterPlanCubo>()
    for (const p of planesCubo) m.set(p.cubo, p)
    return m
  }, [planesCubo])
  const descargarPdf = (cubo: CuboId) => {
    window.location.href = `/api/planeamiento/clusterizacion/cubo-pdf?cubo=${cubo}`
  }
  // Filtros por columna del detalle.
  const [fCli, setFCli] = useState("")
  const [fLoc, setFLoc] = useState("todos")
  const [fSup, setFSup] = useState("todos")
  const [fFact, setFFact] = useState("")
  const [fHl, setFHl] = useState("")
  const [fCrec, setFCrec] = useState<"todos" | "crece" | "cae" | "nuevo">("todos")
  const [fRech, setFRech] = useState<"todos" | "pasa" | "no_pasa">("todos")
  const [fFrio, setFFrio] = useState<"todos" | "con" | "sin">("todos")

  // Solo PDV con costo cargado entran al cubo (igual que el Análisis).
  const conCubo = useMemo(() => clientes.filter((c) => c.cubo != null), [clientes])
  const sinCosto = clientes.length - conCubo.length

  const conteo = useMemo(() => {
    const m = {} as Record<CuboId, number>
    for (const id of CUBOS_ORDEN) m[id] = 0
    for (const c of conCubo) m[c.cubo as CuboId] += 1
    return m
  }, [conCubo])

  const puntos: Punto3D[] = CUBOS_ORDEN.map((id) => ({
    id,
    label: CUBO_META[id].label,
    color: CUBO_META[id].color,
    x: CUBO_META[id].x,
    y: CUBO_META[id].y,
    z: CUBO_META[id].z,
    count: conteo[id],
  }))

  // Base = el cubo seleccionado, o TODOS si no hay selección (tortas + tabla).
  const base = useMemo(() => (sel ? conCubo.filter((c) => c.cubo === sel) : conCubo), [conCubo, sel])

  // Tortas (se recalculan con el cubo o el total).
  const pieLoc = useMemo(() => topN(base, (c) => c.localidad), [base])
  const pieSup = useMemo(() => topN(base, (c) => c.supervisor), [base])
  const pieProm = useMemo(() => topN(base, (c) => c.promotor), [base])

  // Opciones de los filtros select (sobre la base).
  const opciones = useMemo(() => {
    const loc = new Set<string>(), sup = new Set<string>()
    for (const c of base) {
      if (c.localidad) loc.add(c.localidad)
      if (c.supervisor) sup.add(c.supervisor)
    }
    const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b))
    return { localidades: ord(loc), supervisores: ord(sup) }
  }, [base])

  const lista = useMemo(() => {
    const cli = fCli.trim().toLowerCase()
    const factMin = parseFloat(fFact)
    const hlMin = parseFloat(fHl)
    return base
      .filter(
        (c) =>
          cli === "" ||
          (c.nombre ?? "").toLowerCase().includes(cli) ||
          String(c.id_cliente).includes(cli) ||
          (c.promotor ?? "").toLowerCase().includes(cli),
      )
      .filter((c) => fLoc === "todos" || c.localidad === fLoc)
      .filter((c) => fSup === "todos" || c.supervisor === fSup)
      .filter((c) => isNaN(factMin) || c.ingresos_actual >= factMin)
      .filter((c) => isNaN(hlMin) || (c.costo_x_hl_ytd ?? 0) >= hlMin)
      .filter((c) =>
        fCrec === "todos"
          ? true
          : fCrec === "nuevo"
            ? c.crecimiento_pct === null
            : fCrec === "crece"
              ? c.crecimiento_pct !== null && c.crecimiento_pct >= 0
              : c.crecimiento_pct !== null && c.crecimiento_pct < 0,
      )
      .filter((c) => fRech === "todos" || c.estado === fRech)
      .filter((c) => fFrio === "todos" || (fFrio === "con" ? c.equipos_frio_n > 0 : c.equipos_frio_n === 0))
      .sort((a, b) => b.ingresos_actual - a.ingresos_actual)
  }, [base, fCli, fLoc, fSup, fFact, fHl, fCrec, fRech, fFrio])

  const visibles = lista.slice(0, MAX_FILAS)

  return (
    <>
      {/* Metodología */}
      <Card className="border-l-4 border-l-indigo-400 bg-indigo-50/40">
        <CardContent className="flex gap-3 pt-5 text-sm text-slate-700">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
          <div className="space-y-1">
            <p>
              Diagrama <strong>2×2×2</strong>: cruza <strong>facturación</strong> (alta/baja),{" "}
              <strong>costo $/HL</strong> (mayor/menor a la mediana) y <strong>crecimiento</strong>{" "}
              (vs. YTD anterior) → <strong>8 tipos de cliente</strong>. Girá el gráfico con el mouse
              y hacé clic en un cubo (o en la leyenda) para ver sus PDV.
            </p>
            {sinCosto > 0 && (
              <p className="text-xs text-muted-foreground">
                {fmtNum(sinCosto)} PDV sin costo cargado quedan fuera del diagrama.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gráfico 3D */}
      <Card>
        <CardContent className="pt-4">
          <Diagrama3D puntos={puntos} selected={sel} onSelect={(id) => setSel((p) => (p === id ? null : id))} />
        </CardContent>
      </Card>

      {/* Leyenda / selector de los 8 cubos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CUBOS_ORDEN.map((id) => {
          const meta = CUBO_META[id]
          const activo = sel === id
          const plan = planPorCubo.get(id)
          return (
            <div
              key={id}
              role="button"
              tabIndex={0}
              onClick={() => setSel(activo ? null : id)}
              onKeyDown={(e) => { if (e.key === "Enter") setSel(activo ? null : id) }}
              className="cursor-pointer text-left"
            >
              <Card className={`relative h-full transition-all hover:shadow-md ${activo ? "ring-2" : ""}`} style={{
                // @ts-expect-error ring color via CSS var
                "--tw-ring-color": meta.color,
              }}>
                <CardContent className="space-y-1 pt-4 pb-9">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold" style={{ color: meta.color }}>
                      <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="text-xl font-bold" style={{ color: meta.color }}>{conteo[id]}</span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">{meta.combo}</p>
                  <p className="text-xs text-muted-foreground">{meta.jugada}</p>
                  {plan && (
                    <p className="flex items-center gap-1 pt-0.5 text-[11px] text-emerald-700" title={plan.descripcion}>
                      <ClipboardCheck className="h-3 w-3" /> <span className="truncate">{plan.descripcion}</span>
                    </p>
                  )}
                </CardContent>
                {/* Cargar/editar plan de acción del cubo completo (abajo a la derecha) */}
                <button
                  onClick={(e) => { e.stopPropagation(); onPlanCubo(id) }}
                  title={plan ? "Editar plan de acción del cubo" : "Cargar plan de acción del cubo"}
                  className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full border text-slate-600 hover:bg-slate-100"
                  style={plan ? { backgroundColor: `${meta.color}1A`, color: meta.color, borderColor: "transparent" } : undefined}
                >
                  {plan ? <ClipboardCheck className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </button>
              </Card>
            </div>
          )
        })}
      </div>

      {/* Tortas: localidad / supervisor / promotor (cubo o total) */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">
            Distribución {sel ? `· ${CUBO_META[sel].label}` : "· Todos"} ({fmtNum(base.length)} PDV)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-3">
            <PieMini titulo="Por localidad" datos={pieLoc} />
            <PieMini titulo="Por supervisor" datos={pieSup} />
            <PieMini titulo="Por promotor" datos={pieProm} />
          </div>
        </CardContent>
      </Card>

      {/* Detalle de clientes con filtros por columna */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Boxes className="h-4 w-4 text-indigo-500" />
            {sel ? CUBO_META[sel].label : "Todos los PDV"}
            <Badge
              className="ml-1"
              style={sel ? { backgroundColor: `${CUBO_META[sel].color}22`, color: CUBO_META[sel].color } : undefined}
            >
              {fmtNum(lista.length)} PDV
            </Badge>
            {sel && <span className="text-xs font-normal text-slate-500">{CUBO_META[sel].combo}</span>}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {sel && (
              <>
                <Button variant="outline" size="sm" onClick={() => onPlanCubo(sel)}>
                  {planPorCubo.get(sel) ? <ClipboardCheck className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {planPorCubo.get(sel) ? "Editar plan del cubo" : "Plan del cubo"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => descargarPdf(sel)}>
                  <FileDown className="h-4 w-4" /> Descargar PDF
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFCli(""); setFLoc("todos"); setFSup("todos"); setFFact(""); setFHl(""); setFCrec("todos"); setFRech("todos"); setFFrio("todos")
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sel && <p className="mb-3 text-sm text-slate-600">{CUBO_META[sel].jugada}</p>}
          {sel && planPorCubo.get(sel) && (
            <div className="mb-3 rounded-md border-l-4 border-l-emerald-400 bg-emerald-50/60 p-3 text-sm">
              <p className="flex items-center gap-1 font-semibold text-emerald-800">
                <ClipboardCheck className="h-4 w-4" /> Plan de acción del cubo (aplica a todos los PDV)
              </p>
              <p className="mt-1 text-slate-700">{planPorCubo.get(sel)!.descripcion}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {planPorCubo.get(sel)!.responsable ? `Responsable: ${planPorCubo.get(sel)!.responsable} · ` : ""}
                {planPorCubo.get(sel)!.fecha_limite ? `Límite: ${planPorCubo.get(sel)!.fecha_limite} · ` : ""}
                Estado: {planPorCubo.get(sel)!.estado}
              </p>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Localidad</TableHead>
                  <TableHead>Supervisor</TableHead>
                  <TableHead className="text-right">Facturación YTD</TableHead>
                  <TableHead className="text-right">$/HL año</TableHead>
                  <TableHead className="text-right">Crec.</TableHead>
                  <TableHead>Rechazo (45 d)</TableHead>
                  <TableHead>Equipo frío</TableHead>
                </TableRow>
                <TableRow className="align-top">
                  <TableHead className="py-1">
                    <input value={fCli} onChange={(e) => setFCli(e.target.value)} placeholder="nombre / ID"
                      className="h-7 w-full rounded border border-input bg-background px-1 text-xs" />
                  </TableHead>
                  <TableHead className="py-1">
                    <select value={fLoc} onChange={(e) => setFLoc(e.target.value)}
                      className="h-7 w-full rounded border border-input bg-background px-1 text-xs">
                      <option value="todos">Todas</option>
                      {opciones.localidades.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </TableHead>
                  <TableHead className="py-1">
                    <select value={fSup} onChange={(e) => setFSup(e.target.value)}
                      className="h-7 w-full rounded border border-input bg-background px-1 text-xs">
                      <option value="todos">Todos</option>
                      {opciones.supervisores.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </TableHead>
                  <TableHead className="py-1">
                    <input value={fFact} onChange={(e) => setFFact(e.target.value)} type="number" placeholder="≥"
                      className="h-7 w-20 rounded border border-input bg-background px-1 text-right text-xs" />
                  </TableHead>
                  <TableHead className="py-1">
                    <input value={fHl} onChange={(e) => setFHl(e.target.value)} type="number" placeholder="≥"
                      className="h-7 w-16 rounded border border-input bg-background px-1 text-right text-xs" />
                  </TableHead>
                  <TableHead className="py-1">
                    <select value={fCrec} onChange={(e) => setFCrec(e.target.value as typeof fCrec)}
                      className="h-7 w-full rounded border border-input bg-background px-1 text-xs">
                      <option value="todos">Todos</option>
                      <option value="crece">Crece</option>
                      <option value="cae">Cae</option>
                      <option value="nuevo">Nuevo</option>
                    </select>
                  </TableHead>
                  <TableHead className="py-1">
                    <select value={fRech} onChange={(e) => setFRech(e.target.value as typeof fRech)}
                      className="h-7 w-full rounded border border-input bg-background px-1 text-xs">
                      <option value="todos">Todos</option>
                      <option value="no_pasa">No pasa</option>
                      <option value="pasa">Pasa</option>
                    </select>
                  </TableHead>
                  <TableHead className="py-1">
                    <select value={fFrio} onChange={(e) => setFFrio(e.target.value as typeof fFrio)}
                      className="h-7 w-full rounded border border-input bg-background px-1 text-xs">
                      <option value="todos">Todos</option>
                      <option value="con">Con</option>
                      <option value="sin">Sin</option>
                    </select>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((c) => (
                  <TableRow key={c.id_cliente}>
                    <TableCell className="max-w-[200px]">
                      <div className="truncate font-medium text-slate-900" title={c.nombre ?? undefined}>
                        {c.nombre ?? `Cliente ${c.id_cliente}`}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        #{c.id_cliente}
                        {c.promotor ? ` · ${c.promotor}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-sm text-slate-600" title={c.localidad ?? undefined}>
                      {c.localidad ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{c.supervisor ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoneda(c.ingresos_actual)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {c.costo_x_hl_ytd != null ? fmtMoneda(c.costo_x_hl_ytd) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <CrecimientoBadge pct={c.crecimiento_pct} />
                    </TableCell>
                    <TableCell>
                      {c.estado === "no_pasa" ? (
                        <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100">
                          No pasa <span className="ml-1 text-[10px] opacity-70">{fmtNum(c.rechazos_culpa)}</span>
                        </Badge>
                      ) : (
                        <span className="text-xs text-emerald-600">Pasa</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.equipos_frio_n > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700" title={c.equipos_frio_tipos ?? undefined}>
                          <Snowflake className="h-3.5 w-3.5 text-sky-500" />
                          {c.equipos_frio_n}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Sin PDV para los filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {lista.length > MAX_FILAS && (
            <p className="mt-3 text-xs text-muted-foreground">
              Mostrando los {MAX_FILAS} de mayor facturación de {fmtNum(lista.length)}.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function SolapaAnalisis({ data }: { data: ClusterizacionData }) {
  const { clientes, umbral_ingresos, umbral_costo } = data
  const [cuad, setCuad] = useState<CuadranteId | "todos">("todos")
  const [q, setQ] = useState("")
  const [fLocalidad, setFLocalidad] = useState("todos")
  const [fPromotor, setFPromotor] = useState("todos")
  const [fSupervisor, setFSupervisor] = useState("todos")
  const [fEstado, setFEstado] = useState<"todos" | "pasa" | "no_pasa">("todos")
  const [fFrio, setFFrio] = useState<"todos" | "con" | "sin">("todos")
  const [bajando, setBajando] = useState(false)

  // Solo los PDV con costo cargado (cuadrante != null) entran a la matriz.
  const conCuadrante = useMemo(() => clientes.filter((c) => c.cuadrante != null), [clientes])
  const sinCosto = clientes.length - conCuadrante.length

  const opciones = useMemo(() => {
    const loc = new Set<string>(), prom = new Set<string>(), sup = new Set<string>()
    for (const c of conCuadrante) {
      if (c.localidad) loc.add(c.localidad)
      if (c.promotor) prom.add(c.promotor)
      if (c.supervisor) sup.add(c.supervisor)
    }
    const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b))
    return { localidades: ord(loc), promotores: ord(prom), supervisores: ord(sup) }
  }, [conCuadrante])

  const resumen = useMemo(() => {
    const m: Record<CuadranteId, { n: number; fact: number }> = {
      proteger: { n: 0, fact: 0 },
      optimizar: { n: 0, fact: 0 },
      mantener: { n: 0, fact: 0 },
      revisar: { n: 0, fact: 0 },
    }
    for (const c of conCuadrante) {
      const k = c.cuadrante as CuadranteId
      m[k].n += 1
      m[k].fact += c.ingresos_actual
    }
    return m
  }, [conCuadrante])

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return conCuadrante
      .filter((c) => cuad === "todos" || c.cuadrante === cuad)
      .filter((c) => fLocalidad === "todos" || c.localidad === fLocalidad)
      .filter((c) => fPromotor === "todos" || c.promotor === fPromotor)
      .filter((c) => fSupervisor === "todos" || c.supervisor === fSupervisor)
      .filter((c) => fEstado === "todos" || c.estado === fEstado)
      .filter(
        (c) =>
          fFrio === "todos" ||
          (fFrio === "con" ? c.equipos_frio_n > 0 : c.equipos_frio_n === 0),
      )
      .filter(
        (c) =>
          t === "" ||
          (c.nombre ?? "").toLowerCase().includes(t) ||
          String(c.id_cliente).includes(t) ||
          (c.supervisor ?? "").toLowerCase().includes(t) ||
          (c.localidad ?? "").toLowerCase().includes(t) ||
          (c.promotor ?? "").toLowerCase().includes(t),
      )
      .sort((a, b) => b.ingresos_actual - a.ingresos_actual)
  }, [conCuadrante, cuad, q, fLocalidad, fPromotor, fSupervisor, fEstado, fFrio])

  const visibles = filtrados.slice(0, MAX_FILAS)

  const descargar = () => {
    setBajando(true)
    // El PDF respeta el cuadrante y los filtros que están en pantalla.
    const p = new URLSearchParams()
    if (cuad !== "todos") p.set("cuad", cuad)
    if (fLocalidad !== "todos") p.set("localidad", fLocalidad)
    if (fPromotor !== "todos") p.set("promotor", fPromotor)
    if (fSupervisor !== "todos") p.set("supervisor", fSupervisor)
    if (fEstado !== "todos") p.set("estado", fEstado)
    if (fFrio !== "todos") p.set("frio", fFrio)
    if (q.trim()) p.set("q", q.trim())
    const qs = p.toString()
    window.location.href = `/api/planeamiento/clusterizacion/pdf${qs ? `?${qs}` : ""}`
    // El navegador dispara la descarga (Content-Disposition); reactivo el botón.
    setTimeout(() => setBajando(false), 4000)
  }

  const celda = (id: CuadranteId) => {
    const meta = CUADRANTE_META[id]
    const r = resumen[id]
    const activo = cuad === id
    return (
      <button onClick={() => setCuad(activo ? "todos" : id)} className="text-left">
        <Card
          className={`h-full transition-all hover:shadow-md ${activo ? "ring-2" : ""}`}
          style={{
            // @ts-expect-error ring color via CSS var
            "--tw-ring-color": meta.color,
          }}
        >
          <CardContent className={`space-y-2 pt-4 ${meta.bg}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: meta.color }}>
                {CUADRANTE_LABELS[id]}
              </p>
              <span className="text-2xl font-bold" style={{ color: meta.color }}>
                {r.n}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{meta.desc}</p>
            <div className="flex justify-between border-t pt-1 text-xs text-slate-600">
              <span>Facturación</span>
              <span className="font-medium">{fmtMoneda(r.fact)}</span>
            </div>
          </CardContent>
        </Card>
      </button>
    )
  }

  return (
    <>
      {/* Metodología */}
      <Card className="border-l-4 border-l-indigo-400 bg-indigo-50/40">
        <CardContent className="flex gap-3 pt-5 text-sm text-slate-700">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
          <div className="space-y-1">
            <p>
              Matriz <strong>Valor × Costo</strong>: cruza la <strong>facturación YTD</strong>{" "}
              (alta/baja, corte = mediana <strong>{fmtMoneda(umbral_ingresos)}</strong>) con el{" "}
              <strong>costo logístico $/HL del año</strong> (alto/bajo, corte = mediana{" "}
              <strong>{fmtMoneda(umbral_costo)}</strong>). Cada cuadrante tiene una acción recomendada.
            </p>
            <p className="text-xs text-muted-foreground">
              Filtrá el cuadrante por localidad, promotor, supervisor o rechazo.{" "}
              <strong>Rechazo (45 d)</strong>: <strong className="text-red-600">No pasa</strong> = rechazó ≥ 1 entrega
              por su culpa (sin dinero / cerrado / sin envases) en los últimos 45 días.
            </p>
            {sinCosto > 0 && (
              <p className="text-xs text-muted-foreground">
                {fmtNum(sinCosto)} PDV sin costo cargado quedan fuera de la matriz.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Matriz 2×2 con ejes */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
            <div />
            <div className="pb-1 text-center text-xs font-medium text-slate-500">$/HL bajo · barato de servir</div>
            <div className="pb-1 text-center text-xs font-medium text-slate-500">$/HL alto · caro de servir</div>

            <div className="flex items-center justify-center text-xs font-medium text-slate-500 [writing-mode:vertical-rl] rotate-180">
              Facturación alta
            </div>
            {celda("proteger")}
            {celda("optimizar")}

            <div className="flex items-center justify-center text-xs font-medium text-slate-500 [writing-mode:vertical-rl] rotate-180">
              Facturación baja
            </div>
            {celda("mantener")}
            {celda("revisar")}
          </div>
        </CardContent>
      </Card>

      {/* Filtros del listado (dentro del cuadrante seleccionado) */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SelectFiltro label="Localidad" value={fLocalidad} onChange={setFLocalidad} opciones={opciones.localidades} />
            <SelectFiltro label="Promotor" value={fPromotor} onChange={setFPromotor} opciones={opciones.promotores} />
            <SelectFiltro label="Supervisor" value={fSupervisor} onChange={setFSupervisor} opciones={opciones.supervisores} />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Rechazo (45 días)</label>
              <select
                value={fEstado}
                onChange={(e) => setFEstado(e.target.value as "todos" | "pasa" | "no_pasa")}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="no_pasa">Solo rechazan (No pasa)</option>
                <option value="pasa">Sin rechazos (Pasa)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Equipo de frío</label>
              <select
                value={fFrio}
                onChange={(e) => setFFrio(e.target.value as "todos" | "con" | "sin")}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="con">Con equipo de frío</option>
                <option value="sin">Sin equipo de frío</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla con acción recomendada + export */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutGrid className="h-4 w-4 text-indigo-500" />
            PDV ({fmtNum(filtrados.length)})
            {cuad !== "todos" && (
              <Badge
                className="ml-1"
                style={{ backgroundColor: `${CUADRANTE_META[cuad].color}22`, color: CUADRANTE_META[cuad].color }}
              >
                {CUADRANTE_LABELS[cuad]}
              </Badge>
            )}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por cliente, ID, localidad, promotor…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-xs"
            />
            <Button variant="outline" onClick={descargar} disabled={bajando}>
              <Download className="h-4 w-4" /> {bajando ? "Generando…" : "Descargar PDF"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Localidad</TableHead>
                  <TableHead>Cluster</TableHead>
                  <TableHead className="text-right">Facturación YTD</TableHead>
                  <TableHead className="text-right">$/HL año</TableHead>
                  <TableHead>Rechazo (45 d)</TableHead>
                  <TableHead>Equipo frío</TableHead>
                  <TableHead>Acción recomendada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((c) => {
                  const meta = c.cuadrante ? CUADRANTE_META[c.cuadrante] : null
                  return (
                    <TableRow key={c.id_cliente}>
                      <TableCell className="max-w-[200px]">
                        <div className="truncate font-medium text-slate-900" title={c.nombre ?? undefined}>
                          {c.nombre ?? `Cliente ${c.id_cliente}`}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          #{c.id_cliente}
                          {c.promotor ? ` · ${c.promotor}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-sm text-slate-600" title={c.localidad ?? undefined}>
                        {c.localidad ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          style={{
                            backgroundColor: `${CLUSTER_META[c.cluster].color}1A`,
                            color: CLUSTER_META[c.cluster].color,
                          }}
                        >
                          {CLUSTER_LABELS[c.cluster]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmtMoneda(c.ingresos_actual)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {c.costo_x_hl_ytd != null ? fmtMoneda(c.costo_x_hl_ytd) : "—"}
                      </TableCell>
                      {/* Rechazo (criterio 45 días: solo culpa del cliente) */}
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
                                {c.rechazos_detalle.slice(0, 12).map((d, i) => (
                                  <div key={i} className="flex justify-between gap-3 py-0.5">
                                    <span className="opacity-80">{fmtFechaCorta(d.fecha)} · {d.motivo}</span>
                                    <span className="tabular-nums">{fmtNum(d.bultos, 1)} blt</span>
                                  </div>
                                ))}
                                {c.rechazos_detalle.length > 12 && (
                                  <p className="text-[10px] opacity-60">+ {c.rechazos_detalle.length - 12} más…</p>
                                )}
                                {c.rechazos_total > c.rechazos_culpa && (
                                  <p className="mt-1 border-t border-white/20 pt-1 text-[10px] opacity-70">
                                    + {fmtNum(c.rechazos_total - c.rechazos_culpa)} rechazo(s) por otros motivos (no cuentan)
                                  </p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-emerald-600">Pasa</span>
                        )}
                      </TableCell>
                      {/* Equipo de frío (EDF instalados en comodato) */}
                      <TableCell>
                        {c.equipos_frio_n > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium text-sky-700"
                            title={c.equipos_frio_tipos ?? undefined}
                          >
                            <Snowflake className="h-3.5 w-3.5 text-sky-500" />
                            {c.equipos_frio_n}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {meta && c.cuadrante ? (
                          <Badge
                            variant="secondary"
                            style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
                          >
                            {CUADRANTE_LABELS[c.cuadrante]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Sin PDV con costo cargado para los filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filtrados.length > MAX_FILAS && (
            <p className="mt-3 text-xs text-muted-foreground">
              Mostrando los {MAX_FILAS} de mayor facturación de {fmtNum(filtrados.length)}. El PDF respeta los filtros aplicados.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/** Solapa con todos los planes de acción creados desde la clusterización. */
function SolapaPlanes({
  planes,
  onChange,
  planesCubo,
  onChangeCubo,
}: {
  planes: ClusterPlan[]
  onChange: () => void | Promise<void>
  planesCubo: ClusterPlanCubo[]
  onChangeCubo: () => void | Promise<void>
}) {
  async function cambiarEstado(id: string, estado: string) {
    await actualizarEstadoPlanCluster(id, estado)
    await onChange()
  }
  async function cambiarEstadoCubo(cubo: string, estado: string) {
    await actualizarEstadoPlanCubo(cubo, estado)
    await onChangeCubo()
  }
  return (
    <div className="space-y-4">
      {/* Planes por cubo (grupales) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planes por cubo ({planesCubo.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Plan de acción que aplica a TODOS los PDV de un cubo del diagrama 3D. Se cargan/editan desde la solapa Diagrama.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cubo</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Límite</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planesCubo.map((p) => {
                  const meta = CUBO_META[p.cubo as CuboId]
                  return (
                    <TableRow key={p.cubo}>
                      <TableCell>
                        <div className="font-medium" style={{ color: meta?.color }}>{meta?.label ?? p.cubo}</div>
                        <div className="text-xs text-muted-foreground">{meta?.combo ?? ""}</div>
                      </TableCell>
                      <TableCell className="max-w-md text-sm text-slate-700">{p.descripcion}</TableCell>
                      <TableCell className="text-sm text-slate-600">{p.responsable ?? "—"}</TableCell>
                      <TableCell className="text-sm text-slate-600">{p.fecha_limite ?? "—"}</TableCell>
                      <TableCell>
                        <select
                          value={p.estado}
                          onChange={(e) => cambiarEstadoCubo(p.cubo, e.target.value)}
                          className={`h-8 rounded-md border-0 px-2 text-xs font-medium ${ESTADO_PLAN[p.estado]?.cls ?? ""}`}
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="en_proceso">En proceso</option>
                          <option value="hecho">Hecho</option>
                        </select>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {planesCubo.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Todavía no hay planes por cubo. Cargá uno con el botón “+” en las tarjetas de la solapa Diagrama.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Planes puntuales (por cliente) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planes puntuales ({planes.length})</CardTitle>
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
    </div>
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

/** Diálogo para cargar/editar el plan de acción AGRUPADO de un cubo (uno por cubo). */
function CrearPlanCuboDialog({
  cubo, planActual, cantidad, onClose, onSaved,
}: {
  cubo: CuboId | null
  planActual: ClusterPlanCubo | null
  cantidad: number
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [descripcion, setDescripcion] = useState("")
  const [responsable, setResponsable] = useState("")
  const [fechaLimite, setFechaLimite] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reinicio/precargo el form cuando cambia el cubo objetivo.
  const [lastCubo, setLastCubo] = useState<CuboId | null>(null)
  if (cubo !== lastCubo) {
    setLastCubo(cubo)
    setDescripcion(planActual?.descripcion ?? "")
    setResponsable(planActual?.responsable ?? "")
    setFechaLimite(planActual?.fecha_limite ?? "")
    setError(null)
  }

  async function guardar() {
    if (!cubo) return
    if (!descripcion.trim()) {
      setError("Escribí la acción a tomar.")
      return
    }
    setSaving(true)
    setError(null)
    const res = await guardarPlanCubo({
      cubo,
      descripcion,
      responsable,
      fecha_limite: fechaLimite || null,
    })
    setSaving(false)
    if ("error" in res) {
      setError(res.error)
      return
    }
    await onSaved()
  }

  const meta = cubo ? CUBO_META[cubo] : null

  return (
    <Dialog open={cubo !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan de acción del cubo</DialogTitle>
        </DialogHeader>
        {meta && (
          <div className="space-y-3">
            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <div className="font-medium" style={{ color: meta.color }}>{meta.label}</div>
              <div className="text-xs text-muted-foreground">{meta.combo} · {fmtNum(cantidad)} PDV</div>
              <div className="mt-1 text-xs text-slate-600">{meta.jugada}</div>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta acción aplica a <strong>todos</strong> los PDV del cubo y se incluye en el PDF del listado.
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Acción a tomar *</label>
              <Textarea
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej.: subir frecuencia de visita y empujar combos de alta rotación…"
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
            <Plus className="h-4 w-4" /> {saving ? "Guardando…" : planActual ? "Guardar cambios" : "Crear plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
