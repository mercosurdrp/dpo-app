"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Clock, Truck, AlertTriangle, CheckCircle2, RefreshCcw, TrendingUp, Target } from "lucide-react"
import type {
  TmlFoxtrotRango,
  TmlFoxtrotEquipo,
  TmlFoxtrotResumen,
  TmlFoxtrotChoferAgg,
  TmlFoxtrotPeriodo,
  TmlFoxtrotSerieDia,
} from "@/types/database"

interface Props {
  initial: TmlFoxtrotRango
}

const PERIODOS: { value: TmlFoxtrotPeriodo; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
  { value: "ytd", label: "YTD" },
  { value: "personalizado", label: "Personalizado" },
]

function ddMM(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

type Granularidad = "dia" | "semana" | "mes"
type Sucursal = "TODAS" | "ELDORADO" | "IGUAZU"
type ScopeKey = "total" | "eldorado" | "iguazu"

// Objetivo del programa DPO: ≥ 65% de equipos dentro de meta.
const OBJETIVO_PCT = 65

const SUCURSALES: { value: Sucursal; label: string }[] = [
  { value: "TODAS", label: "Todas" },
  { value: "ELDORADO", label: "Eldorado" },
  { value: "IGUAZU", label: "Iguazú" },
]

function scopeKeyDe(s: Sucursal): ScopeKey {
  return s === "ELDORADO" ? "eldorado" : s === "IGUAZU" ? "iguazu" : "total"
}

// % de equipos dentro de meta de un resumen, según la métrica activa.
function pctEnMeta(r: TmlFoxtrotResumen, desde7: boolean): number | null {
  if (r.equipos_con_tml === 0) return null
  const enMeta = desde7 ? r.en_meta_desde7 : r.en_meta_real
  return Math.round((enMeta / r.equipos_con_tml) * 100)
}

// Lunes de la semana que contiene a `fecha` (YYYY-MM-DD).
function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00.000Z`)
  const dow = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().slice(0, 10)
}

// Granularidad del gráfico de tendencia según el período:
// semana→días, mes→semanas, YTD→meses. Personalizado: por largo del rango.
function granularidadSerie(
  periodo: TmlFoxtrotPeriodo,
  desde: string,
  hasta: string,
): Granularidad {
  if (periodo === "semana") return "dia"
  if (periodo === "mes") return "semana"
  if (periodo === "ytd") return "mes"
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1
  if (dias <= 16) return "dia"
  if (dias <= 92) return "semana"
  return "mes"
}

// Agrupa la serie diaria en días/semanas/meses. El promedio del bucket es
// ponderado por equipos_con_tml (= suma real de TMLs / suma de equipos).
function bucketSerie(
  serie: TmlFoxtrotSerieDia[],
  granularidad: Granularidad,
  desde7: boolean,
  scope: ScopeKey,
): { label: string; valor: number | null }[] {
  const val = (r: TmlFoxtrotResumen) =>
    desde7 ? r.promedio_desde7_min : r.promedio_real_min
  if (granularidad === "dia") {
    return serie.map((s) => ({ label: ddMM(s.fecha), valor: val(s[scope]) }))
  }
  const groups = new Map<string, { label: string; sum: number; n: number }>()
  for (const s of serie) {
    const key = granularidad === "semana" ? lunesDe(s.fecha) : s.fecha.slice(0, 7)
    const label =
      granularidad === "semana" ? ddMM(key) : MESES[Number(key.slice(5, 7)) - 1]
    let g = groups.get(key)
    if (!g) {
      g = { label, sum: 0, n: 0 }
      groups.set(key, g)
    }
    const r = s[scope]
    const v = val(r)
    if (v != null) {
      g.sum += v * r.equipos_con_tml
      g.n += r.equipos_con_tml
    }
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, g]) => ({ label: g.label, valor: g.n > 0 ? Math.round(g.sum / g.n) : null }))
}

function estadoColor(e: TmlFoxtrotEquipo["estado"]): {
  border: string
  text: string
  bg: string
  label: string
} {
  switch (e) {
    case "ok":
      return { border: "border-l-green-500", text: "text-green-700", bg: "bg-green-100", label: "OK" }
    case "fuera_meta":
      return { border: "border-l-red-500", text: "text-red-700", bg: "bg-red-100", label: "Fuera meta" }
    case "sin_marca":
      return { border: "border-l-amber-500", text: "text-amber-700", bg: "bg-amber-100", label: "Sin marca" }
    default:
      return { border: "border-l-slate-300", text: "text-slate-600", bg: "bg-slate-100", label: "Sin ruta" }
  }
}

export function TmlFoxtrotClient({ initial }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [desde7, setDesde7] = useState(false)
  const [sucursal, setSucursal] = useState<Sucursal>("TODAS")
  const [customDesde, setCustomDesde] = useState(initial.desde)
  const [customHasta, setCustomHasta] = useState(initial.hasta)
  const scopeKey = scopeKeyDe(sucursal)

  const navegar = (periodo: TmlFoxtrotPeriodo, desde?: string, hasta?: string) => {
    const params = new URLSearchParams()
    params.set("periodo", periodo)
    if (periodo === "personalizado") {
      params.set("desde", desde ?? customDesde)
      params.set("hasta", hasta ?? customHasta)
    }
    startTransition(() => router.push(`?${params.toString()}`))
  }

  const esDiaUnico = initial.es_dia_unico
  const metricaLabel = desde7 ? "Desde turno" : "Marca real"

  // Datos del detalle (tabla + KPIs) filtrados por la sucursal elegida.
  const choferesScope = useMemo(
    () =>
      sucursal === "TODAS"
        ? initial.choferes
        : initial.choferes.filter((c) => c.sucursal === sucursal),
    [initial.choferes, sucursal],
  )
  const equiposScope = useMemo(
    () =>
      sucursal === "TODAS"
        ? initial.equipos
        : initial.equipos.filter((e) => e.sucursal === sucursal),
    [initial.equipos, sucursal],
  )

  // Resumen del scope elegido (Todas / Eldorado / Iguazú).
  const scopedResumen =
    sucursal === "TODAS" ? initial.resumen : initial.por_sucursal[sucursal]

  // KPIs del scope; responden al toggle Marca real / Desde turno.
  const kpis = useMemo(() => {
    const enMeta = desde7 ? scopedResumen.en_meta_desde7 : scopedResumen.en_meta_real
    return {
      enMeta,
      fueraMeta: scopedResumen.equipos_con_tml - enMeta,
      totales: scopedResumen.equipos_totales,
      pct: pctEnMeta(scopedResumen, desde7),
    }
  }, [scopedResumen, desde7])

  // Serie para el gráfico de tendencia, con granularidad según el período.
  const granularidad = useMemo(
    () => granularidadSerie(initial.periodo, initial.desde, initial.hasta),
    [initial.periodo, initial.desde, initial.hasta],
  )
  const serieChart = useMemo(
    () => bucketSerie(initial.serie_diaria, granularidad, desde7, scopeKey),
    [initial.serie_diaria, granularidad, desde7, scopeKey],
  )
  const tendenciaLabel =
    granularidad === "dia" ? "diaria" : granularidad === "semana" ? "semanal" : "mensual"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Clock className="h-6 w-6 text-amber-600" />
            TML · Tiempo Medio de Liberación (Foxtrot)
          </h1>
          <p className="text-sm text-muted-foreground">
            Desde marca biométrica del equipo hasta la salida real del vehículo (Foxtrot) · meta{" "}
            {initial.meta_minutos} min ·{" "}
            <span className="font-medium text-slate-700">
              {esDiaUnico ? ddMM(initial.desde) : `${ddMM(initial.desde)} – ${ddMM(initial.hasta)}`}
            </span>
          </p>
        </div>
        <div className="flex items-center rounded-md border bg-white p-1 text-sm">
          <button
            type="button"
            onClick={() => setDesde7(false)}
            className={`rounded px-3 py-1 transition-colors ${
              !desde7 ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Marca real
          </button>
          <button
            type="button"
            onClick={() => setDesde7(true)}
            title="Cuenta desde la hora de turno (inicio planificado de la ruta: 07:00 o 05:00 para zona este)"
            className={`rounded px-3 py-1 transition-colors ${
              desde7 ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Desde turno
          </button>
        </div>
      </div>

      {/* Selector de período */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center rounded-md border bg-white p-1 text-sm">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => navegar(p.value)}
              disabled={isPending}
              className={`rounded px-3 py-1 transition-colors disabled:opacity-50 ${
                initial.periodo === p.value
                  ? "bg-amber-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Filtro de sucursal */}
        <div className="flex items-center rounded-md border bg-white p-1 text-sm">
          {SUCURSALES.map((su) => (
            <button
              key={su.value}
              type="button"
              onClick={() => setSucursal(su.value)}
              className={`rounded px-3 py-1 transition-colors ${
                sucursal === su.value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {su.label}
            </button>
          ))}
        </div>

        {initial.periodo === "personalizado" && (
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="desde" className="text-xs text-muted-foreground">
                Desde
              </Label>
              <Input
                id="desde"
                type="date"
                value={customDesde}
                max={customHasta}
                onChange={(e) => {
                  setCustomDesde(e.target.value)
                  navegar("personalizado", e.target.value, customHasta)
                }}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="hasta" className="text-xs text-muted-foreground">
                Hasta
              </Label>
              <Input
                id="hasta"
                type="date"
                value={customHasta}
                min={customDesde}
                onChange={(e) => {
                  setCustomHasta(e.target.value)
                  navegar("personalizado", customDesde, e.target.value)
                }}
                className="w-40"
              />
            </div>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => router.refresh())}
        >
          <RefreshCcw className={`mr-1 h-4 w-4 ${isPending ? "animate-spin" : ""}`} /> Refrescar
        </Button>
      </div>

      {initial.incluye_hoy_provisional && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            El día de hoy es <strong>provisional</strong>: usa el inicio de ruta en vivo.
            La salida real del vehículo se consolida al cierre del día, con el sync de Foxtrot.
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ResumenCard
          title="Total"
          r={initial.resumen}
          color="bg-slate-300"
          desde7={desde7}
          esDiaUnico={esDiaUnico}
          selected={sucursal === "TODAS"}
        />
        <ResumenCard
          title="Eldorado"
          r={initial.por_sucursal.ELDORADO}
          color="bg-blue-300"
          desde7={desde7}
          esDiaUnico={esDiaUnico}
          selected={sucursal === "ELDORADO"}
        />
        <ResumenCard
          title="Iguazú"
          r={initial.por_sucursal.IGUAZU}
          color="bg-emerald-300"
          desde7={desde7}
          esDiaUnico={esDiaUnico}
          selected={sucursal === "IGUAZU"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetaPctCard pct={kpis.pct} />
        <KpiBox
          label={esDiaUnico ? "Equipos en meta" : "Jornadas en meta"}
          value={kpis.enMeta}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="green"
        />
        <KpiBox
          label={esDiaUnico ? "Fuera de meta" : "Jornadas fuera meta"}
          value={kpis.fueraMeta}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="red"
        />
        <KpiBox
          label={esDiaUnico ? "Total equipos" : "Jornadas totales"}
          value={kpis.totales}
          icon={<Truck className="h-4 w-4" />}
          color="slate"
        />
      </div>

      {/* Tendencia diaria (solo en rangos multi-día) */}
      {!esDiaUnico && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
              <TrendingUp className="h-4 w-4 text-amber-600" />
              Tendencia {tendenciaLabel} del TML promedio ({metricaLabel}
              {sucursal === "ELDORADO"
                ? " · Eldorado"
                : sucursal === "IGUAZU"
                  ? " · Iguazú"
                  : ""}
              )
            </p>
            {serieChart.every((d) => d.valor == null) ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No hay datos sincronizados para este período. Los días pasados se cargan
                con el sync diario de Foxtrot.
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serieChart} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} unit=" min" width={56} />
                    <Tooltip
                      formatter={(v) => (typeof v === "number" ? `${v} min` : "—")}
                      labelFormatter={(l) =>
                        granularidad === "dia"
                          ? `Día ${l}`
                          : granularidad === "semana"
                            ? `Semana del ${l}`
                            : `Mes ${l}`
                      }
                    />
                    <ReferenceLine
                      y={initial.meta_minutos}
                      stroke="#dc2626"
                      strokeDasharray="4 4"
                      label={{ value: `meta ${initial.meta_minutos}`, fontSize: 10, fill: "#dc2626" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="valor"
                      stroke="#d97706"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detalle: por equipo (día único) o por chofer (rango) */}
      <Card>
        <CardContent className="pt-6">
          {esDiaUnico ? (
            <EquiposTable equipos={equiposScope} desde7={desde7} />
          ) : (
            <ChoferesTable choferes={choferesScope} desde7={desde7} meta={initial.meta_minutos} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ResumenCard({
  title,
  r,
  color,
  desde7,
  esDiaUnico,
  selected,
}: {
  title: string
  r: TmlFoxtrotResumen
  color: string
  desde7: boolean
  esDiaUnico: boolean
  selected: boolean
}) {
  const valor = desde7 ? r.promedio_desde7_min : r.promedio_real_min
  const pct = pctEnMeta(r, desde7)
  const pctOk = pct != null && pct >= OBJETIVO_PCT
  return (
    <Card className={selected ? "ring-2 ring-slate-900" : undefined}>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
        <div className="mt-1 flex items-baseline gap-3">
          <p className="text-3xl font-bold text-slate-900">
            {valor != null ? `${valor} min` : "—"}
          </p>
          <p
            className={`text-sm font-semibold ${
              pct == null ? "text-slate-400" : pctOk ? "text-green-600" : "text-red-600"
            }`}
          >
            {pct != null ? `${pct}% en meta` : "—"}
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {r.equipos_con_tml}/{r.equipos_totales} {esDiaUnico ? "equipos" : "jornadas"} · peor{" "}
          {r.peor_real_min ?? "—"} · mejor {r.mejor_real_min ?? "—"}
        </p>
        <div className={`mt-3 h-1 w-full rounded-full ${color}`} />
      </CardContent>
    </Card>
  )
}

// KPI destacado del % dentro de meta vs el objetivo del programa DPO (≥65%).
function MetaPctCard({ pct }: { pct: number | null }) {
  const ok = pct != null && pct >= OBJETIVO_PCT
  const tono =
    pct == null
      ? { texto: "text-slate-400", chip: "bg-slate-100 text-slate-700" }
      : ok
        ? { texto: "text-green-600", chip: "bg-green-100 text-green-700" }
        : { texto: "text-red-600", chip: "bg-red-100 text-red-700" }
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">% dentro de meta</p>
            <p className={`text-2xl font-bold ${tono.texto}`}>
              {pct != null ? `${pct}%` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">objetivo DPO ≥ {OBJETIVO_PCT}%</p>
          </div>
          <div className={`rounded-full p-2 ${tono.chip}`}>
            <Target className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EquiposTable({
  equipos,
  desde7,
}: {
  equipos: TmlFoxtrotEquipo[]
  desde7: boolean
}) {
  if (equipos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay equipos operativos para esta fecha.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dominio</TableHead>
            <TableHead>Sucursal</TableHead>
            <TableHead>Chofer</TableHead>
            <TableHead>Ayudante</TableHead>
            <TableHead>Marca equipo</TableHead>
            <TableHead>Inicio ruta</TableHead>
            <TableHead className="text-right">TML</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {equipos.map((e) => {
            const c = estadoColor(e.estado)
            const tml = desde7 ? e.tml_minutos_desde7 : e.tml_minutos_real
            return (
              <TableRow key={`${e.camion_id}-${e.fecha}`} className={`border-l-4 ${c.border}`}>
                <TableCell className="font-mono text-sm">{e.dominio ?? "—"}</TableCell>
                <TableCell>
                  {e.sucursal ? (
                    <Badge variant="outline">{e.sucursal}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{e.chofer.nombre ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.chofer.hora_marca ? `marca ${e.chofer.hora_marca}` : "sin marca"}
                    {e.chofer.foxtrot_driver_id ? "" : " · sin map FX"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{e.ayudante.nombre ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.ayudante.hora_marca ? `marca ${e.ayudante.hora_marca}` : "sin marca"}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">{e.hora_marca_equipo ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm">{e.hora_inicio_ruta ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {tml != null ? (
                    <span
                      className={`flex items-center justify-end gap-1 font-mono font-semibold ${c.text}`}
                    >
                      <Clock className="h-3 w-3" />
                      {tml} min
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={`${c.bg} ${c.text} hover:${c.bg}`}>{c.label}</Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function ChoferesTable({
  choferes,
  desde7,
  meta,
}: {
  choferes: TmlFoxtrotChoferAgg[]
  desde7: boolean
  meta: number
}) {
  if (choferes.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay datos para el período seleccionado.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Chofer</TableHead>
            <TableHead>Sucursal</TableHead>
            <TableHead className="text-right">Días c/ruta</TableHead>
            <TableHead className="text-right">TML promedio</TableHead>
            <TableHead className="text-right">Peor</TableHead>
            <TableHead className="text-right">Mejor</TableHead>
            <TableHead className="text-right">Días fuera meta</TableHead>
            <TableHead className="text-right">% en meta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {choferes.map((c, i) => {
            const tml = desde7 ? c.tml_promedio_desde7 : c.tml_promedio_real
            const fuera = tml != null && tml > meta
            const border = fuera
              ? "border-l-red-500"
              : tml != null
                ? "border-l-green-500"
                : "border-l-amber-500"
            return (
              <TableRow
                key={c.empleado_id ?? `${c.nombre ?? "s/n"}-${i}`}
                className={`border-l-4 ${border}`}
              >
                <TableCell className="text-sm font-medium">{c.nombre ?? "—"}</TableCell>
                <TableCell>
                  {c.sucursal ? (
                    <Badge variant="outline">{c.sucursal}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{c.dias_con_ruta}</TableCell>
                <TableCell className="text-right">
                  {tml != null ? (
                    <span
                      className={`font-mono font-semibold ${
                        fuera ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {tml} min
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {c.tml_peor_real != null ? `${c.tml_peor_real}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {c.tml_mejor_real != null ? `${c.tml_mejor_real}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {c.dias_fuera_meta > 0 ? (
                    <span className="text-red-700">{c.dias_fuera_meta}</span>
                  ) : (
                    "0"
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {c.pct_dentro_meta != null ? `${c.pct_dentro_meta}%` : "—"}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function KpiBox({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: "green" | "red" | "slate"
}) {
  const colorMap: Record<string, string> = {
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    slate: "bg-slate-100 text-slate-700",
  }
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
              className={`text-2xl font-bold ${
                color === "red" ? "text-red-600" : "text-slate-900"
              }`}
            >
              {value}
            </p>
          </div>
          <div className={`rounded-full p-2 ${colorMap[color]}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
