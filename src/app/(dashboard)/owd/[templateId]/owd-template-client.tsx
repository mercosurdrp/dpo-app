"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ComposedChart,
  Bar,
  Line,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts"
import type { OwdObservacion, OwdMensual, OwdItemStats } from "@/types/database"
import {
  Plus,
  ClipboardCheck,
  Target,
  AlertTriangle,
  CalendarCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

const TODOS = "todos"

interface KpiData {
  totalObservaciones: number
  promedioCumplimiento: number
  obsMesActual: number
  metaMensual: number
  metaCumplimiento: number
  mensual: OwdMensual[]
  porEtapa: Array<{ etapa: string; pct: number; total: number }>
  itemsMasFallados: OwdItemStats[]
}

interface Contexto {
  template: { id: string; nombre: string; descripcion: string | null }
  pregunta_numero: string
  pregunta_texto: string
  pilar_nombre: string
  pilar_color: string
}

interface Props {
  templateId: string
  contexto: Contexto
  kpis: KpiData
  observaciones: OwdObservacion[]
  isAdmin: boolean
}

function PctBadge({ pct }: { pct: number }) {
  if (pct >= 90) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{pct.toFixed(0)}%</Badge>
  if (pct >= 75) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{pct.toFixed(0)}%</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{pct.toFixed(0)}%</Badge>
}

const monthKey = (m: OwdMensual) => `${m.year}-${String(m.mes).padStart(2, "0")}`
const monthLabel = (m: OwdMensual) => `${MESES[m.mes]} ${m.year}`

export function OwdTemplateClient({ templateId, contexto, kpis, observaciones, isAdmin }: Props) {
  const meta = kpis.metaCumplimiento

  // Meses con datos, orden cronológico ascendente
  const meses = useMemo(
    () => [...kpis.mensual].sort((a, b) => a.year - b.year || a.mes - b.mes),
    [kpis.mensual]
  )

  // Mes seleccionado: por defecto el más reciente; TODOS = vista global
  const [selected, setSelected] = useState<string>(
    meses.length ? monthKey(meses[meses.length - 1]) : TODOS
  )

  const idx = meses.findIndex((m) => monthKey(m) === selected)
  const mesSel = idx >= 0 ? meses[idx] : null
  const esTodos = selected === TODOS

  const goPrev = () => {
    if (esTodos && meses.length) return setSelected(monthKey(meses[meses.length - 1]))
    if (idx > 0) setSelected(monthKey(meses[idx - 1]))
  }
  const goNext = () => {
    if (idx >= 0 && idx < meses.length - 1) setSelected(monthKey(meses[idx + 1]))
  }

  // Observaciones filtradas por el mes elegido (fecha = YYYY-MM-DD)
  const obsFiltradas = useMemo(
    () => (esTodos ? observaciones : observaciones.filter((o) => o.fecha?.startsWith(selected))),
    [observaciones, selected, esTodos]
  )

  // KPIs que responden al selector de mes
  const pctShown = esTodos ? kpis.promedioCumplimiento : mesSel?.promedio_cumplimiento ?? 0
  const obsCount = esTodos ? kpis.obsMesActual : mesSel?.total_observaciones ?? 0
  const obsCountLabel = esTodos ? "Mes actual" : monthLabel(mesSel!)

  // Serie de evolución (todos los meses); resalta el seleccionado
  const evolData = meses.map((m) => ({
    key: monthKey(m),
    name: `${MESES[m.mes]} '${String(m.year).slice(2)}`,
    cumplimiento: m.promedio_cumplimiento,
    total: m.total_observaciones,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: contexto.pilar_color }}
            />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {contexto.pilar_nombre} · {contexto.pregunta_numero}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{contexto.template.nombre}</h1>
          <p className="text-sm text-muted-foreground">{contexto.pregunta_texto}</p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          {isAdmin && (
            <Link href={`/owd/admin/${templateId}`}>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" /> Editar plantilla
              </Button>
            </Link>
          )}
          <Link href={`/owd/${templateId}/nueva`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Nueva OWD
            </Button>
          </Link>
        </div>
      </div>

      {/* Navegador de meses */}
      {meses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 p-2">
          <span className="px-1 text-sm font-medium text-slate-600">Período:</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goPrev}
            disabled={!esTodos && idx <= 0}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-wrap gap-1">
            {meses.map((m) => {
              const k = monthKey(m)
              const active = k === selected
              return (
                <button
                  key={k}
                  onClick={() => setSelected(k)}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-100 border"
                  }`}
                >
                  {monthLabel(m)}
                </button>
              )
            })}
            <button
              onClick={() => setSelected(TODOS)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                esTodos ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border"
              }`}
            >
              Todos
            </button>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goNext}
            disabled={esTodos || idx >= meses.length - 1}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">% Cumplimiento</p>
                <p
                  className={`text-3xl font-bold ${
                    pctShown >= meta
                      ? "text-green-600"
                      : pctShown >= meta - 15
                      ? "text-amber-600"
                      : "text-red-600"
                  }`}
                >
                  {pctShown.toFixed(1)}%
                </p>
              </div>
              <div
                className={`rounded-full p-3 ${pctShown >= meta ? "bg-green-100" : "bg-amber-100"}`}
              >
                <Target
                  className={`h-5 w-5 ${pctShown >= meta ? "text-green-600" : "text-amber-600"}`}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {esTodos ? "Promedio histórico" : monthLabel(mesSel!)} · Meta ≥ {meta.toFixed(0)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Observaciones</p>
                <p className="text-3xl font-bold text-slate-900">
                  {obsCount}
                  <span className="text-lg font-normal text-muted-foreground">
                    /{kpis.metaMensual}
                  </span>
                </p>
              </div>
              <div className="rounded-full bg-blue-100 p-3">
                <CalendarCheck className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {obsCountLabel} · Meta {kpis.metaMensual}/mes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total acumulado</p>
                <p className="text-3xl font-bold text-slate-900">{kpis.totalObservaciones}</p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <ClipboardCheck className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Observaciones cargadas (histórico)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ítems con desvíos</p>
                <p className="text-3xl font-bold text-red-600">{kpis.itemsMasFallados.length}</p>
              </div>
              <div className="rounded-full bg-red-100 p-3">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Top 5 no conformes (histórico)</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolución mensual</CardTitle>
            <p className="text-xs text-muted-foreground">
              Barras = observaciones cargadas · Línea = % cumplimiento (clic en un mes para filtrar)
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {evolData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sin datos
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={evolData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis yAxisId="left" fontSize={11} allowDecimals={false} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      fontSize={11}
                      unit="%"
                      domain={[0, 100]}
                    />
                    <Tooltip
                      formatter={(v, n) =>
                        n === "cumplimiento" ? [`${v}%`, "Cumplimiento"] : [v, "Observaciones"]
                      }
                    />
                    <ReferenceLine
                      yAxisId="right"
                      y={meta}
                      stroke="#10B981"
                      strokeDasharray="5 5"
                      label={{ value: `Meta ${meta.toFixed(0)}%`, position: "right", fontSize: 10 }}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="total"
                      radius={[4, 4, 0, 0]}
                      onClick={(d) => {
                        const k = (d as { payload?: { key?: string } })?.payload?.key
                        if (k) setSelected(k)
                      }}
                      cursor="pointer"
                    >
                      {evolData.map((e) => (
                        <Cell
                          key={e.key}
                          fill={!esTodos && e.key === selected ? "#1e293b" : "#cbd5e1"}
                        />
                      ))}
                    </Bar>
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="cumplimiento"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={{ fill: "#10B981", r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">% Cumplimiento por Etapa</CardTitle>
            <p className="text-xs text-muted-foreground">Histórico acumulado</p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {kpis.porEtapa.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sin datos
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kpis.porEtapa} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" fontSize={11} unit="%" domain={[0, 100]} />
                    <YAxis type="category" dataKey="etapa" fontSize={10} width={120} />
                    <Tooltip formatter={(v) => [`${v}%`, "Cumplimiento"]} />
                    <ReferenceLine x={meta} stroke="#10B981" strokeDasharray="5 5" />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                      {kpis.porEtapa.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.pct >= meta ? "#10B981" : entry.pct >= meta - 15 ? "#F59E0B" : "#EF4444"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top fallados */}
      {kpis.itemsMasFallados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 5 ítems con desvíos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {kpis.itemsMasFallados.map((item) => (
                <div
                  key={item.item_id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-slate-50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{item.etapa}</p>
                    <p className="text-sm font-medium text-slate-900">{item.texto}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {item.total_nook} NO OK
                    </Badge>
                    <PctBadge pct={item.pct_cumplimiento} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla observaciones (filtradas por mes) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Observaciones {esTodos ? "(todas)" : `· ${monthLabel(mesSel!)}`}
          </CardTitle>
          <Link href={`/owd/${templateId}/nueva`}>
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-4 w-4" /> Nueva
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {obsFiltradas.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {esTodos
                ? "Todavía no hay observaciones cargadas. Iniciá la primera OWD del equipo."
                : `Sin observaciones cargadas en ${monthLabel(mesSel!)}.`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Supervisor</TableHead>
                    <TableHead>Empleado observado</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead className="text-right">OK/NOOK</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {obsFiltradas.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-sm">{o.fecha}</TableCell>
                      <TableCell className="text-sm">{o.supervisor}</TableCell>
                      <TableCell className="text-sm font-medium">{o.empleado_observado}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {o.rol_empleado || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="text-green-600">{o.total_ok}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="text-red-600">{o.total_nook}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <PctBadge pct={Number(o.pct_cumplimiento)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/owd/${templateId}/${o.id}`}>
                          <Button variant="ghost" size="sm">
                            Ver
                          </Button>
                        </Link>
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
