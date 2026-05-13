"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Clock, Target, Truck, Users, AlertCircle, RefreshCw } from "lucide-react"
import type { Snapshot, RouteRow } from "@/lib/foxtrot-snapshot/types"
import type {
  ObjetivosTiempoRuta,
  ObjetivoTiempoRutaZona,
  ZonaName,
} from "@/actions/tiempo-ruta-zona"

type RangeKey = "today" | "yesterday" | "week" | "month"
type Banda = "verde" | "amarillo" | "rojo" | "sin_dato"

const ZONAS: ZonaName[] = ["Norte", "Central", "Este"]
const ZONA_COLOR: Record<ZonaName, string> = {
  Norte: "#ef4444",
  Central: "#f59e0b",
  Este: "#2dd4bf",
}

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  week: "Última semana",
  month: "Último mes",
}

function fmtHHMM(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—"
  const sign = min < 0 ? "-" : ""
  const abs = Math.abs(Math.round(min))
  const hh = Math.floor(abs / 60)
  const mm = abs % 60
  return `${sign}${hh}:${mm.toString().padStart(2, "0")}`
}

function clasificar(
  duracionMin: number | null,
  obj: ObjetivoTiempoRutaZona | null,
): Banda {
  if (duracionMin == null || !obj) return "sin_dato"
  if (duracionMin <= obj.meta_minutos) return "verde"
  if (duracionMin <= obj.meta_minutos + obj.tolerancia_minutos) return "amarillo"
  return "rojo"
}

function bandaColor(b: Banda): string {
  switch (b) {
    case "verde":
      return "#10B981"
    case "amarillo":
      return "#F59E0B"
    case "rojo":
      return "#EF4444"
    default:
      return "#94A3B8"
  }
}

function BandaBadge({ banda, label }: { banda: Banda; label: string }) {
  const map: Record<Banda, string> = {
    verde: "bg-green-100 text-green-700 hover:bg-green-100",
    amarillo: "bg-amber-100 text-amber-700 hover:bg-amber-100",
    rojo: "bg-red-100 text-red-700 hover:bg-red-100",
    sin_dato: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  }
  return <Badge className={map[banda]}>{label}</Badge>
}

function ZonaPill({ zona }: { zona: ZonaName | null }) {
  if (!zona) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
        Sin zona
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
      style={{ backgroundColor: ZONA_COLOR[zona] }}
    >
      {zona}
    </span>
  )
}

interface Props {
  objetivos: ObjetivosTiempoRuta
}

interface ChoferAgg {
  chofer: string
  dc: string
  rutas: number
  promedio_min: number | null
  mejor_min: number | null
  peor_min: number | null
  en_meta: number
  en_tolerancia: number
  fuera: number
  sin_dato: number
  zona_principal: ZonaName | null
}

export function TiempoRutaFoxtrotClient({ objetivos }: Props) {
  const [range, setRange] = useState<RangeKey>("week")
  const [data, setData] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zonaFilter, setZonaFilter] = useState<"all" | ZonaName>("all")
  const [tab, setTab] = useState("global")

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/foxtrot/snapshot?range=${range}`, { cache: "no-store" })
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error ?? `HTTP ${r.status}`)
      }
      const j = (await r.json()) as Snapshot
      setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  const routes: RouteRow[] = useMemo(() => data?.routes ?? [], [data])

  const routesConDuracion = useMemo(
    () => routes.filter((r) => r.duracion_min != null),
    [routes],
  )

  const routesFiltradas = useMemo(() => {
    if (zonaFilter === "all") return routesConDuracion
    return routesConDuracion.filter((r) => r.ruta_zona === zonaFilter)
  }, [routesConDuracion, zonaFilter])

  // KPIs por zona (sobre rutas con duración)
  const kpisPorZona = useMemo(() => {
    const out = {} as Record<
      ZonaName,
      {
        total: number
        promedio_min: number | null
        en_meta: number
        en_tolerancia: number
        fuera: number
      }
    >
    for (const z of ZONAS) {
      const rs = routesConDuracion.filter((r) => r.ruta_zona === z)
      const obj = objetivos[z]
      let sum = 0
      let enMeta = 0
      let enTol = 0
      let fuera = 0
      for (const r of rs) {
        sum += r.duracion_min!
        const b = clasificar(r.duracion_min, obj)
        if (b === "verde") enMeta++
        else if (b === "amarillo") enTol++
        else if (b === "rojo") fuera++
      }
      out[z] = {
        total: rs.length,
        promedio_min: rs.length ? Math.round(sum / rs.length) : null,
        en_meta: enMeta,
        en_tolerancia: enTol,
        fuera,
      }
    }
    return out
  }, [routesConDuracion, objetivos])

  const kpiGlobal = useMemo(() => {
    const rs = routesConDuracion
    let sum = 0
    let enMeta = 0
    let enTol = 0
    let fuera = 0
    let sinZona = 0
    for (const r of rs) {
      sum += r.duracion_min!
      if (!r.ruta_zona) {
        sinZona++
        continue
      }
      const obj = objetivos[r.ruta_zona]
      const b = clasificar(r.duracion_min, obj)
      if (b === "verde") enMeta++
      else if (b === "amarillo") enTol++
      else if (b === "rojo") fuera++
    }
    return {
      total: rs.length,
      promedio_min: rs.length ? Math.round(sum / rs.length) : null,
      en_meta: enMeta,
      en_tolerancia: enTol,
      fuera,
      sin_zona: sinZona,
      en_curso: routes.length - rs.length,
    }
  }, [routesConDuracion, routes.length, objetivos])

  const chartData = useMemo(() => {
    return routesFiltradas
      .slice()
      .sort((a, b) => (b.duracion_min ?? 0) - (a.duracion_min ?? 0))
      .slice(0, 40)
      .map((r) => {
        const obj = r.ruta_zona ? objetivos[r.ruta_zona] : null
        const banda = clasificar(r.duracion_min, obj)
        return {
          name: `${r.ruta} · ${r.chofer.split(" ")[0]}`,
          horas: +((r.duracion_min ?? 0) / 60).toFixed(2),
          minutos: r.duracion_min,
          zona: r.ruta_zona,
          chofer: r.chofer,
          banda,
        }
      })
  }, [routesFiltradas, objetivos])

  const chartMaxMeta = useMemo(() => {
    return Math.max(
      ...ZONAS.map((z) => (objetivos[z].meta_minutos + objetivos[z].tolerancia_minutos) / 60),
      8,
    )
  }, [objetivos])

  const choferes: ChoferAgg[] = useMemo(() => {
    const by = new Map<string, ChoferAgg & { zonaCount: Record<string, number> }>()
    for (const r of routesFiltradas) {
      const key = r.chofer
      let e = by.get(key)
      if (!e) {
        e = {
          chofer: r.chofer,
          dc: r.dc,
          rutas: 0,
          promedio_min: null,
          mejor_min: null,
          peor_min: null,
          en_meta: 0,
          en_tolerancia: 0,
          fuera: 0,
          sin_dato: 0,
          zona_principal: null,
          zonaCount: {},
        }
        by.set(key, e)
      }
      e.rutas++
      const m = r.duracion_min!
      e.promedio_min = (e.promedio_min ?? 0) + m
      e.mejor_min = e.mejor_min == null ? m : Math.min(e.mejor_min, m)
      e.peor_min = e.peor_min == null ? m : Math.max(e.peor_min, m)
      if (r.ruta_zona) {
        e.zonaCount[r.ruta_zona] = (e.zonaCount[r.ruta_zona] ?? 0) + 1
        const obj = objetivos[r.ruta_zona]
        const b = clasificar(m, obj)
        if (b === "verde") e.en_meta++
        else if (b === "amarillo") e.en_tolerancia++
        else if (b === "rojo") e.fuera++
      } else {
        e.sin_dato++
      }
    }
    return Array.from(by.values())
      .map((e) => {
        let topZona: ZonaName | null = null
        let topN = 0
        for (const [z, n] of Object.entries(e.zonaCount)) {
          if (n > topN) {
            topN = n
            topZona = z as ZonaName
          }
        }
        return {
          chofer: e.chofer,
          dc: e.dc,
          rutas: e.rutas,
          promedio_min: e.rutas ? Math.round((e.promedio_min ?? 0) / e.rutas) : null,
          mejor_min: e.mejor_min,
          peor_min: e.peor_min,
          en_meta: e.en_meta,
          en_tolerancia: e.en_tolerancia,
          fuera: e.fuera,
          sin_dato: e.sin_dato,
          zona_principal: topZona,
        }
      })
      .sort((a, b) => (b.promedio_min ?? 0) - (a.promedio_min ?? 0))
  }, [routesFiltradas, objetivos])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tiempo en Ruta — Foxtrot</h1>
          <p className="text-sm text-muted-foreground">
            Duración real start→finalized por ruta · zonificada por mayoría de PDVs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Select value={range} onValueChange={(v: string | null) => v && setRange(v as RangeKey)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Rango" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {RANGE_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <Select
              value={zonaFilter}
              onValueChange={(v: string | null) => v && setZonaFilter(v as "all" | ZonaName)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Zona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las zonas</SelectItem>
                {ZONAS.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refrescar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mr-1 inline h-4 w-4" /> {error}
        </div>
      )}

      {/* KPI Cards globales */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Promedio global</p>
                <p className="text-3xl font-bold text-slate-900">
                  {fmtHHMM(kpiGlobal.promedio_min)}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Clock className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {kpiGlobal.total} rutas con duración · {kpiGlobal.en_curso} en curso
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Dentro de meta</p>
                <p className="text-3xl font-bold text-green-600">
                  {kpiGlobal.total
                    ? Math.round((100 * kpiGlobal.en_meta) / kpiGlobal.total)
                    : 0}
                  %
                </p>
              </div>
              <div className="rounded-full bg-green-100 p-3">
                <Target className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {kpiGlobal.en_meta} dentro · {kpiGlobal.en_tolerancia} tolerancia · {kpiGlobal.fuera} fuera
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total rutas</p>
                <p className="text-3xl font-bold text-slate-900">{routes.length}</p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Truck className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {kpiGlobal.sin_zona > 0 ? `${kpiGlobal.sin_zona} sin zona asignada` : RANGE_LABEL[range]}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Choferes</p>
                <p className="text-3xl font-bold text-slate-900">{choferes.length}</p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Users className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              en el rango {RANGE_LABEL[range].toLowerCase()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cards por zona */}
      <div className="grid gap-4 lg:grid-cols-3">
        {ZONAS.map((z) => {
          const k = kpisPorZona[z]
          const obj = objetivos[z]
          const pctMeta = k.total ? Math.round((100 * k.en_meta) / k.total) : 0
          return (
            <Card key={z} className="border-l-4" style={{ borderLeftColor: ZONA_COLOR[z] }}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{z}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    meta {fmtHHMM(obj.meta_minutos)} · +{fmtHHMM(obj.tolerancia_minutos)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{fmtHHMM(k.promedio_min)}</span>
                  <span className="text-xs text-muted-foreground">promedio · {k.total} rutas</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="rounded bg-green-100 px-2 py-1 text-green-700">
                    {k.en_meta} en meta
                  </span>
                  <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">
                    {k.en_tolerancia} toler.
                  </span>
                  <span className="rounded bg-red-100 px-2 py-1 text-red-700">{k.fuera} fuera</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${pctMeta}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{pctMeta}% dentro de meta</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Detalle */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="global">Top rutas</TabsTrigger>
          <TabsTrigger value="choferes">Por chofer</TabsTrigger>
          <TabsTrigger value="rutas">Todas las rutas</TabsTrigger>
        </TabsList>

        <TabsContent value="global">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Duración por ruta {zonaFilter !== "all" ? `· ${zonaFilter}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                {chartData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">
                    Sin rutas con duración en el rango seleccionado.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        fontSize={10}
                        angle={-35}
                        textAnchor="end"
                        interval={0}
                        height={60}
                      />
                      <YAxis fontSize={11} unit="h" domain={[0, Math.ceil(chartMaxMeta + 2)]} />
                      <Tooltip
                        formatter={(_value, _name, ctx) => {
                          const p = ctx.payload as { minutos: number; zona: string | null; chofer: string }
                          return [
                            `${fmtHHMM(p.minutos)} · ${p.zona ?? "Sin zona"} · ${p.chofer}`,
                            "Duración",
                          ]
                        }}
                      />
                      {zonaFilter !== "all" && (
                        <ReferenceLine
                          y={objetivos[zonaFilter as ZonaName].meta_minutos / 60}
                          stroke="#10B981"
                          strokeDasharray="5 5"
                          label={{
                            value: `Meta ${fmtHHMM(objetivos[zonaFilter as ZonaName].meta_minutos)}`,
                            position: "right",
                            fontSize: 10,
                          }}
                        />
                      )}
                      <Bar dataKey="horas" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={bandaColor(entry.banda)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="choferes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalle por chofer</CardTitle>
            </CardHeader>
            <CardContent>
              {choferes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Sin choferes con rutas en el rango.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chofer</TableHead>
                        <TableHead>DC</TableHead>
                        <TableHead>Zona ppal.</TableHead>
                        <TableHead className="text-right">Rutas</TableHead>
                        <TableHead className="text-right">Promedio</TableHead>
                        <TableHead className="text-right">Mejor</TableHead>
                        <TableHead className="text-right">Peor</TableHead>
                        <TableHead className="text-right">En meta</TableHead>
                        <TableHead className="text-right">Tolerancia</TableHead>
                        <TableHead className="text-right">Fuera</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {choferes.map((c) => (
                        <TableRow key={c.chofer}>
                          <TableCell className="font-medium">{c.chofer}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {c.dc}
                          </TableCell>
                          <TableCell>
                            <ZonaPill zona={c.zona_principal} />
                          </TableCell>
                          <TableCell className="text-right">{c.rutas}</TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtHHMM(c.promedio_min)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-700">
                            {fmtHHMM(c.mejor_min)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-700">
                            {fmtHHMM(c.peor_min)}
                          </TableCell>
                          <TableCell className="text-right text-green-700">{c.en_meta}</TableCell>
                          <TableCell className="text-right text-amber-700">
                            {c.en_tolerancia}
                          </TableCell>
                          <TableCell className="text-right text-red-700">{c.fuera}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rutas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Todas las rutas del rango</CardTitle>
            </CardHeader>
            <CardContent>
              {routesFiltradas.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Sin rutas con duración en el rango seleccionado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>DC</TableHead>
                        <TableHead>Ruta</TableHead>
                        <TableHead>Chofer</TableHead>
                        <TableHead>Zona</TableHead>
                        <TableHead className="text-right">PDVs</TableHead>
                        <TableHead className="text-right">Cumpl.</TableHead>
                        <TableHead className="text-right">Duración</TableHead>
                        <TableHead className="text-right">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routesFiltradas
                        .slice()
                        .sort((a, b) => (b.duracion_min ?? 0) - (a.duracion_min ?? 0))
                        .map((r) => {
                          const obj = r.ruta_zona ? objetivos[r.ruta_zona] : null
                          const banda = clasificar(r.duracion_min, obj)
                          const label =
                            banda === "verde"
                              ? "En meta"
                              : banda === "amarillo"
                                ? "Tolerancia"
                                : banda === "rojo"
                                  ? "Fuera"
                                  : "—"
                          return (
                            <TableRow key={r.route_ids.join("-")}>
                              <TableCell className="text-sm">{r.fecha}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {r.dc}
                              </TableCell>
                              <TableCell className="font-medium">{r.ruta}</TableCell>
                              <TableCell className="text-sm">{r.chofer}</TableCell>
                              <TableCell>
                                <ZonaPill zona={r.ruta_zona} />
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {r.pdvs_done}/{r.pdvs_total}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {r.cumplimiento_pct}%
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {fmtHHMM(r.duracion_min)}
                              </TableCell>
                              <TableCell className="text-right">
                                <BandaBadge banda={banda} label={label} />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {data?.generated_at && (
        <p className="text-right text-[10px] text-muted-foreground">
          Snapshot generado {new Date(data.generated_at).toLocaleString("es-AR")}
        </p>
      )}
    </div>
  )
}
