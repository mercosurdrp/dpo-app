"use client"

import { useMemo, useState } from "react"
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
} from "@/actions/clusterizacion-tipos"

interface Props {
  data: ClusterizacionData
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

export function ClusterizacionClient({ data }: Props) {
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
        {/* Encuadre YTD (acumulado del año) */}
        <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
          Encuadre YTD · {periodo.ytd_desde} → {periodo.ytd_hasta}
        </Badge>
      </div>

      {/* Metodología / estado de fuentes */}
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
              error interno (preventa, distribución, stock…) no cuentan.{" "}
              <strong>Salud</strong> (costo de servir):{" "}
              <strong className="text-amber-600">Atención</strong> = drop bajo (&lt; 3 b/vis, últimos 45 días)
              o RMD bajo (&lt; 4,5, últimos 6 meses); si no, <strong className="text-emerald-600">Sano</strong>.
              Se ocultan los clientes sin compras en los últimos 45 días (drop 0).
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
                      <span>% facturación</span>
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
                  <TableHead className="text-right">Facturación YTD</TableHead>
                  <TableHead className="text-right">Crec.</TableHead>
                  <TableHead className="text-right">Drop size</TableHead>
                  <TableHead className="text-right">RMD</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                  <TableHead className="text-right">Salud</TableHead>
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
                      {/* ESTADO: pasa / no pasa (responsabilidad del cliente) */}
                      <TableCell className="text-right text-sm">
                        {c.estado === "no_pasa" ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100">
                              No pasa
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {fmtNum(c.rechazos_culpa)} rech.
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-600">Pasa</span>
                        )}
                      </TableCell>
                      {/* SALUD: sano / atención (costo de servir) */}
                      <TableCell className="text-right text-sm">
                        {c.salud === "atencion" ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                              Atención
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {[c.drop_bajo ? "drop bajo" : null, c.rmd_bajo ? "RMD bajo" : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-600">Sano</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
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
              Mostrando los {MAX_FILAS} de mayor facturación de {fmtNum(filtrados.length)}.
              Refiná con la búsqueda o el filtro de cluster.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
