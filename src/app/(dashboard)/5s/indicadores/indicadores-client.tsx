"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Truck,
  Warehouse,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  AlertTriangle,
  ClipboardList,
  Loader2,
} from "lucide-react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getS5KpisMes,
  getS5TendenciaMensual,
  getS5Ranking,
  getS5TopItemsCriticos,
} from "@/actions/s5"
import {
  S5_CATEGORIA_LABELS,
  type S5Tipo,
  type S5KpisMes,
  type S5TendenciaMes,
  type S5RankingRow,
  type S5ItemCriticoRow,
} from "@/types/database"

const MESES_LARGOS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

// Paleta de severidad
function severityColor(pct: number | null): string {
  if (pct === null || pct === undefined) return "#94A3B8"
  if (pct < 70) return "#EF4444"
  if (pct < 85) return "#F59E0B"
  return "#10B981"
}

function severityTextClass(pct: number | null): string {
  if (pct === null || pct === undefined) return "text-slate-500"
  if (pct < 70) return "text-red-600"
  if (pct < 85) return "text-amber-600"
  return "text-emerald-600"
}

function severityBgClass(pct: number | null): string {
  if (pct === null || pct === undefined) return "bg-slate-100"
  if (pct < 70) return "bg-red-100"
  if (pct < 85) return "bg-amber-100"
  return "bg-emerald-100"
}

function addMonths(periodo: string, delta: number): string {
  const [y, m] = periodo.split("-").map((n) => parseInt(n, 10))
  const d = new Date(y, m - 1 + delta, 1)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${yy}-${mm}-01`
}

function formatMesLargo(periodo: string): string {
  const [y, m] = periodo.split("-").map((n) => parseInt(n, 10))
  return `${MESES_LARGOS[m - 1]} ${y}`
}

function buildUltimosMeses(base: string, n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(addMonths(base, -i))
  return out
}

const CATEGORIA_COLORES: Record<string, string> = {
  organizacion: "#3B82F6",
  orden: "#8B5CF6",
  limpieza: "#10B981",
  estandarizacion: "#F59E0B",
  disciplina: "#EF4444",
}

export function IndicadoresClient({
  tipoInicial,
  periodoInicial,
  kpisInicial,
  tendenciaInicial,
  rankingInicial,
  criticosInicial,
}: {
  tipoInicial: S5Tipo
  periodoInicial: string
  kpisInicial: S5KpisMes | null
  tendenciaInicial: S5TendenciaMes[]
  rankingInicial: S5RankingRow[]
  criticosInicial: S5ItemCriticoRow[]
}) {
  const [tipo, setTipo] = useState<S5Tipo>(tipoInicial)
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [kpis, setKpis] = useState<S5KpisMes | null>(kpisInicial)
  const [tendencia, setTendencia] = useState(tendenciaInicial)
  const [ranking, setRanking] = useState(rankingInicial)
  const [criticos, setCriticos] = useState(criticosInicial)
  const [isPending, startTransition] = useTransition()

  // Últimos 12 meses desde "hoy" (periodoInicial)
  const opcionesMes = useMemo(
    () => buildUltimosMeses(periodoInicial, 12),
    [periodoInicial]
  )
  const opcionesMesItems = useMemo(() => {
    const o: Record<string, string> = {}
    for (const p of opcionesMes) o[p] = formatMesLargo(p)
    return o
  }, [opcionesMes])

  const esMesActual = periodo === periodoInicial
  const esMesMasAntiguo = periodo === opcionesMes[opcionesMes.length - 1]

  function recargar(nuevoTipo: S5Tipo, nuevoPeriodo: string) {
    startTransition(async () => {
      const [k, t, r, c] = await Promise.all([
        getS5KpisMes(nuevoTipo, nuevoPeriodo),
        getS5TendenciaMensual(nuevoTipo, nuevoPeriodo, 12),
        getS5Ranking(nuevoTipo, nuevoPeriodo),
        getS5TopItemsCriticos(nuevoTipo, nuevoPeriodo, 5),
      ])
      if ("data" in k) setKpis(k.data)
      else setKpis(null)
      if ("data" in t) setTendencia(t.data)
      if ("data" in r) setRanking(r.data)
      if ("data" in c) setCriticos(c.data)
    })
  }

  function cambiarMes(delta: number) {
    const nuevo = addMonths(periodo, delta)
    if (!opcionesMes.includes(nuevo)) return
    setPeriodo(nuevo)
    recargar(tipo, nuevo)
  }

  function cambiarTipo(nuevo: string) {
    const t = (nuevo === "almacen" ? "almacen" : "flota") as S5Tipo
    if (t === tipo) return
    setTipo(t)
    recargar(t, periodo)
  }

  // Delta vs mes anterior
  const delta =
    kpis && kpis.promedio_nota !== null && kpis.promedio_mes_anterior !== null
      ? Number((kpis.promedio_nota - kpis.promedio_mes_anterior).toFixed(1))
      : null

  // Tendencia data para chart
  const tendenciaChartData = tendencia.map((t) => ({
    name: t.mes_label,
    Organización: t.organizacion,
    Orden: t.orden,
    Limpieza: t.limpieza,
    Estandarización: t.estandarizacion,
    Disciplina: t.disciplina,
  }))

  // Ranking top 10
  const rankingTop = ranking.slice(0, 10)
  const rankingChartData = rankingTop.map((r) => ({
    nombre: r.nombre,
    nota_total: Number(r.nota_total.toFixed(1)),
  }))

  return (
    <div className="space-y-5">
      {/* Header sticky */}
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 bg-background/95 backdrop-blur px-4 md:px-6 py-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-5 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-900">
              Indicadores 5S
            </h1>
            {isPending && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Selector de mes */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => cambiarMes(-1)}
                disabled={isPending || esMesMasAntiguo}
                aria-label="Mes anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Select
                value={periodo}
                onValueChange={(v) => {
                  if (!v) return
                  setPeriodo(v)
                  recargar(tipo, v)
                }}
                disabled={isPending}
                items={opcionesMesItems}
              >
                <SelectTrigger className="min-w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opcionesMes.map((p) => (
                    <SelectItem key={p} value={p} label={formatMesLargo(p)}>
                      {formatMesLargo(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cambiarMes(1)}
                disabled={isPending || esMesActual}
                aria-label="Mes siguiente"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            {/* Selector de tipo */}
            <Tabs value={tipo} onValueChange={cambiarTipo}>
              <TabsList>
                <TabsTrigger value="flota">
                  <Truck className="mr-1.5 size-4" />
                  Flota
                </TabsTrigger>
                <TabsTrigger value="almacen">
                  <Warehouse className="mr-1.5 size-4" />
                  Almacén
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1 - Promedio general */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Promedio general
                </p>
                <p
                  className={`mt-1 text-3xl font-bold ${severityTextClass(
                    kpis?.promedio_nota ?? null
                  )}`}
                >
                  {kpis?.promedio_nota !== null &&
                  kpis?.promedio_nota !== undefined
                    ? `${kpis.promedio_nota.toFixed(1)}%`
                    : "—"}
                </p>
                {delta !== null ? (
                  <p
                    className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                      delta > 0
                        ? "text-emerald-600"
                        : delta < 0
                          ? "text-red-600"
                          : "text-slate-500"
                    }`}
                  >
                    {delta > 0 ? (
                      <TrendingUp className="size-3.5" />
                    ) : delta < 0 ? (
                      <TrendingDown className="size-3.5" />
                    ) : (
                      <Minus className="size-3.5" />
                    )}
                    {delta > 0 ? "+" : ""}
                    {delta} pp vs mes anterior
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sin mes anterior
                  </p>
                )}
              </div>
              <div
                className={`rounded-full p-2.5 ${severityBgClass(kpis?.promedio_nota ?? null)}`}
              >
                <BarChart3
                  className={`size-5 ${severityTextClass(kpis?.promedio_nota ?? null)}`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2 - Auditorías del mes */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Auditorías del mes
                </p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {kpis?.total_auditorias ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  realizadas
                </p>
                {kpis && kpis.pendientes > 0 ? (
                  <Badge className="mt-2 bg-red-100 text-red-700 hover:bg-red-100">
                    {kpis.pendientes} pendientes
                  </Badge>
                ) : (
                  <Badge className="mt-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    Sin pendientes
                  </Badge>
                )}
              </div>
              <div className="rounded-full bg-slate-100 p-2.5">
                <ClipboardList className="size-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3 - Mejor / peor performer */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Performers
              </p>
              <Trophy className="size-4 text-amber-500" />
            </div>

            <div className="mt-2 divide-y divide-slate-200">
              <div className="pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                  Mejor
                </p>
                {kpis?.mejor_nombre ? (
                  <div className="flex items-center justify-between">
                    <p
                      className="truncate text-sm font-medium text-slate-900"
                      title={kpis.mejor_nombre}
                    >
                      {kpis.mejor_nombre}
                    </p>
                    <span
                      className={`text-sm font-bold ${severityTextClass(
                        kpis.mejor_nota
                      )}`}
                    >
                      {kpis.mejor_nota?.toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
              <div className="pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">
                  Peor
                </p>
                {kpis?.peor_nombre ? (
                  <div className="flex items-center justify-between">
                    <p
                      className="truncate text-sm font-medium text-slate-900"
                      title={kpis.peor_nombre}
                    >
                      {kpis.peor_nombre}
                    </p>
                    <span
                      className={`text-sm font-bold ${severityTextClass(
                        kpis.peor_nota
                      )}`}
                    >
                      {kpis.peor_nota?.toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4 - Ítems críticos */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Ítems críticos
                </p>
                <p
                  className={`mt-1 text-3xl font-bold ${
                    (kpis?.items_criticos_count ?? 0) > 0
                      ? "text-red-600"
                      : "text-emerald-600"
                  }`}
                >
                  {kpis?.items_criticos_count ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(kpis?.items_criticos_count ?? 0) > 0
                    ? "requieren acción (<50%)"
                    : "todo bajo control"}
                </p>
              </div>
              <div
                className={`rounded-full p-2.5 ${
                  (kpis?.items_criticos_count ?? 0) > 0
                    ? "bg-red-100"
                    : "bg-emerald-100"
                }`}
              >
                <AlertTriangle
                  className={`size-5 ${
                    (kpis?.items_criticos_count ?? 0) > 0
                      ? "text-red-600"
                      : "text-emerald-600"
                  }`}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tendencia — 12 meses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tendencia 12 meses — % promedio por S
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={tendenciaChartData}
                margin={{ top: 5, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} domain={[0, 100]} unit="%" />
                <Tooltip
                  formatter={(value) =>
                    value === null || value === undefined
                      ? "—"
                      : `${Number(value).toFixed(1)}%`
                  }
                />
                <ReferenceLine
                  y={80}
                  stroke="#10B981"
                  strokeDasharray="5 5"
                  label={{
                    value: "Meta 80%",
                    position: "right",
                    fontSize: 10,
                    fill: "#10B981",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Line
                  type="monotone"
                  dataKey="Organización"
                  stroke={CATEGORIA_COLORES.organizacion}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Orden"
                  stroke={CATEGORIA_COLORES.orden}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Limpieza"
                  stroke={CATEGORIA_COLORES.limpieza}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Estandarización"
                  stroke={CATEGORIA_COLORES.estandarizacion}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Disciplina"
                  stroke={CATEGORIA_COLORES.disciplina}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Ranking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ranking {tipo === "flota" ? "vehículos" : "sectores"} — {formatMesLargo(periodo)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rankingChartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin auditorías completadas este mes.
            </p>
          ) : (
            <div
              style={{
                height: Math.max(200, rankingChartData.length * 36 + 40),
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rankingChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 24, left: 8, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    fontSize={11}
                    unit="%"
                  />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    width={140}
                    fontSize={11}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toFixed(1)}%`,
                      "Nota",
                    ]}
                  />
                  <ReferenceLine
                    x={80}
                    stroke="#10B981"
                    strokeDasharray="5 5"
                  />
                  <Bar
                    dataKey="nota_total"
                    radius={[0, 4, 4, 0]}
                    label={{
                      position: "right",
                      fontSize: 10,
                      formatter: (v) =>
                        typeof v === "number" ? `${v.toFixed(1)}%` : "",
                    }}
                  >
                    {rankingChartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={severityColor(entry.nota_total)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top 5 ítems críticos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Top 5 ítems críticos — {formatMesLargo(periodo)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {criticos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay ítems con promedio crítico este mes.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Ítem</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Promedio</TableHead>
                    <TableHead className="text-right">Veces</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criticos.map((c) => (
                    <TableRow key={c.item_id}>
                      <TableCell className="text-sm font-mono text-muted-foreground">
                        {c.numero}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium text-slate-900">
                            {c.titulo}
                          </p>
                          {c.observacion_comun && (
                            <p
                              className="truncate text-xs text-muted-foreground"
                              title={c.observacion_comun}
                            >
                              Obs: {c.observacion_comun}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {S5_CATEGORIA_LABELS[c.categoria]}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          style={{
                            backgroundColor:
                              severityColor(c.promedio_pct) + "22",
                            color: severityColor(c.promedio_pct),
                          }}
                        >
                          {c.promedio_pct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {c.veces_evaluado}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            toast.info("Próximamente: crear plan de acción")
                          }
                        >
                          Crear plan
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
