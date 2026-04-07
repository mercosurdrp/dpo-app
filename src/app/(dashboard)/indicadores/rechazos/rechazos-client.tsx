"use client"

import { useState, useTransition, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, PieChart, Pie, LineChart, Line,
} from "recharts"
import {
  Target, TrendingDown, ChevronLeft, ChevronRight,
  PackageX, Package, Truck, RefreshCw, Users, AlertTriangle,
  Search, Download, ShieldAlert, ShieldCheck,
} from "lucide-react"
import type { RechazosAcumulado } from "@/actions/rechazos"
import { getRechazosAcumulado } from "@/actions/rechazos"

const META = 1.5

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const CAT_COLORS: Record<string, string> = {
  "Logística": "#E67E22",
  "Ventas": "#3498DB",
  "Cliente": "#95A5A6",
  "Interno": "#BDC3C7",
  "Otro": "#8B5CF6",
}

function colorPct(pct: number) {
  if (pct <= META) return "text-green-600"
  if (pct <= 3) return "text-amber-600"
  return "text-red-600"
}
function bgPct(pct: number) {
  if (pct <= META) return "bg-green-100"
  if (pct <= 3) return "bg-amber-100"
  return "bg-red-100"
}
function barColor(pct: number) {
  if (pct <= META) return "#10B981"
  if (pct <= 3) return "#F59E0B"
  return "#EF4444"
}

function fmt(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  acumulado: RechazosAcumulado
  mesInicial: number
  anioInicial: number
}

export function RechazosClient({ acumulado: acumInicial, mesInicial, anioInicial }: Props) {
  const [mes, setMes] = useState(mesInicial)
  const [anio, setAnio] = useState(anioInicial)
  const [acum, setAcum] = useState(acumInicial)
  const [isPending, startTransition] = useTransition()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [verTodosClientes, setVerTodosClientes] = useState(false)
  const [catSeleccionada, setCatSeleccionada] = useState<string | null>(null)
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)

  const cambiarMes = useCallback((delta: number) => {
    let nuevoMes = mes + delta
    let nuevoAnio = anio
    if (nuevoMes < 1) { nuevoMes = 12; nuevoAnio-- }
    else if (nuevoMes > 12) { nuevoMes = 1; nuevoAnio++ }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
    startTransition(async () => {
      const res = await getRechazosAcumulado(nuevoMes, nuevoAnio)
      if ("data" in res) setAcum(res.data)
    })
  }, [mes, anio])

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`
      const ultimoDia = new Date(anio, mes, 0).getDate()
      const ultimaFecha = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`
      const resp = await fetch("/api/rechazos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": "mercosur-dpo-sync-2026" },
        body: JSON.stringify({ fechaDesde: primerDia, fechaHasta: ultimaFecha }),
      })
      const data = await resp.json()
      if (data.success) {
        setSyncMsg(`OK: ${data.rechazos_insertados} nuevos, ${data.dias_procesados} días`)
        const res = await getRechazosAcumulado(mes, anio)
        if ("data" in res) setAcum(res.data)
      } else {
        setSyncMsg(`Error: ${data.error}`)
      }
    } catch (err) {
      setSyncMsg(`Error: ${err instanceof Error ? err.message : "Fallo sync"}`)
    } finally { setSyncing(false) }
  }

  // ─── Pareto data ──────────────────────────────────────────────────
  const paretoData = (() => {
    let acumulativo = 0
    return acum.por_motivo.map((m) => {
      acumulativo += m.pct_del_total
      return {
        name: m.ds_rechazo,
        bultos: m.bultos,
        cantidad: m.cantidad,
        pct: m.pct_del_total,
        acumulativo: Math.round(acumulativo * 100) / 100,
        fill: CAT_COLORS[m.categoria] ?? CAT_COLORS.Otro,
        categoria: m.categoria,
      }
    })
  })()

  // ─── Donut categorías ─────────────────────────────────────────────
  const categoriasData = (() => {
    const map = new Map<string, number>()
    for (const m of acum.por_motivo) {
      map.set(m.categoria, (map.get(m.categoria) ?? 0) + m.bultos)
    }
    return [...map.entries()]
      .map(([cat, bultos]) => ({ name: cat, value: bultos, fill: CAT_COLORS[cat] ?? CAT_COLORS.Otro }))
      .sort((a, b) => b.value - a.value)
  })()

  // ─── Fletero chart (horizontal bars) ──────────────────────────────
  const fleteroChartData = acum.por_fletero.slice(0, 15).map((f) => ({
    name: f.ds_fletero_carga,
    pct: f.pct_rechazo,
    rechazados: f.bultos_rechazados,
    entregados: f.bultos_entregados,
  }))

  // ─── Daily chart ──────────────────────────────────────────────────
  const dailyData = acum.por_dia.map((d) => ({
    name: parseInt(d.fecha.slice(-2), 10).toString(),
    pct: d.pct_rechazo,
    rechazados: d.bultos_rechazados,
    entregados: d.bultos_entregados,
  }))

  // ─── Clientes ─────────────────────────────────────────────────────
  const clientesVisibles = verTodosClientes ? acum.por_cliente : acum.por_cliente.slice(0, 15)

  // ─── Detalle filtrado ─────────────────────────────────────────────
  const detalleFiltered = busqueda.trim()
    ? acum.detalle.filter((d) => {
        const q = busqueda.toLowerCase()
        return (
          d.ds_fletero_carga.toLowerCase().includes(q) ||
          d.ds_articulo.toLowerCase().includes(q) ||
          d.ds_rechazo.toLowerCase().includes(q) ||
          (d.nombre_cliente ?? "").toLowerCase().includes(q) ||
          (d.ds_vendedor ?? "").toLowerCase().includes(q)
        )
      })
    : acum.detalle

  function exportCSV() {
    const headers = ["Fecha", "Fletero", "Cliente", "Vendedor", "Artículo", "Bultos", "Motivo"]
    const rows = acum.detalle.map((d) => [
      d.fecha, d.ds_fletero_carga, d.nombre_cliente ?? "", d.ds_vendedor ?? "",
      d.ds_articulo, d.bultos_rechazados.toString(), d.ds_rechazo,
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `rechazos_${MESES[mes]}_${anio}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const promedioFletero = acum.por_fletero.length > 0
    ? acum.por_fletero.reduce((s, f) => s + f.pct_rechazo, 0) / acum.por_fletero.length
    : 0

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">% Rechazos — Acumulado Mensual</h1>
          <p className="text-sm text-muted-foreground">
            Meta: {META}% · Bultos rechazados vs entregados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => cambiarMes(-1)} disabled={isPending}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {MESES[mes]} {anio}
          </span>
          <Button
            variant="outline" size="icon"
            onClick={() => cambiarMes(1)}
            disabled={isPending || (mes === mesInicial && anio === anioInicial)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-2 ml-2">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sync..." : "Sync Chess"}
          </Button>
        </div>
      </div>

      {syncMsg && (
        <div className={`rounded-lg p-3 text-sm ${syncMsg.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {syncMsg}
        </div>
      )}

      {isPending && (
        <div className="text-center text-sm text-muted-foreground py-2">Cargando...</div>
      )}

      {/* ─── KPI Cards (5) ──────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* 1. % Rechazo Mes */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">% Rechazo Mes</p>
                <p className={`text-3xl font-bold ${colorPct(acum.pct_rechazo)}`}>
                  {acum.pct_rechazo}%
                </p>
              </div>
              <div className={`rounded-full p-3 ${bgPct(acum.pct_rechazo)}`}>
                <Target className={`h-5 w-5 ${colorPct(acum.pct_rechazo)}`} />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Meta: {META}%
            </p>
          </CardContent>
        </Card>

        {/* 2. % Controlable */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">% Controlable</p>
                <p className={`text-3xl font-bold ${colorPct(acum.pct_controlable)}`}>
                  {acum.pct_controlable}%
                </p>
              </div>
              <div className={`rounded-full p-3 ${acum.pct_controlable <= META ? "bg-green-100" : "bg-orange-100"}`}>
                {acum.pct_controlable <= META
                  ? <ShieldCheck className="h-5 w-5 text-green-600" />
                  : <ShieldAlert className="h-5 w-5 text-orange-600" />}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Logística + Ventas
            </p>
          </CardContent>
        </Card>

        {/* 3. Bultos */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Bultos Rechazados</p>
                <p className="text-3xl font-bold text-slate-900">
                  {fmt(acum.total_bultos_rechazados)}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <PackageX className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              de {fmt(acum.total_bultos_entregados)} entregados
            </p>
          </CardContent>
        </Card>

        {/* 4. Clientes recurrentes */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Clientes Recurrentes</p>
                <p className={`text-3xl font-bold ${acum.clientes_recurrentes > 10 ? "text-red-600" : acum.clientes_recurrentes > 5 ? "text-amber-600" : "text-green-600"}`}>
                  {acum.clientes_recurrentes}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Users className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              3+ rechazos en el mes
            </p>
          </CardContent>
        </Card>

        {/* 5. Top Motivo */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Top Motivo</p>
                <p className="text-lg font-bold text-slate-900 leading-tight">
                  {acum.top_motivo?.ds_rechazo ?? "—"}
                </p>
              </div>
              <div className="rounded-full bg-orange-100 p-3">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {acum.top_motivo ? `${acum.top_motivo.pct}% de rechazos (${fmt(acum.top_motivo.bultos)} bultos)` : "Sin datos"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Pareto de Motivos + Donut Categorías ───────────────── */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Pareto (3/5) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Pareto de Motivos — {MESES[mes]}</CardTitle>
          </CardHeader>
          <CardContent>
            {paretoData.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Sin datos</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paretoData} margin={{ bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name" fontSize={9} angle={-35} textAnchor="end"
                      interval={0} height={70}
                    />
                    <YAxis yAxisId="left" fontSize={11} />
                    <YAxis yAxisId="right" orientation="right" fontSize={11} unit="%" domain={[0, 100]} />
                    <Tooltip
                      formatter={(value, name) => {
                        const v = Number(value)
                        if (name === "bultos") return [`${fmt(v)} bultos`, "Rechazados"]
                        return [`${v}%`, "Acumulativo"]
                      }}
                    />
                    <Bar yAxisId="left" dataKey="bultos" radius={[4, 4, 0, 0]}>
                      {paretoData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                    <Line
                      yAxisId="right" type="monotone" dataKey="acumulativo"
                      stroke="#1E293B" strokeWidth={2} dot={{ r: 3 }}
                    />
                    <ReferenceLine yAxisId="right" y={80} stroke="#EF4444" strokeDasharray="5 5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Leyenda categorías */}
            <div className="flex flex-wrap gap-4 mt-3 text-xs">
              {Object.entries(CAT_COLORS).filter(([k]) => k !== "Otro").map(([cat, color]) => (
                <span key={cat} className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                  {cat}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Donut categorías (2/5) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Por Responsabilidad
              {catSeleccionada && (
                <Badge className="ml-2 text-xs cursor-pointer" variant="outline" onClick={() => setCatSeleccionada(null)}>
                  {catSeleccionada} ✕
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoriasData.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Sin datos</p>
            ) : (
              <div className="space-y-4">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoriasData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        label={(props: { name?: string; percent?: number }) =>
                          `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                        fontSize={11}
                        className="cursor-pointer"
                        onClick={(_: unknown, index: number) => {
                          const cat = categoriasData[index]?.name
                          setCatSeleccionada(catSeleccionada === cat ? null : cat ?? null)
                        }}
                      >
                        {categoriasData.map((e, i) => (
                          <Cell
                            key={i}
                            fill={e.fill}
                            opacity={catSeleccionada && catSeleccionada !== e.name ? 0.3 : 1}
                            stroke={catSeleccionada === e.name ? "#1E293B" : undefined}
                            strokeWidth={catSeleccionada === e.name ? 2 : 0}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${fmt(Number(value))} bultos`, "Rechazados"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Drill-down: motivos de la categoría seleccionada */}
                {catSeleccionada ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Motivos en &quot;{catSeleccionada}&quot;
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Motivo</TableHead>
                          <TableHead className="text-right">Bultos</TableHead>
                          <TableHead className="text-right">Casos</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {acum.por_motivo
                          .filter((m) => m.categoria === catSeleccionada)
                          .map((m) => (
                            <TableRow key={m.ds_rechazo}>
                              <TableCell className="text-sm">{m.ds_rechazo}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{fmt(m.bultos)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{m.cantidad}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{m.pct_del_total}%</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Bultos</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoriasData.map((c) => (
                        <TableRow
                          key={c.name}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => setCatSeleccionada(catSeleccionada === c.name ? null : c.name)}
                        >
                          <TableCell className="text-sm">
                            <span className="inline-block h-2.5 w-2.5 rounded-sm mr-2" style={{ backgroundColor: c.fill }} />
                            {c.name}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(c.value)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {acum.total_bultos_rechazados > 0
                              ? Math.round((c.value / acum.total_bultos_rechazados) * 100)
                              : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <p className="text-[10px] text-muted-foreground text-center">
                  Hacé clic en el gráfico o la tabla para ver motivos
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Ranking Fleteros + Daily chart ──────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ranking fleteros */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4" /> Ranking Fleteros — {MESES[mes]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fleteroChartData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Sin datos</p>
            ) : (
              <>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fleteroChartData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" fontSize={11} unit="%" domain={[0, "auto"]} />
                      <YAxis type="category" dataKey="name" fontSize={10} width={85} />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "% Rechazo"]}
                        labelFormatter={(label) => `Fletero: ${label}`}
                      />
                      <ReferenceLine
                        x={promedioFletero > 0 ? Math.round(promedioFletero * 100) / 100 : META}
                        stroke="#6366F1" strokeDasharray="5 5"
                        label={{ value: "Prom", position: "top", fontSize: 10 }}
                      />
                      <ReferenceLine x={META} stroke="#10B981" strokeDasharray="5 5" />
                      <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                        {fleteroChartData.map((entry, i) => (
                          <Cell key={i} fill={barColor(entry.pct)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Tabla debajo */}
                <div className="overflow-x-auto mt-4 max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patente</TableHead>
                        <TableHead className="text-right">Rech.</TableHead>
                        <TableHead className="text-right">Entr.</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead>Motivo Ppal.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {acum.por_fletero.map((f) => (
                        <TableRow
                          key={f.ds_fletero_carga}
                          className={f.pct_rechazo > 3 ? "bg-red-50" : ""}
                        >
                          <TableCell className="font-mono font-medium text-sm">{f.ds_fletero_carga}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{fmt(f.bultos_rechazados)}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{fmt(f.bultos_entregados)}</TableCell>
                          <TableCell className="text-right">
                            <Badge className={`${f.pct_rechazo <= META ? "bg-green-100 text-green-700" : f.pct_rechazo <= 3 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"} hover:bg-opacity-80`}>
                              {f.pct_rechazo}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {f.motivo_principal}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Daily trend (secondary) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Evolución Diaria — {MESES[mes]}
              {diaSeleccionado && (
                <Badge className="ml-2 text-xs cursor-pointer" variant="outline" onClick={() => setDiaSeleccionado(null)}>
                  Día {parseInt(diaSeleccionado.slice(-2), 10)} ✕
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Sin datos. Usa &quot;Sync Chess&quot; para importar.</p>
            ) : (
              <>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dailyData}
                      onClick={(state) => {
                        if (state?.activeLabel) {
                          const diaNum = state.activeLabel
                          const fechaMatch = acum.por_dia.find(
                            (d) => parseInt(d.fecha.slice(-2), 10).toString() === diaNum
                          )
                          if (fechaMatch) {
                            setDiaSeleccionado(diaSeleccionado === fechaMatch.fecha ? null : fechaMatch.fecha)
                          }
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit="%" domain={[0, "auto"]} />
                      <Tooltip
                        formatter={(value, name) => {
                          const v = Number(value)
                          if (name === "pct") return [`${v}%`, "% Rechazo"]
                          return [fmt(v), name === "rechazados" ? "Rechazados" : "Entregados"]
                        }}
                        labelFormatter={(label) => `Día ${label} — clic para ver detalle`}
                      />
                      <ReferenceLine y={META} stroke="#10B981" strokeDasharray="5 5"
                        label={{ value: `Meta ${META}%`, position: "right", fontSize: 10 }}
                      />
                      <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                        {dailyData.map((entry, i) => {
                          const fechaMatch = acum.por_dia.find(
                            (d) => parseInt(d.fecha.slice(-2), 10).toString() === entry.name
                          )
                          const isSelected = diaSeleccionado && fechaMatch?.fecha === diaSeleccionado
                          return (
                            <Cell
                              key={i}
                              fill={barColor(entry.pct)}
                              opacity={diaSeleccionado && !isSelected ? 0.3 : 1}
                              stroke={isSelected ? "#1E293B" : undefined}
                              strokeWidth={isSelected ? 2 : 0}
                            />
                          )
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Drill-down: rechazos del día seleccionado */}
                {diaSeleccionado ? (() => {
                  const rechDia = acum.detalle.filter((d) => d.fecha === diaSeleccionado)
                  // Agrupar por cliente
                  const clienteMap = new Map<string, { id_cliente: number | null; nombre: string; bultos: number; motivos: Set<string> }>()
                  for (const r of rechDia) {
                    const key = r.nombre_cliente ?? "SIN CLIENTE"
                    const c = clienteMap.get(key) ?? { id_cliente: r.id_cliente, nombre: key, bultos: 0, motivos: new Set() }
                    c.bultos += r.bultos_rechazados
                    c.motivos.add(r.ds_rechazo)
                    clienteMap.set(key, c)
                  }
                  const clientes = [...clienteMap.values()].sort((a, b) => b.bultos - a.bultos)

                  return (
                    <div className="mt-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Rechazos del {diaSeleccionado} — {rechDia.length} registros, {clientes.length} clientes
                      </p>
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cód.</TableHead>
                              <TableHead>Cliente</TableHead>
                              <TableHead className="text-right">Bultos</TableHead>
                              <TableHead>Motivo(s)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientes.map((c) => (
                              <TableRow key={c.nombre}>
                                <TableCell className="font-mono text-xs">{c.id_cliente ?? "—"}</TableCell>
                                <TableCell className="text-sm max-w-[180px] truncate">{c.nombre}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{fmt(c.bultos)}</TableCell>
                                <TableCell className="text-xs">
                                  <div className="flex flex-wrap gap-1">
                                    {[...c.motivos].map((m) => (
                                      <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0">{m}</Badge>
                                    ))}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )
                })() : (
                  <>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs text-muted-foreground">
                      <div>
                        <p className="font-medium text-slate-900">{acum.por_dia.length}</p>
                        <p>Días con datos</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {acum.por_dia.length > 0
                            ? Math.round(acum.por_dia.reduce((s, d) => s + d.pct_rechazo, 0) / acum.por_dia.length * 100) / 100
                            : 0}%
                        </p>
                        <p>Promedio diario</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {acum.por_dia.length > 0
                            ? Math.max(...acum.por_dia.map((d) => d.pct_rechazo))
                            : 0}%
                        </p>
                        <p>Peor día</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center mt-2">
                      Hacé clic en una barra para ver clientes y motivos del día
                    </p>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Top Clientes ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Top Clientes con Rechazos
          </CardTitle>
          {acum.por_cliente.length > 15 && (
            <Button variant="ghost" size="sm" onClick={() => setVerTodosClientes(!verTodosClientes)}>
              {verTodosClientes ? "Ver menos" : `Ver todos (${acum.por_cliente.length})`}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {acum.por_cliente.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sin datos</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Casos</TableHead>
                    <TableHead className="text-right">Bultos</TableHead>
                    <TableHead className="text-right">Días</TableHead>
                    <TableHead>Motivos</TableHead>
                    <TableHead>Fleteros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesVisibles.map((c) => (
                    <TableRow
                      key={c.nombre_cliente}
                      className={
                        c.fechas_distintas >= 5 ? "bg-red-50" :
                        c.fechas_distintas >= 3 ? "bg-amber-50" : ""
                      }
                    >
                      <TableCell className="text-sm font-medium max-w-[200px] truncate">
                        {c.nombre_cliente}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                        {c.ds_vendedor}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.cantidad_rechazos}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(c.bultos_rechazados)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {c.fechas_distintas >= 3 ? (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{c.fechas_distintas}</Badge>
                        ) : c.fechas_distintas}
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px]">
                        <div className="flex flex-wrap gap-1">
                          {c.motivos.map((m) => (
                            <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0"
                              style={{ borderColor: CAT_COLORS[(() => {
                                const cats: Record<string, string> = {
                                  "ERROR DE CARGA": "Logística", "ERROR DE DISTRIBUCIÓN": "Logística",
                                  "PRODUCTO NO APTO": "Logística", "SIN STOCK": "Logística",
                                  "ERROR DE PREVENTA": "Ventas", "SIN ENVASES": "Ventas",
                                  "CERRADO": "Cliente", "SIN DINERO": "Cliente",
                                  "DEV X TRÁMITES INTERNOS": "Interno",
                                }
                                return cats[m] ?? "Otro"
                              })()] }}
                            >
                              {m}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {c.fleteros.length > 1 ? (
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                            {c.fleteros.length} fleteros
                          </Badge>
                        ) : c.fleteros[0] ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Detalle completo ───────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Detalle de Rechazos — {MESES[mes]} {anio}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                className="pl-9 h-9 w-[200px]"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {detalleFiltered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {busqueda ? "Sin resultados para la búsqueda" : "No hay rechazos registrados."}
            </p>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Fletero</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Artículo</TableHead>
                    <TableHead className="text-right">Bultos</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalleFiltered.slice(0, 100).map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm font-mono whitespace-nowrap">{d.fecha}</TableCell>
                      <TableCell className="text-sm font-mono">{d.ds_fletero_carga}</TableCell>
                      <TableCell className="text-sm max-w-[150px] truncate">{d.nombre_cliente ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[100px] truncate">{d.ds_vendedor ?? "—"}</TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">{d.ds_articulo}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Math.round(d.bultos_rechazados)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{d.ds_rechazo}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {detalleFiltered.length > 100 && (
                <p className="text-center text-xs text-muted-foreground py-2">
                  Mostrando 100 de {detalleFiltered.length} registros. Exportá a CSV para ver todos.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Footer info ────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground text-center">
        {fmt(acum.detalle.length)} rechazos · {acum.por_fletero.length} fleteros · {acum.por_cliente.length} clientes · {acum.por_dia.length} días con datos
      </p>
    </div>
  )
}
