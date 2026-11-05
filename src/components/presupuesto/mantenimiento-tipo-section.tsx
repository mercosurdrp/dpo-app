"use client"

import { useMemo } from "react"
import Link from "next/link"
import { AlertTriangle, Wrench } from "lucide-react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { EjecucionRubro } from "@/actions/presupuesto-generador"
import {
  agregarPeriodo,
  agregarPorDominio,
  agregarPorMes,
  esRubroMantenimientoFlota,
  pctCorrectivo,
  TIPO_MANTENIMIENTO_BADGE,
  TIPO_MANTENIMIENTO_COLOR,
  TIPO_MANTENIMIENTO_LABEL,
  TIPOS_MANTENIMIENTO,
  type AgregadoTipo,
  type MantenimientoPorTipo,
} from "@/lib/presupuesto/mantenimiento-tipo"
import type { MantenimientoTipo } from "@/types/database"

const MES_CORTO = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
const MES_LARGO = [
  "",
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

const COLOR_EERR_REAL = "#0f172a"
const COLOR_EERR_PPTO = "#94a3b8"

function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

function moneyCorto(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(".", ",")} M`
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)} k`
  return `$${Math.round(n)}`
}

function pct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(0)} %`
}

/** Presupuestado y real del EERR, por mes, de los rubros de mantenimiento de flota. */
function eerrMantenimiento(ejecucion: Record<string, EjecucionRubro>) {
  const rubros = Object.keys(ejecucion).filter(esRubroMantenimientoFlota)
  const presup = new Map<number, number>()
  const real = new Map<number, number>()
  for (const r of rubros) {
    for (const m of ejecucion[r].porMes) {
      presup.set(m.mes, (presup.get(m.mes) ?? 0) + m.presup)
      real.set(m.mes, (real.get(m.mes) ?? 0) + m.real)
    }
  }
  return { rubros, presup, real }
}

/** Color del % correctivo: la regla de la pirámide de flota es que el correctivo no mande. */
function colorPct(p: number | null): string {
  if (p === null) return "text-slate-500"
  if (p >= 50) return "text-red-600"
  if (p >= 30) return "text-amber-600"
  return "text-emerald-600"
}

interface Props {
  data: MantenimientoPorTipo | null
  error?: string | null
  anio: number
  /** Mes activo del filtro de la tabla; 0 = todos los meses. */
  mes: number
  ejecucionRubros: Record<string, EjecucionRubro>
}

export function MantenimientoTipoSection({ data, error, anio, mes, ejecucionRubros }: Props) {
  const porMes = useMemo(() => agregarPorMes(data?.filas ?? []), [data])
  const eerr = useMemo(() => eerrMantenimiento(ejecucionRubros), [ejecucionRubros])

  // Período que resumen las tarjetas: el mes elegido o el año hasta el último mes con OT.
  const ultimoMes = data?.ultimoMes ?? 0
  const mesesPeriodo = useMemo(() => {
    if (mes >= 1 && mes <= 12) return [mes]
    return Array.from({ length: Math.max(ultimoMes, 1) }, (_, i) => i + 1)
  }, [mes, ultimoMes])
  const periodo: AgregadoTipo = useMemo(
    () => agregarPeriodo(data?.filas ?? [], mesesPeriodo),
    [data, mesesPeriodo],
  )
  const porDominio = useMemo(
    () => agregarPorDominio(data?.filas ?? [], mesesPeriodo).filter((d) => d.total > 0 || d.totalOt > 0),
    [data, mesesPeriodo],
  )

  // Tendencia (R3.2: el PI debe mejorar en los últimos 3 meses): % correctivo de
  // los últimos 3 meses con OT contra los 3 anteriores.
  const tendencia = useMemo(() => {
    if (!data || ultimoMes < 2) return null
    const ult = [ultimoMes - 2, ultimoMes - 1, ultimoMes].filter((m) => m >= 1)
    const ant = [ultimoMes - 5, ultimoMes - 4, ultimoMes - 3].filter((m) => m >= 1)
    const pUlt = pctCorrectivo(agregarPeriodo(data.filas, ult))
    const pAnt = ant.length ? pctCorrectivo(agregarPeriodo(data.filas, ant)) : null
    return { ult, ant, pUlt, pAnt }
  }, [data, ultimoMes])

  const hastaMes = Math.max(ultimoMes, ...[...eerr.real.keys()], 1)
  const chartData = porMes
    .filter((m) => m.mes <= hastaMes)
    .map((m) => ({
      mes: MES_CORTO[m.mes],
      preventivo: m.costo.preventivo,
      correctivo: m.costo.correctivo,
      proactivo: m.costo.proactivo,
      eerrReal: eerr.real.get(m.mes) ?? null,
      eerrPpto: eerr.presup.get(m.mes) ?? null,
    }))

  const tituloPeriodo =
    mes >= 1 && mes <= 12 ? `${MES_LARGO[mes]} ${anio}` : `Acumulado ${anio}`

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Wrench className="size-4 text-orange-600" />
          Gasto de mantenimiento por tipo · preventivo vs correctivo
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-600">
            {tituloPeriodo}
          </span>
        </h2>
        <Link
          href="/vehiculos/mantenimiento"
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          Ver órdenes de trabajo →
        </Link>
      </div>

      {error && !data && (
        <Card>
          <CardContent className="py-6 text-sm text-red-600">
            No se pudo leer el mantenimiento: {error}
          </CardContent>
        </Card>
      )}

      {data && data.totalOt === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No hay órdenes de trabajo cargadas en {anio}. El gasto preventivo vs
            correctivo sale de las OT de{" "}
            <Link href="/vehiculos/mantenimiento" className="text-blue-600 hover:underline">
              Mantenimiento de flota
            </Link>
            .
          </CardContent>
        </Card>
      )}

      {data && data.totalOt > 0 && (
        <div className="space-y-4">
          {/* Tarjetas del período */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {TIPOS_MANTENIMIENTO.map((t) => (
              <Card key={t}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {TIPO_MANTENIMIENTO_LABEL[t]}
                    </p>
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: TIPO_MANTENIMIENTO_COLOR[t] }}
                    />
                  </div>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {money(periodo.costo[t])}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {periodo.ot[t]} {periodo.ot[t] === 1 ? "OT" : "OTs"}
                    {periodo.total > 0 && (
                      <> · {pct((periodo.costo[t] / periodo.total) * 100)} del gasto</>
                    )}
                  </p>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total mantenimiento</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {money(periodo.total)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {periodo.totalOt} OTs
                  {periodo.sinCosto > 0 && (
                    <span className="ml-1 text-amber-600">
                      · {periodo.sinCosto} sin costo
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">% correctivo</p>
                <p className={`mt-1 text-xl font-semibold ${colorPct(pctCorrectivo(periodo))}`}>
                  {pct(pctCorrectivo(periodo))}
                </p>
                {tendencia && tendencia.pUlt !== null && (
                  <p className="text-xs text-muted-foreground">
                    {MES_CORTO[tendencia.ult[0]]}–{MES_CORTO[tendencia.ult[tendencia.ult.length - 1]]}:{" "}
                    <span className={colorPct(tendencia.pUlt)}>{pct(tendencia.pUlt)}</span>
                    {tendencia.pAnt !== null && (
                      <>
                        {" "}
                        vs {MES_CORTO[tendencia.ant[0]]}–{MES_CORTO[tendencia.ant[tendencia.ant.length - 1]]}:{" "}
                        {pct(tendencia.pAnt)}
                        {tendencia.pUlt < tendencia.pAnt ? " ↓" : tendencia.pUlt > tendencia.pAnt ? " ↑" : ""}
                      </>
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Gráfico mes a mes */}
          <Card>
            <CardContent className="pt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                Gasto por mes según el tipo de OT
                {eerr.rubros.length > 0 && (
                  <>
                    {" "}
                    · líneas: lo que el Estado de Resultado imputó a{" "}
                    <span title={eerr.rubros.join(" · ")} className="underline decoration-dotted">
                      {eerr.rubros.length} {eerr.rubros.length === 1 ? "rubro" : "rubros"} de mantenimiento
                    </span>
                  </>
                )}
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={moneyCorto} tick={{ fontSize: 11 }} width={64} />
                    <Tooltip
                      formatter={(v, name) => [money(typeof v === "number" ? v : Number(v)), String(name)]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {TIPOS_MANTENIMIENTO.map((t) => (
                      <Bar
                        key={t}
                        dataKey={t}
                        stackId="ot"
                        name={TIPO_MANTENIMIENTO_LABEL[t]}
                        fill={TIPO_MANTENIMIENTO_COLOR[t]}
                        maxBarSize={40}
                      />
                    ))}
                    {eerr.rubros.length > 0 && (
                      <>
                        <Line
                          type="monotone"
                          dataKey="eerrPpto"
                          name="EERR presupuestado"
                          stroke={COLOR_EERR_PPTO}
                          strokeDasharray="4 4"
                          dot={false}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="eerrReal"
                          name="EERR real"
                          stroke={COLOR_EERR_REAL}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Tabla mensual */}
            <div className="rounded-lg border bg-white lg:col-span-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Preventivo</TableHead>
                    <TableHead className="text-right">Correctivo</TableHead>
                    <TableHead className="text-right">Proactivo</TableHead>
                    <TableHead className="text-right">Total OT</TableHead>
                    <TableHead className="text-right">% corr.</TableHead>
                    {eerr.rubros.length > 0 && (
                      <>
                        <TableHead className="text-right">EERR ppto.</TableHead>
                        <TableHead className="text-right">EERR real</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porMes
                    .filter((m) => m.mes <= hastaMes)
                    .map((m) => {
                      const activo = mes === m.mes
                      const p = pctCorrectivo(m)
                      return (
                        <TableRow key={m.mes} className={activo ? "bg-orange-50/60" : undefined}>
                          <TableCell className="text-sm font-medium">
                            {MES_LARGO[m.mes]}
                            {m.sinCosto > 0 && (
                              <span
                                className="ml-1 text-[11px] text-amber-600"
                                title={`${m.sinCosto} OT sin costo cargado`}
                              >
                                ({m.sinCosto} s/costo)
                              </span>
                            )}
                          </TableCell>
                          {TIPOS_MANTENIMIENTO.map((t) => (
                            <TableCell key={t} className="whitespace-nowrap text-right text-sm">
                              {m.ot[t] > 0 ? (
                                <>
                                  {money(m.costo[t])}
                                  <span className="ml-1 text-[11px] text-muted-foreground">
                                    ({m.ot[t]})
                                  </span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell className="whitespace-nowrap text-right text-sm font-medium">
                            {m.totalOt > 0 ? money(m.total) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className={`text-right text-sm font-medium ${colorPct(p)}`}>
                            {pct(p)}
                          </TableCell>
                          {eerr.rubros.length > 0 && (
                            <>
                              <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                                {money(eerr.presup.get(m.mes) ?? null)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right text-sm">
                                {money(eerr.real.get(m.mes) ?? null)}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      )
                    })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="text-sm font-semibold">Total {anio}</TableCell>
                    {TIPOS_MANTENIMIENTO.map((t) => (
                      <TableCell key={t} className="whitespace-nowrap text-right text-sm font-semibold">
                        {money(porMes.reduce((a, m) => a + m.costo[t], 0))}
                      </TableCell>
                    ))}
                    <TableCell className="whitespace-nowrap text-right text-sm font-semibold">
                      {money(porMes.reduce((a, m) => a + m.total, 0))}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {pct(pctCorrectivo(agregarPeriodo(data.filas, porMes.map((m) => m.mes))))}
                    </TableCell>
                    {eerr.rubros.length > 0 && (
                      <>
                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold text-muted-foreground">
                          {money([...eerr.presup.values()].reduce((a, b) => a + b, 0))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold">
                          {money([...eerr.real.values()].reduce((a, b) => a + b, 0))}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {/* Unidades con más correctivo en el período */}
            <div className="rounded-lg border bg-white lg:col-span-2">
              <div className="border-b px-4 py-2">
                <p className="text-sm font-semibold text-slate-700">
                  Correctivo por unidad · {tituloPeriodo}
                </p>
                <p className="text-xs text-muted-foreground">
                  Dónde se va el correctivo: la primera pista para el motivo del desvío.
                </p>
              </div>
              {porDominio.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  Sin OT en el período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Correctivo</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">% corr.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porDominio.slice(0, 8).map((d) => (
                      <TableRow key={d.dominio}>
                        <TableCell className="text-sm font-medium">
                          {d.dominio}
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            {d.totalOt} OT
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm">
                          {d.ot.correctivo > 0 ? money(d.costo.correctivo) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm">
                          {money(d.total)}
                        </TableCell>
                        <TableCell className={`text-right text-sm font-medium ${colorPct(pctCorrectivo(d))}`}>
                          {pct(pctCorrectivo(d))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {porDominio.length > 8 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">
                  y {porDominio.length - 8} unidades más con menos correctivo.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2 text-xs text-muted-foreground">
            <span>
              Fuente: órdenes de trabajo de Mantenimiento de flota (no canceladas), por fecha
              de la OT y con el costo cargado en cada una. Tipos:
            </span>
            {TIPOS_MANTENIMIENTO.map((t: MantenimientoTipo) => (
              <Badge key={t} variant="outline" className={TIPO_MANTENIMIENTO_BADGE[t]}>
                {TIPO_MANTENIMIENTO_LABEL[t]}
              </Badge>
            ))}
            {periodo.sinCosto > 0 && (
              <span className="flex items-center gap-1 text-amber-700">
                <AlertTriangle className="size-3.5" />
                {periodo.sinCosto} {periodo.sinCosto === 1 ? "OT" : "OTs"} del período sin costo: cargarlo
                para que el gasto esté completo.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
