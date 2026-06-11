"use client"

import { useState } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"
import { CheckCircle2, HeartHandshake, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { NpsClienteDP, NpsDashboardData } from "@/actions/nps"
import type { NpsPlan } from "@/actions/nps-planes"
import { ClientesExplorador } from "./clientes-explorador"
import { PlanesAccionBloque } from "./planes/planes-accion-bloque"

const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
]

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

const FMT_DIA_HORA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
})

function npsColor(nps: number): string {
  if (nps >= 75) return "text-emerald-600"
  if (nps >= 50) return "text-amber-600"
  return "text-red-600"
}

function npsBadge(nps: number): string {
  if (nps >= 75) return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (nps >= 50) return "bg-amber-100 text-amber-800 border-amber-200"
  return "bg-red-100 text-red-800 border-red-200"
}

interface Props {
  data: NpsDashboardData
  planesIniciales: NpsPlan[]
}

export function NpsClient({ data, planesIniciales }: Props) {
  const { resumen, por_mes, drivers_dp, por_promotor, clientes_dp } = data

  // Foco prellenado al crear un plan desde la tabla de detractores.
  const [focoPlan, setFocoPlan] = useState<{
    foco_cliente_id?: number
    foco_cliente_nombre?: string
    foco_driver?: string
    foco_promotor?: string
  } | null>(null)
  const [abrirPlanNonce, setAbrirPlanNonce] = useState(0)

  function planParaCliente(c: NpsClienteDP) {
    setFocoPlan({
      foco_cliente_id: c.cod_cliente,
      foco_cliente_nombre: c.nombre_cliente,
      foco_driver: c.drivers[0],
      foco_promotor: c.promotor ?? undefined,
    })
    setAbrirPlanNonce((n) => n + 1)
  }

  const mesesConDatos = por_mes.filter((m) => m.encuestas > 0 || m.rmd != null)
  const chartEvolucion = mesesConDatos.map((m) => ({
    mes: MESES[m.mes - 1],
    NPS: m.nps,
    Encuestas: m.encuestas,
    Detractores: m.detractores,
  }))
  const chartCruce = mesesConDatos.map((m) => ({
    mes: MESES[m.mes - 1],
    NPS: m.nps,
    "RMD (1-5)": m.rmd,
    "OTIF interno %": m.otif_interno,
  }))

  const maxDriver = drivers_dp[0]?.encuestas_dp ?? 1
  const detractores = clientes_dp.filter((c) => c.categoria === "Detractor")
  const pasivos = clientes_dp.filter((c) => c.categoria === "Passive")

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <HeartHandshake className="h-6 w-6 text-slate-500" />
          NPS — Análisis y plan centrado en el cliente
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Punto 4.1 de Planeamiento (DPO) · Encuestas NPS de BEES (Power BI
          Quilmes) cruzadas con el promotor de preventa de Chess. Año{" "}
          {resumen.anio}.
          {resumen.actualizado_en && (
            <span className="ml-1 text-slate-400">
              Datos actualizados el{" "}
              {FMT_DIA_HORA.format(new Date(resumen.actualizado_en))} hs
              (sincronización automática cada 15 días).
            </span>
          )}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              NPS acumulado {resumen.anio}
            </p>
            <p className={`text-3xl font-bold ${npsColor(resumen.nps)}`}>
              {resumen.nps.toFixed(1)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              % promotores − % detractores
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Encuestas
            </p>
            <p className="text-3xl font-bold text-slate-900">
              {resumen.encuestas}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {resumen.promoters} prom · {resumen.pasivos} pas ·{" "}
              {resumen.detractores} det
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Clientes detractores
            </p>
            <p className="text-3xl font-bold text-red-600">
              {detractores.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              + {pasivos.length} pasivos a recuperar
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              RMD {resumen.anio}
            </p>
            <p className="text-3xl font-bold text-slate-900">
              {resumen.rmd != null ? resumen.rmd.toFixed(2) : "—"}
              <span className="text-base font-normal text-slate-400"> /5</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {resumen.rmd_respuestas.toLocaleString("es-AR")} entregas
              puntuadas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Última encuesta
            </p>
            <p className="text-xl font-bold text-slate-900">
              {resumen.ultima_encuesta
                ? FMT_DIA.format(new Date(resumen.ultima_encuesta))
                : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              R4.1.1: recopilada en los últimos 3 meses
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Evolución mensual */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Evolución mensual del NPS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartEvolucion}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis
                    yAxisId="enc"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="nps"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar
                    yAxisId="enc"
                    dataKey="Encuestas"
                    fill="#cbd5e1"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    yAxisId="enc"
                    dataKey="Detractores"
                    fill="#ef4444"
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    yAxisId="nps"
                    type="monotone"
                    dataKey="NPS"
                    stroke="#0f172a"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cruce R4.1.3 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Cruce NPS × RMD × OTIF interno (R4.1.3)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartCruce}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis
                    yAxisId="pct"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="rmd"
                    orientation="right"
                    domain={[4.5, 5]}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="NPS"
                    stroke="#0f172a"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="OTIF interno %"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="rmd"
                    type="monotone"
                    dataKey="RMD (1-5)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              RMD = Rate My Delivery (Power BI Quilmes). OTIF interno = 1 −
              bultos rechazados ÷ bultos entregados (tabla de rechazos propia).
              Quilmes no publica OTIF a nivel distribuidor, por eso se usa el
              indicador interno de nivel de servicio para explicar brechas.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Drivers + NPS por promotor */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Drivers de insatisfacción (detractores + pasivos)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {drivers_dp.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Sin encuestas de detractores o pasivos.
              </p>
            ) : (
              drivers_dp.map((d) => (
                <div key={d.driver} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-56 truncate text-sm font-medium text-slate-700">
                      {d.driver}
                    </div>
                    <div className="h-5 flex-1 rounded bg-slate-100">
                      <div
                        className="flex h-5 items-center rounded bg-red-400/80 px-1.5 text-[11px] font-medium text-white"
                        style={{
                          width: `${Math.max(
                            (d.encuestas_dp / maxDriver) * 100,
                            8,
                          )}%`,
                        }}
                      >
                        {d.encuestas_dp}
                      </div>
                    </div>
                  </div>
                  {d.subdrivers.length > 0 && (
                    <ul className="ml-3 space-y-0.5 border-l border-slate-200 pl-3">
                      {d.subdrivers.map((s) => (
                        <li
                          key={s.subdriver}
                          className="flex items-baseline justify-between gap-2 text-xs text-slate-500"
                        >
                          <span className="min-w-0 flex-1">{s.subdriver}</span>
                          <span className="shrink-0 font-medium text-slate-600">
                            {s.encuestas_dp}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
            <p className="pt-2 text-xs text-slate-500">
              Cantidad de encuestas de detractores/pasivos que marcaron cada
              driver primario; debajo, los subdrivers (motivos específicos)
              señalados dentro de cada uno.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              NPS por promotor (clientes que atiende en Chess)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">Promotor</th>
                    <th className="px-2 py-2 text-right">NPS</th>
                    <th className="px-2 py-2 text-right">Enc.</th>
                    <th className="px-2 py-2 text-right">Det.</th>
                    <th className="px-2 py-2 text-right">Pas.</th>
                  </tr>
                </thead>
                <tbody>
                  {por_promotor.map((p) => (
                    <tr
                      key={p.promotor}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-1.5 pr-2 font-medium text-slate-800">
                        {p.promotor}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Badge variant="outline" className={npsBadge(p.nps)}>
                          {p.nps.toFixed(1)}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-600">
                        {p.encuestas}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right font-medium ${
                          p.detractores > 0 ? "text-red-600" : "text-slate-400"
                        }`}
                      >
                        {p.detractores}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-600">
                        {p.pasivos}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              NPS individual calculado con las encuestas de los clientes que
              cada promotor atiende hoy (ruta de preventa vigente en Chess).
              Ordenado del más crítico al mejor. Con pocas encuestas el NPS
              individual es volátil: priorizar los que acumulan detractores.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Clientes detractores y pasivos — explorador con modal de detalle */}
      <ClientesExplorador clientes={clientes_dp} onCrearPlan={planParaCliente} />

      {/* Planes de acción (R4.1.2) */}
      <PlanesAccionBloque
        planesIniciales={planesIniciales}
        drivers={drivers_dp.map((d) => d.driver)}
        clientes={clientes_dp.map((c) => ({
          cod_cliente: c.cod_cliente,
          nombre_cliente: c.nombre_cliente,
        }))}
        promotores={por_promotor.map((p) => p.promotor)}
        focoInicial={focoPlan}
        abrirNonce={abrirPlanNonce}
      />

      {/* Checklist R4.1 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Requisitos del punto 4.1 (DPO)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            <span className="font-semibold">R4.1.1 — Encuesta NPS:</span>{" "}
            resultados recopilados del Power BI de Quilmes; esta página muestra
            el acumulado del año y el detalle por cliente (última encuesta:{" "}
            {resumen.ultima_encuesta
              ? FMT_DIA.format(new Date(resumen.ultima_encuesta))
              : "—"}
            ).
          </p>
          <p>
            <span className="font-semibold">
              R4.1.2 — Plan de Acción Centrado en el Cliente:
            </span>{" "}
            los planes de esta página, con responsable, seguimiento y
            evidencia. Revisarlos todos los meses en la reunión de ventas y
            logística (sección NPS de la reunión).
          </p>
          <p>
            <span className="font-semibold">
              R4.1.3 — Cruce con RMD / OTIF / nivel de servicio:
            </span>{" "}
            gráfico de cruce mensual de esta página. Las brechas grandes de NPS
            con driver «Experiencia de entrega» deben conectarse con los
            líderes de entrega y almacén.
          </p>
          <p>
            <span className="font-semibold">R4.1.4 — Entendimiento:</span> NPS
            = % promotores (9-10) − % detractores (0-6); los pasivos (7-8) no
            suman ni restan pero son recuperables. Es el indicador estrella de
            la operación centrada en el cliente: la gerencia y la primera
            línea deben conocer el valor del mes y qué lo mueve.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
