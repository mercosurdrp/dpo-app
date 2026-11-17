"use client"

import { Fragment, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertTriangle, Info, Recycle } from "lucide-react"
import { DsEnvasesSeguimiento } from "./ds-envases-seguimiento"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  DS_ENVASES_CALIBRES,
  DS_ENVASES_CENTROS,
  DS_ENVASES_CORTE,
  DS_ENVASES_MESES,
} from "@/lib/ds-envases-data"

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })
const pf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })
const signo = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + nf.format(Math.abs(n))
const fecha = (iso: string) => iso.split("-").reverse().join("/")
const mesCorto = (k: string) => {
  const [a, m] = k.split("-")
  return `${MESES[+m - 1]} ${a.slice(2)}`
}
const mesLargo = (k: string) => {
  const [a, m] = k.split("-")
  return `${MESES_LARGO[+m - 1]} ${a}`
}

const COLOR_IN = "#15803d"
const COLOR_OUT = "#c2410c"
const COLOR_SALDO = "#1e3a8a"

/**
 * Tolerancia del semáforo: el neto acumulado contra lo retirado en los últimos
 * 12 meses. Hasta 1 % = equilibrado; hasta 3 % = a revisar; más = desbalance.
 */
const TOL_VERDE = 0.01
const TOL_AMARILLO = 0.03

export function DsEnvasesClient() {
  const filas = useMemo(() => {
    let acum = 0
    return DS_ENVASES_MESES.map((m) => {
      const neto = m.ingreso - m.retiro
      acum += neto
      return { ...m, neto, acum, hlNeto: m.hlIngreso - m.hlRetiro, label: mesCorto(m.mes) }
    })
  }, [])

  const tot = useMemo(() => {
    const ingreso = filas.reduce((s, f) => s + f.ingreso, 0)
    const retiro = filas.reduce((s, f) => s + f.retiro, 0)
    const movimientos = filas.reduce((s, f) => s + f.movimientos, 0)
    const hlIn = filas.reduce((s, f) => s + f.hlIngreso, 0)
    const hlOut = filas.reduce((s, f) => s + f.hlRetiro, 0)
    return { ingreso, retiro, movimientos, neto: ingreso - retiro, hlNeto: hlIn - hlOut, hlIn, hlOut }
  }, [filas])

  const ult12 = filas.slice(-12)
  const retiro12 = ult12.reduce((s, f) => s + f.retiro, 0)
  const desvio = Math.abs(tot.neto) / retiro12
  const estado = desvio <= TOL_VERDE ? "verde" : desvio <= TOL_AMARILLO ? "amarillo" : "rojo"
  const mesesEquilibrados = filas.filter((f) => f.neto === 0).length
  const ultimo = filas[filas.length - 1]

  const porAnio = useMemo(() => {
    const m = new Map<string, { ingreso: number; retiro: number; movimientos: number }>()
    for (const f of filas) {
      const a = f.mes.slice(0, 4)
      const r = m.get(a) ?? { ingreso: 0, retiro: 0, movimientos: 0 }
      r.ingreso += f.ingreso
      r.retiro += f.retiro
      r.movimientos += f.movimientos
      m.set(a, r)
    }
    return [...m.entries()]
  }, [filas])

  const filasDesc = [...filas].reverse()

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Recycle className="h-6 w-6 text-emerald-700" /> DS de Envases · Quilmes
          </h1>
          <p className="text-sm text-muted-foreground">
            Vacíos de vidrio retornable (RGB) devueltos y retirados en Quilmes por Mercosur Región
            Pampeana SRL
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          Actualizado al {fecha(DS_ENVASES_CORTE)}
        </Badge>
      </div>

      {/* Cómo estamos */}
      <Card
        className={
          estado === "verde"
            ? "border-emerald-300 bg-emerald-50"
            : estado === "amarillo"
              ? "border-amber-300 bg-amber-50"
              : "border-red-300 bg-red-50"
        }
      >
        <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center">
          <div className="flex items-center gap-3 md:w-1/3">
            {estado === "verde" ? (
              <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle
                className={`h-10 w-10 shrink-0 ${estado === "amarillo" ? "text-amber-600" : "text-red-600"}`}
              />
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cómo estamos</p>
              <p className="text-xl font-bold text-slate-900">
                {estado === "verde" ? "En equilibrio con Quilmes" : estado === "amarillo" ? "A revisar" : "Desbalance"}
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-700 md:w-2/3">
            En {filas.length} meses devolvimos <b>{nf.format(tot.ingreso)}</b> bultos y retiramos{" "}
            <b>{nf.format(tot.retiro)}</b>. El saldo acumulado es de <b>{signo(tot.neto)} bultos</b> (
            {signo(tot.hlNeto)} HL), un <b>{pf.format(desvio * 100)} %</b> de lo retirado en los últimos 12
            meses. {mesesEquilibrados} de {filas.length} meses cerraron en cero exacto. Cada movimiento tiene
            su N° de DT y remito de CMQ.
          </p>
        </CardContent>
      </Card>

      {/* Observación y plan de acción */}
      <DsEnvasesSeguimiento />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Devuelto (Ingreso)" valor={nf.format(tot.ingreso)} nota={`bultos · ${nf.format(tot.hlIn)} HL`} color={COLOR_IN} />
        <Kpi titulo="Retirado (Retiro)" valor={nf.format(tot.retiro)} nota={`bultos · ${nf.format(tot.hlOut)} HL`} color={COLOR_OUT} />
        <Kpi titulo="Saldo acumulado" valor={signo(tot.neto)} nota={`bultos · ${signo(tot.hlNeto)} HL`} color={COLOR_SALDO} />
        <Kpi
          titulo={`Último mes · ${mesLargo(ultimo.mes)}`}
          valor={signo(ultimo.neto)}
          nota={`${nf.format(ultimo.ingreso)} devueltos · ${nf.format(ultimo.retiro)} retirados`}
          color={COLOR_SALDO}
        />
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mes a mes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Bultos devueltos y retirados por mes; la línea es el saldo acumulado (eje derecho).
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filas} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={1} />
                <YAxis yAxisId="mov" tick={{ fontSize: 11 }} tickFormatter={(v) => `${nf.format(v / 1000)}k`} />
                <YAxis
                  yAxisId="acum"
                  orientation="right"
                  domain={[-10000, 10000]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => signo(v)}
                />
                <ReferenceLine yAxisId="acum" y={0} stroke="#94a3b8" />
                <Tooltip
                  formatter={(v, name) => [name === "Saldo acumulado" ? signo(Number(v)) : nf.format(Number(v)), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="mov" dataKey="ingreso" name="Devuelto" fill={COLOR_IN} />
                <Bar yAxisId="mov" dataKey="retiro" name="Retirado" fill={COLOR_OUT} />
                <Line
                  yAxisId="acum"
                  type="monotone"
                  dataKey="acum"
                  name="Saldo acumulado"
                  stroke={COLOR_SALDO}
                  strokeWidth={2.5}
                  dot={{ r: 2.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabla mes a mes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen mes a mes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Bultos. Neto = devuelto − retirado; positivo es que devolvimos más de lo que retiramos.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 text-left">Mes</th>
                <th className="px-3 py-2 text-right">Movim.</th>
                <th className="px-3 py-2 text-right">Devuelto</th>
                <th className="px-3 py-2 text-right">Retirado</th>
                <th className="px-3 py-2 text-right">Neto</th>
                <th className="px-3 py-2 text-right">Neto HL</th>
                <th className="pl-3 py-2 text-right">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody>
              {filasDesc.map((f, i) => {
                const nuevoAnio = i === 0 || filasDesc[i - 1].mes.slice(0, 4) !== f.mes.slice(0, 4)
                const anio = f.mes.slice(0, 4)
                const ra = porAnio.find(([a]) => a === anio)![1]
                return (
                  <Fragment key={f.mes}>
                    {nuevoAnio && (
                      <tr className="bg-slate-50 font-semibold">
                        <td className="py-2 pr-3">{anio}</td>
                        <td className="px-3 py-2 text-right">{nf.format(ra.movimientos)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: COLOR_IN }}>{nf.format(ra.ingreso)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: COLOR_OUT }}>{nf.format(ra.retiro)}</td>
                        <td className="px-3 py-2 text-right">{signo(ra.ingreso - ra.retiro)}</td>
                        <td className="px-3 py-2" />
                        <td className="pl-3 py-2" />
                      </tr>
                    )}
                    <tr className="border-b last:border-0">
                      <td className="py-1.5 pr-3 pl-3">{mesLargo(f.mes)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{nf.format(f.movimientos)}</td>
                      <td className="px-3 py-1.5 text-right">{nf.format(f.ingreso)}</td>
                      <td className="px-3 py-1.5 text-right">{nf.format(f.retiro)}</td>
                      <td className="px-3 py-1.5 text-right">
                        {f.neto === 0 ? (
                          <span className="text-emerald-700">0</span>
                        ) : (
                          <span className={f.neto > 0 ? "text-emerald-700" : "text-orange-700"}>{signo(f.neto)}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{signo(f.hlNeto)}</td>
                      <td className="pl-3 py-1.5 text-right font-medium">{signo(f.acum)}</td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className="py-2 pr-3">Total</td>
                <td className="px-3 py-2 text-right">{nf.format(tot.movimientos)}</td>
                <td className="px-3 py-2 text-right" style={{ color: COLOR_IN }}>{nf.format(tot.ingreso)}</td>
                <td className="px-3 py-2 text-right" style={{ color: COLOR_OUT }}>{nf.format(tot.retiro)}</td>
                <td className="px-3 py-2 text-right">{signo(tot.neto)}</td>
                <td className="px-3 py-2 text-right">{signo(tot.hlNeto)}</td>
                <td className="pl-3 py-2 text-right">{signo(tot.neto)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* Calibre y centro */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por calibre</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 text-left">Calibre</th>
                  <th className="px-3 py-2 text-right">Devuelto</th>
                  <th className="px-3 py-2 text-right">Retirado</th>
                  <th className="pl-3 py-2 text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                {DS_ENVASES_CALIBRES.map((c) => (
                  <tr key={c.calibre} className="border-b last:border-0">
                    <td className="py-1.5 pr-3">
                      {c.calibre}
                      <span className="ml-2 font-mono text-xs text-slate-400">{c.codigos.join(" · ")}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right">{nf.format(c.ingreso)}</td>
                    <td className="px-3 py-1.5 text-right">{nf.format(c.retiro)}</td>
                    <td className="pl-3 py-1.5 text-right font-medium">{signo(c.ingreso - c.retiro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por centro de Quilmes</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 text-left">Centro</th>
                  <th className="px-3 py-2 text-right">Movim.</th>
                  <th className="px-3 py-2 text-right">Devuelto</th>
                  <th className="px-3 py-2 text-right">Retirado</th>
                  <th className="pl-3 py-2 text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                {DS_ENVASES_CENTROS.map((c) => (
                  <tr key={c.centro} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-medium">{c.centro}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{nf.format(c.movimientos)}</td>
                    <td className="px-3 py-1.5 text-right">{nf.format(c.ingreso)}</td>
                    <td className="px-3 py-1.5 text-right">{nf.format(c.retiro)}</td>
                    <td className="pl-3 py-1.5 text-right font-medium">{signo(c.ingreso - c.retiro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Fuente */}
      <Card className="bg-slate-50">
        <CardContent className="flex gap-3 pt-6 text-sm text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="list-disc space-y-1 pl-4">
            <li>
              Fuente: DS de vacíos de Quilmes (Power BI). En el DS, Ingreso son los vacíos que devolvemos a Quilmes
              y Retiro los que retiramos.
            </li>
            <li>
              Filtros del reporte: categoría RGB, grupo comercial Mercosur Región Pampeana SRL, canal Distribuidores,
              status Activo.
            </li>
            <li>Un bulto equivale a 12 L (1.200 bultos = 144 HL). Cajones, barriles y paletas no están en este reporte.</li>
            <li>
              Semáforo: saldo acumulado contra lo retirado en los últimos 12 meses. Hasta {TOL_VERDE * 100} % en
              equilibrio, hasta {TOL_AMARILLO * 100} % a revisar, más es desbalance.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({ titulo, valor, nota, color }: { titulo: string; valor: string; nota: string; color: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{titulo}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color }}>
          {valor}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  )
}
