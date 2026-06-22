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
import { CheckCircle2, Info, Truck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RmdCliente, RmdDashboardData } from "@/actions/rmd"
import type { RmdPlan } from "@/actions/rmd-planes"
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

// Color del puntaje 1-5 para la distribución.
const COLOR_PUNT: Record<number, string> = {
  1: "bg-red-600",
  2: "bg-red-400",
  3: "bg-amber-400",
  4: "bg-emerald-400",
  5: "bg-emerald-600",
}

function rmdColor(rmd: number): string {
  if (rmd >= 4.5) return "text-emerald-600"
  if (rmd >= 4) return "text-amber-600"
  return "text-red-600"
}

interface Props {
  data: RmdDashboardData
  planesIniciales: RmdPlan[]
}

export function RmdClient({ data, planesIniciales }: Props) {
  const { resumen, por_mes, distribucion, motivos, clientes, recuperados } =
    data

  // Foco prellenado al crear un plan desde la tabla de clientes.
  const [focoPlan, setFocoPlan] = useState<{
    foco_cliente_id?: number
    foco_cliente_nombre?: string
    foco_motivo?: string
    foco_chofer?: string
  } | null>(null)
  const [abrirPlanNonce, setAbrirPlanNonce] = useState(0)

  function planParaCliente(c: RmdCliente) {
    setFocoPlan({
      foco_cliente_id: c.cod_cliente,
      foco_cliente_nombre: c.nombre_cliente,
      foco_chofer: c.chofer ?? undefined,
    })
    setAbrirPlanNonce((n) => n + 1)
  }

  const mesesConDatos = por_mes.filter(
    (m) => m.puntuadas > 0 || m.otif_interno != null,
  )
  const chartEvolucion = mesesConDatos.map((m) => ({
    mes: MESES[m.mes - 1],
    "RMD (1-5)": m.rmd,
    Puntuadas: m.puntuadas,
    Bajas: m.detractores,
  }))
  const chartCruce = mesesConDatos.map((m) => ({
    mes: MESES[m.mes - 1],
    "RMD (1-5)": m.rmd,
    "OTIF interno %": m.otif_interno,
  }))

  const maxDist = Math.max(...distribucion.map((d) => d.cantidad), 1)
  const maxMotivo = motivos[0]?.cantidad ?? 1

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Truck className="h-6 w-6 text-slate-500" />
          RMD — Rate My Delivery (calidad de entrega)
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Puntuación 1-5 que el cliente le pone a cada entrega (Power BI
          Quilmes), cruzada con el promotor de preventa de Chess. Toda la base
          del año {resumen.anio}.
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
              RMD acumulado {resumen.anio}
            </p>
            <p
              className={`text-3xl font-bold ${
                resumen.rmd != null ? rmdColor(resumen.rmd) : "text-slate-900"
              }`}
            >
              {resumen.rmd != null ? resumen.rmd.toFixed(2) : "—"}
              <span className="text-base font-normal text-slate-400"> /5</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              promedio de todas las entregas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Entregas puntuadas
            </p>
            <p className="text-3xl font-bold text-slate-900">
              {resumen.rmd_respuestas.toLocaleString("es-AR")}
            </p>
            <p className="mt-1 text-xs text-slate-500">en el año</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Puntuaciones bajas (1-3)
            </p>
            <p className="text-3xl font-bold text-red-600">
              {resumen.detractores.toLocaleString("es-AR")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {resumen.pct_detractores != null
                ? `${resumen.pct_detractores.toFixed(1)}% del total`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Clientes que puntuaron
            </p>
            <p className="text-3xl font-bold text-slate-900">
              {resumen.clientes.toLocaleString("es-AR")}
            </p>
            <p className="mt-1 text-xs text-slate-500">distintos en el año</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-500">
              Última puntuación
            </p>
            <p className="text-xl font-bold text-slate-900">
              {resumen.ultima_puntuacion
                ? FMT_DIA.format(new Date(resumen.ultima_puntuacion))
                : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              señal temprana entre encuestas NPS
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Evolución mensual + Cruce */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Evolución mensual del RMD
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartEvolucion}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis
                    yAxisId="cant"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="rmd"
                    domain={[1, 5]}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar
                    yAxisId="cant"
                    dataKey="Puntuadas"
                    fill="#cbd5e1"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    yAxisId="cant"
                    dataKey="Bajas"
                    fill="#ef4444"
                    radius={[3, 3, 0, 0]}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Cruce RMD × OTIF interno
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
                    domain={[1, 5]}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Legend />
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
              Cuando el RMD baja con el OTIF, la brecha es de nivel de servicio
              en la entrega.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribución 1-5 + Motivos */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Distribución de puntuaciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...distribucion].reverse().map((d) => (
              <div key={d.puntuacion} className="flex items-center gap-2">
                <div className="w-6 shrink-0 text-right text-sm font-semibold text-slate-700">
                  {d.puntuacion}
                </div>
                <div className="h-6 flex-1 rounded bg-slate-100">
                  <div
                    className={`flex h-6 items-center rounded ${
                      COLOR_PUNT[d.puntuacion]
                    } px-1.5 text-[11px] font-medium text-white`}
                    style={{
                      width: `${Math.max((d.cantidad / maxDist) * 100, 3)}%`,
                    }}
                  >
                    {d.cantidad > 0 ? d.cantidad.toLocaleString("es-AR") : ""}
                  </div>
                </div>
                <div className="w-12 shrink-0 text-right text-xs text-slate-500">
                  {d.pct.toFixed(1)}%
                </div>
              </div>
            ))}
            <p className="pt-2 text-xs text-slate-500">
              Cantidad de entregas por cada puntuación (1 = peor, 5 = mejor). Las
              puntuaciones 1-3 cuentan como detractoras.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Motivos de baja puntuación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {motivos.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Sin motivos registrados.
              </p>
            ) : (
              motivos.map((m) => (
                <div key={m.motivo} className="flex items-center gap-2">
                  <div className="w-48 truncate text-sm font-medium text-slate-700">
                    {m.motivo}
                  </div>
                  <div className="h-5 flex-1 rounded bg-slate-100">
                    <div
                      className="flex h-5 items-center rounded bg-red-400/80 px-1.5 text-[11px] font-medium text-white"
                      style={{
                        width: `${Math.max(
                          (m.cantidad / maxMotivo) * 100,
                          8,
                        )}%`,
                      }}
                    >
                      {m.cantidad.toLocaleString("es-AR")}
                    </div>
                  </div>
                </div>
              ))
            )}
            <p className="pt-2 text-xs text-slate-500">
              Motivos que el cliente marcó al puntuar bajo una entrega (texto del
              Power BI de Quilmes).
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Explorador de toda la base */}
      <ClientesExplorador clientes={clientes} onCrearPlan={planParaCliente} />

      {/* Clientes recuperados: puntuaron bajo (1-3) y volvieron a 4-5 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Clientes que se recuperaron
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-100 text-emerald-800"
            >
              {recuperados.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="border-t pt-4">
          <p className="mb-3 text-xs text-slate-500">
            Tuvieron una puntuación baja (1-3) y en una entrega posterior
            volvieron a puntuar bien (4-5). Su última puntuación es alta.
          </p>
          {recuperados.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Todavía no hay clientes recuperados.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-12 items-center gap-2 px-2 pb-1 text-xs font-medium uppercase text-slate-500">
                <span className="col-span-5">Cliente</span>
                <span className="col-span-3">Chofer</span>
                <span className="col-span-2 text-center">Antes</span>
                <span className="col-span-2 text-center">Ahora</span>
              </div>
              {recuperados.map((r) => (
                <div
                  key={r.cod_cliente}
                  className="grid grid-cols-12 items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/40 px-2 py-1.5 text-sm"
                >
                  <span className="col-span-5 min-w-0">
                    <span className="block truncate font-medium text-slate-800">
                      {r.nombre_cliente}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      #{r.cod_cliente} · {r.localidad ?? "—"}
                    </span>
                  </span>
                  <span className="col-span-3 min-w-0 truncate text-xs text-slate-700">
                    {r.chofer ?? "—"}
                  </span>
                  <span className="col-span-2 text-center">
                    <Badge
                      variant="outline"
                      className="border-red-200 bg-red-100 text-red-800"
                    >
                      {r.punt_antes}
                    </Badge>
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      {FMT_DIA.format(new Date(r.fecha_antes))}
                    </span>
                  </span>
                  <span className="col-span-2 text-center">
                    <Badge
                      variant="outline"
                      className="border-emerald-200 bg-emerald-100 text-emerald-800"
                    >
                      {r.punt_ahora}
                    </Badge>
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      {FMT_DIA.format(new Date(r.fecha_ahora))}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Planes de acción sobre RMD */}
      <PlanesAccionBloque
        planesIniciales={planesIniciales}
        motivos={motivos.map((m) => m.motivo)}
        clientes={clientes.map((c) => ({
          cod_cliente: c.cod_cliente,
          nombre_cliente: c.nombre_cliente,
        }))}
        choferes={[
          ...new Set(clientes.map((c) => c.chofer).filter(Boolean)),
        ].sort() as string[]}
        focoInicial={focoPlan}
        abrirNonce={abrirPlanNonce}
      />

      {/* Nota */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Sobre el RMD
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            El <span className="font-semibold">RMD (Rate My Delivery)</span> es
            la puntuación 1-5 que el cliente le pone a cada entrega vía BEES. Es
            la <span className="font-semibold">señal más temprana</span> de la
            experiencia de entrega: llega entrega por entrega, sin esperar la
            encuesta NPS trimestral.
          </p>
          <p>
            Acá se ve <span className="font-semibold">toda la base</span>:
            distribución de puntuaciones, motivos de las bajas, evolución
            mensual, cruce con el OTIF interno y el explorador cliente por
            cliente. Para cada cliente con RMD bajo se
            puede abrir un{" "}
            <span className="font-semibold">plan de acción</span> con
            responsable, seguimiento y evidencia, y medir si el RMD mejora.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
