"use client"

import { useState, useTransition } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts"
import {
  Truck,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Package2,
  ClipboardList,
  Plus,
  AlertTriangle,
  CheckCircle2,
  PackageX,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { DqiPorPatenteCard } from "./_components/dqi-por-patente-card"
import { getDqi, crearPlanDqi, type DqiData } from "@/actions/dqi"
import { ROTURA_MOTIVO_LABELS, ROTURA_ESTADO_LABELS, ROTURA_TIPO_LABELS } from "@/types/roturas"

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const MESES_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

const fmtPPM = (n: number | null | undefined) =>
  n == null ? "—" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)} PPM`
const fmtHL = (n: number | null | undefined) =>
  n == null ? "—" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)} HL`
const fmtPesos = (n: number | null | undefined) => {
  if (n == null) return "—"
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  en_progreso: "bg-blue-100 text-blue-700",
  completado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-slate-100 text-slate-500",
}
const PRIORIDAD_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-slate-100 text-slate-600",
}

interface Props {
  initial: DqiData
  initialYear: number
  initialMonth: number
}

export function DqiClient({ initial, initialYear, initialMonth }: Props) {
  const [data, setData] = useState<DqiData>(initial)
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Dialog de plan de acción para un mes concreto
  const [planMonth, setPlanMonth] = useState<number | null>(null)
  const [descripcion, setDescripcion] = useState("")
  const [responsable, setResponsable] = useState("Supervisor de rutas")
  const [fechaLimite, setFechaLimite] = useState("")
  const [prioridad, setPrioridad] = useState<"alta" | "media" | "baja">("media")
  const [saving, setSaving] = useState(false)

  const reload = (y: number, m: number) => {
    setYear(y)
    setMonth(m)
    startTransition(async () => {
      const res = await getDqi(y, m)
      if ("error" in res) setError(res.error)
      else {
        setError(null)
        setData(res.data)
      }
    })
  }

  const dqi = data.dqi
  const det = data.detalle
  const target = data.target
  const vsLy = dqi.vs_ly_pct

  // Planes del año seleccionado, indexados por mes (1-12)
  const planesDelAnio = data.planes.filter((p) => p.year === year)
  const planesPorMes = new Map<number, typeof planesDelAnio>()
  for (const p of planesDelAnio) {
    if (p.month == null) continue
    const arr = planesPorMes.get(p.month) ?? []
    arr.push(p)
    planesPorMes.set(p.month, arr)
  }

  // Meses con desvío (DQI > target) que todavía no tienen plan
  const mesesDesvio: number[] = []
  if (target != null) {
    dqi.serie_real.forEach((v, i) => {
      if (v != null && v > target) mesesDesvio.push(i + 1)
    })
  }

  const chartData = MESES.map((m, i) => ({
    mes: m,
    [`Real ${year}`]: dqi.serie_real?.[i] != null ? +(+dqi.serie_real[i]!).toFixed(1) : null,
    [`LY ${year - 1}`]: dqi.serie_ly?.[i] != null ? +(+dqi.serie_ly[i]!).toFixed(1) : null,
  }))

  const openPlanDialog = (m: number) => {
    const val = dqi.serie_real?.[m - 1]
    setPlanMonth(m)
    setDescripcion(
      val != null
        ? `Reducir las roturas en distribución de ${MESES_FULL[m - 1]} ${year}: el DQI fue ${val} PPM` +
            (target != null ? ` (meta ${target} PPM).` : ".")
        : `Plan de acción de calidad de entrega — ${MESES_FULL[m - 1]} ${year}.`,
    )
    setResponsable("Supervisor de rutas")
    setFechaLimite("")
    setPrioridad(target != null && val != null && val > target ? "alta" : "media")
  }

  const guardarPlan = () => {
    if (planMonth == null) return
    setSaving(true)
    startTransition(async () => {
      const res = await crearPlanDqi({
        year,
        month: planMonth,
        descripcion,
        responsable,
        fecha_limite: fechaLimite || undefined,
        prioridad,
      })
      setSaving(false)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(`Plan de acción creado para ${MESES_FULL[planMonth - 1]} ${year}`)
      setPlanMonth(null)
      reload(year, month)
    })
  }

  // Dot interactivo: color por cumplimiento + anillo si el mes ya tiene plan
  const renderDot = (props: { cx?: number; cy?: number; index?: number; value?: number | null }) => {
    const { cx, cy, index } = props
    if (cx == null || cy == null || index == null) return <g key={`empty-${index}`} />
    const val = dqi.serie_real?.[index]
    if (val == null) return <g key={`null-${index}`} />
    const overTarget = target != null && val > target
    const color = overTarget ? "#ef4444" : "#059669"
    const tienePlan = planesPorMes.has(index + 1)
    return (
      <g key={`dot-${index}`} style={{ cursor: "pointer" }} onClick={() => openPlanDialog(index + 1)}>
        {/* área de click amplia */}
        <circle cx={cx} cy={cy} r={14} fill="transparent" />
        {tienePlan && <circle cx={cx} cy={cy} r={8} fill="none" stroke={color} strokeWidth={2} opacity={0.5} />}
        <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#fff" strokeWidth={1.5} />
      </g>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-600">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">DQI · Calidad de entrega</h1>
            <p className="text-sm text-muted-foreground">
              Roturas en distribución (ruta) ÷ HL entregados · Pilar Entrega DPO 1.4
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => reload(year, +e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {MESES_FULL.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => reload(+e.target.value, month)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => reload(year, month)}
            disabled={pending}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Recargar"
          >
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      {/* Métricas del mes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">DQI · {MESES_FULL[month - 1]}</p>
            <p className={`text-3xl font-bold ${target != null && dqi.mes != null && dqi.mes > target ? "text-red-600" : "text-emerald-700"}`}>
              {fmtPPM(dqi.mes)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Meta: {target != null ? fmtPPM(target) : "sin definir"}
            </p>
            {vsLy != null && (
              <p className={`mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium ${vsLy < 0 ? "text-emerald-600" : "text-red-500"}`}>
                {vsLy < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                {vsLy >= 0 ? "+" : ""}{vsLy.toFixed(1)}% vs año anterior
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Acumulado {year}</p>
            <p className="text-3xl font-bold text-slate-800">{fmtPPM(dqi.anual_acum)}</p>
            <p className="mt-1 text-xs text-slate-400">LY: {fmtPPM(dqi.ly_anual)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">HL rotos en ruta</p>
            <p className="text-3xl font-bold text-slate-800">{fmtHL(det.hl_mes)}</p>
            <p className="mt-1 text-xs text-slate-400">{fmtPesos(det.valor_mes)} en el mes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">% de las roturas</p>
            <p className="text-3xl font-bold text-slate-800">
              {det.pct_de_roturas != null ? `${det.pct_de_roturas}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">del total de roturas y derrames</p>
          </CardContent>
        </Card>
      </div>

      {/* Evolución mensual + plan de acción interactivo */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Evolución mensual · DQI (PPM)</h2>
            <span className="text-[11px] text-slate-400">Real {year} vs {year - 1}</span>
          </div>
          <p className="mb-3 inline-flex items-center gap-1 text-[11px] text-slate-400">
            <ClipboardList className="h-3 w-3" />
            Hacé click en un punto del mes para crear su plan de acción.
            <span className="ml-1 inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> desvío
              <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-600" /> en meta
            </span>
          </p>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v) => fmtPPM(Number(v))} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                {target != null && (
                  <ReferenceLine
                    y={target}
                    stroke="#ef4444"
                    strokeDasharray="5 4"
                    label={{ value: `Meta ${target}`, position: "right", fontSize: 10, fill: "#ef4444" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey={`Real ${year}`}
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={renderDot}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey={`LY ${year - 1}`}
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chips de meses en desvío (acceso rápido al plan) */}
          {mesesDesvio.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                <AlertTriangle className="h-3 w-3" /> Meses sobre la meta:
              </span>
              {mesesDesvio.map((m) => {
                const tiene = planesPorMes.has(m)
                return (
                  <button
                    key={m}
                    onClick={() => openPlanDialog(m)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      tiene
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    {tiene ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {MESES[m - 1]} · {fmtPPM(dqi.serie_real[m - 1])}
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Planes de acción del año */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-700">Planes de acción · DQI {year}</h2>
          </div>
          {planesDelAnio.length ? (
            <div className="space-y-2">
              {planesDelAnio
                .slice()
                .sort((a, b) => (b.month ?? 0) - (a.month ?? 0))
                .map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
                    <div className="min-w-0">
                      <div className="mb-0.5 flex items-center gap-2">
                        {p.month != null && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {MESES[p.month - 1]} {p.year}
                          </span>
                        )}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${PRIORIDAD_BADGE[p.prioridad] ?? "bg-slate-100 text-slate-600"}`}>
                          {p.prioridad}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ESTADO_BADGE[p.estado] ?? "bg-slate-100 text-slate-600"}`}>
                          {p.estado}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{p.descripcion}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {p.responsable ?? "—"}
                        {p.fecha_limite ? ` · vence ${p.fecha_limite}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">
              Sin planes cargados para {year}. Hacé click en un punto del gráfico para crear el primero.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top SKUs rotos en ruta */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center gap-2">
            <Package2 className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-700">
              Top SKUs rotos en ruta · {MESES_FULL[month - 1]} {year}
            </h2>
          </div>
          {det.top_skus?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-2 py-2 text-left font-medium">SKU</th>
                  <th className="px-2 py-2 text-right font-medium">Unidades</th>
                  <th className="px-2 py-2 text-right font-medium">HL</th>
                  <th className="px-2 py-2 text-right font-medium">$</th>
                </tr>
              </thead>
              <tbody>
                {det.top_skus.map((s) => (
                  <tr key={s.codigo} className="border-b border-slate-50">
                    <td className="px-2 py-2 text-slate-700">{s.descripcion}</td>
                    <td className="px-2 py-2 text-right font-mono text-slate-600">
                      {new Intl.NumberFormat("es-AR").format(s.unidades)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-emerald-700">{fmtHL(s.hl)}</td>
                    <td className="px-2 py-2 text-right font-mono text-slate-700">{fmtPesos(s.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">
              Sin roturas de distribución registradas en {MESES_FULL[month - 1]} {year}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* DQI por camión: el mismo PPM, repartido por patente */}
      <DqiPorPatenteCard year={year} month={month} target={data.target} />

      {/* Roturas reportadas por choferes desde la app (registro, no recalcula el PPM) */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center gap-2">
            <PackageX className="h-4 w-4 text-orange-600" />
            <h2 className="text-sm font-semibold text-slate-700">
              Roturas reportadas por choferes · {MESES_FULL[month - 1]} {year}
            </h2>
          </div>
          {data.roturas_chofer?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="px-2 py-2 text-left font-medium">Fecha</th>
                    <th className="px-2 py-2 text-left font-medium">Patente</th>
                    <th className="px-2 py-2 text-left font-medium">Chofer</th>
                    <th className="px-2 py-2 text-left font-medium">Tipo</th>
                    <th className="px-2 py-2 text-left font-medium">SKU</th>
                    <th className="px-2 py-2 text-left font-medium">Motivo</th>
                    <th className="px-2 py-2 text-center font-medium">Foto</th>
                    <th className="px-2 py-2 text-left font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.roturas_chofer.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 align-top">
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600">
                        {r.fecha.split("-").reverse().join("/")}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 font-mono text-slate-700">{r.patente}</td>
                      <td className="px-2 py-2 text-slate-600">{r.chofer_nombre ?? r.autor_nombre}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600">{ROTURA_TIPO_LABELS[r.tipo]}</td>
                      <td className="px-2 py-2 text-slate-700">
                        <ul className="space-y-0.5">
                          {r.items.map((it) => (
                            <li key={it.id} className="truncate">
                              <span className="font-mono text-xs text-slate-400">{it.id_articulo}</span>{" "}
                              {it.des_articulo} · <strong>{it.cantidad}</strong>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-2 py-2 text-slate-600">{ROTURA_MOTIVO_LABELS[r.motivo]}</td>
                      <td className="px-2 py-2 text-center">
                        {r.adjuntos[0] ? (
                          <a href={r.adjuntos[0].url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.adjuntos[0].url}
                              alt="Foto"
                              className="mx-auto size-10 rounded object-cover"
                            />
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-slate-600">{ROTURA_ESTADO_LABELS[r.estado]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">
              Sin roturas reportadas por choferes en {MESES_FULL[month - 1]} {year}.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            Cargadas por los choferes desde la app (Portal del Empleado → Roturas en calle). Es un registro; no recalcula el PPM.
          </p>
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-slate-400">
        Fuente: tablero de pérdidas (deposito-esteban) · categoría <code>ROTURA DISTRIBUCIÓN</code> ÷ HL entregados
      </p>

      {/* Dialog crear plan de acción */}
      <Dialog open={planMonth != null} onOpenChange={(o) => !o && setPlanMonth(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Plan de acción · {planMonth != null ? `${MESES_FULL[planMonth - 1]} ${year}` : ""}
            </DialogTitle>
            <DialogDescription>
              {planMonth != null && dqi.serie_real?.[planMonth - 1] != null ? (
                <>
                  DQI del mes: <strong>{fmtPPM(dqi.serie_real[planMonth - 1])}</strong>
                  {target != null && (
                    <>
                      {" "}· meta {fmtPPM(target)} ·{" "}
                      {dqi.serie_real[planMonth - 1]! > target ? (
                        <span className="text-red-600">en desvío</span>
                      ) : (
                        <span className="text-emerald-600">en meta</span>
                      )}
                    </>
                  )}
                </>
              ) : (
                "Definí una acción para mejorar la calidad de entrega de este mes."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="dqi-desc">Descripción</Label>
              <Textarea
                id="dqi-desc"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="dqi-resp">Responsable</Label>
                <Input id="dqi-resp" value={responsable} onChange={(e) => setResponsable(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="dqi-fecha">Fecha límite</Label>
                <Input id="dqi-fecha" type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="dqi-prio">Prioridad</Label>
              <select
                id="dqi-prio"
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as "alta" | "media" | "baja")}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanMonth(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={guardarPlan} disabled={saving || !descripcion.trim()}>
              {saving ? "Guardando…" : "Crear plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
