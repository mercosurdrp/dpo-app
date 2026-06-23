"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
} from "lucide-react"
import {
  CLUSTER_LABELS,
  type ClusterId,
  type ClusterizacionData,
} from "@/actions/clusterizacion"

interface Props {
  data: ClusterizacionData
  diasPeriodo: number
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
    desc: "Alto ingreso · creciendo",
  },
  en_crecimiento: {
    color: "#2563EB",
    bg: "bg-blue-50",
    icon: <Sprout className="h-5 w-5" />,
    desc: "Bajo ingreso · creciendo",
  },
  basico: {
    color: "#D97706",
    bg: "bg-amber-50",
    icon: <Box className="h-5 w-5" />,
    desc: "Alto ingreso · sin crecer",
  },
  ventas_bajas: {
    color: "#DC2626",
    bg: "bg-red-50",
    icon: <ArrowDownRight className="h-5 w-5" />,
    desc: "Bajo ingreso · sin crecer",
  },
}

const PERIODOS = [30, 60, 90, 180]

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

const MAX_FILAS = 300

export function ClusterizacionClient({ data, diasPeriodo }: Props) {
  const router = useRouter()
  const [filtroCluster, setFiltroCluster] = useState<ClusterId | "todos">("todos")
  const [busqueda, setBusqueda] = useState("")

  const { periodo, umbral_ingresos, resumen, clientes } = data

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return clientes
      .filter((c) => filtroCluster === "todos" || c.cluster === filtroCluster)
      .filter(
        (c) =>
          q === "" ||
          (c.nombre ?? "").toLowerCase().includes(q) ||
          String(c.id_cliente).includes(q) ||
          (c.localidad ?? "").toLowerCase().includes(q) ||
          (c.promotor ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => b.ingresos_actual - a.ingresos_actual)
  }, [clientes, filtroCluster, busqueda])

  const visibles = filtrados.slice(0, MAX_FILAS)
  const resumenById = (cl: ClusterId) => resumen.find((r) => r.cluster === cl)

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
        {/* Selector de período */}
        <div className="flex items-center gap-1 rounded-lg border bg-white p-1">
          {PERIODOS.map((d) => (
            <button
              key={d}
              onClick={() => router.push(`/planeamiento/clusterizacion?dias=${d}`)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                d === diasPeriodo
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Metodología / estado de fuentes */}
      <Card className="border-l-4 border-l-indigo-400 bg-indigo-50/40">
        <CardContent className="flex gap-3 pt-5 text-sm text-slate-700">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
          <div className="space-y-1">
            <p>
              4 clústeres por el cruce <strong>ingresos × crecimiento</strong>{" "}
              (R4.2.1). Período actual{" "}
              <strong>{periodo.actual_desde}</strong> →{" "}
              <strong>{periodo.actual_hasta}</strong> vs. anterior desde{" "}
              <strong>{periodo.anterior_desde}</strong> ({periodo.dias_periodo}{" "}
              días cada uno). Umbral de ingreso alto/bajo = mediana ={" "}
              <strong>{fmtMoneda(umbral_ingresos)}</strong>.
            </p>
            <p className="text-xs text-muted-foreground">
              Fuentes: ingresos y crecimiento de ventas Chess (netas); RMD
              promedio últimos 6 meses por cliente (cruce R4.2.2 con OTIF/RMD
              pendiente de OTIF por PDV). El{" "}
              <strong>drop size</strong> (bultos/visita) es un{" "}
              <em>proxy del costo de servir</em> que pide el manual — el costo
              logístico real por PDV aún no está disponible.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Matriz 2×2 de clústeres */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          ["ganador", "en_crecimiento", "basico", "ventas_bajas"] as ClusterId[]
        ).map((cl) => {
          const r = resumenById(cl)
          const meta = CLUSTER_META[cl]
          const activo = filtroCluster === cl
          return (
            <button
              key={cl}
              onClick={() => setFiltroCluster(activo ? "todos" : cl)}
              className="text-left"
            >
              <Card
                className={`h-full transition-all hover:shadow-md ${activo ? "ring-2" : ""}`}
                style={{
                  // @ts-expect-error ring color via CSS var
                  "--tw-ring-color": meta.color,
                }}
              >
                <CardContent className={`space-y-3 pt-5 ${meta.bg}`}>
                  <div className="flex items-center justify-between">
                    <div
                      className="rounded-lg p-2"
                      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                    >
                      {meta.icon}
                    </div>
                    <span
                      className="text-2xl font-bold"
                      style={{ color: meta.color }}
                    >
                      {r?.clientes ?? 0}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      {CLUSTER_LABELS[cl]}
                    </p>
                    <p className="text-xs text-muted-foreground">{meta.desc}</p>
                  </div>
                  <div className="space-y-1 border-t pt-2 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>% PDV</span>
                      <span className="font-medium">
                        {fmtPct(r?.pct_clientes ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>% ingresos</span>
                      <span className="font-medium">
                        {fmtPct(r?.pct_ingresos ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Drop size</span>
                      <span className="font-medium">
                        {fmtNum(r?.drop_size_prom ?? 0, 1)} b/vis
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>RMD prom</span>
                      <span className="font-medium">
                        {r?.rmd_prom != null
                          ? `${fmtNum(r.rmd_prom, 2)} ★`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          )
        })}
      </div>

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
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Crec.</TableHead>
                  <TableHead className="text-right">Drop size</TableHead>
                  <TableHead className="text-right">RMD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((c) => {
                  const meta = CLUSTER_META[c.cluster]
                  return (
                    <TableRow key={c.id_cliente}>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {c.nombre ?? `Cliente ${c.id_cliente}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          #{c.id_cliente}
                          {c.promotor ? ` · ${c.promotor}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {c.localidad ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          style={{
                            backgroundColor: `${meta.color}1A`,
                            color: meta.color,
                          }}
                        >
                          {CLUSTER_LABELS[c.cluster]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtMoneda(c.ingresos_actual)}
                      </TableCell>
                      <TableCell className="text-right">
                        <CrecimientoBadge pct={c.crecimiento_pct} />
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {fmtNum(c.drop_size, 1)}
                      </TableCell>
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
                    </TableRow>
                  )
                })}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Sin clientes para los filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filtrados.length > MAX_FILAS && (
            <p className="mt-3 text-xs text-muted-foreground">
              Mostrando los {MAX_FILAS} de mayor ingreso de {fmtNum(filtrados.length)}.
              Refiná con la búsqueda o el filtro de cluster.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
