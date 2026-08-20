"use client"

import { useState } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts"
import { AlertTriangle, CheckCircle2, Info, Timer } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CASO_PLAZO_DETRACTOR_DIAS,
  CASO_PLAZO_PASIVO_DIAS,
  SLA_CASOS_TARGET,
  type CasoTiempo,
  type EstadoCasoTiempo,
  type TiempoRespuestaData,
} from "@/lib/sla-cumplimiento"

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
})

/** 'YYYY-MM-DD' → 'dd/mm/aaaa' sin corrimiento de zona horaria. */
function fmtFecha(iso: string): string {
  return FMT_DIA.format(new Date(`${iso}T00:00:00Z`))
}

/** 'YYYY-MM' → 'Ago 26'. */
function fmtMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number)
  return `${MESES[m - 1]} ${String(y).slice(2)}`
}

const ESTADO_UI: Record<
  EstadoCasoTiempo,
  { label: string; badge: string; dias: string }
> = {
  abierto_vencido: {
    label: "Vencido sin cerrar",
    badge: "bg-red-100 text-red-800 border-red-200",
    dias: "text-red-600",
  },
  abierto: {
    label: "Abierto",
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    dias: "text-slate-700",
  },
  cerrado_tarde: {
    label: "Cerrado tarde",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    dias: "text-amber-600",
  },
  cerrado_en_plazo: {
    label: "Cerrado en plazo",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dias: "text-emerald-600",
  },
}

function catBadge(categoria: "detractor" | "pasivo"): string {
  return categoria === "detractor"
    ? "bg-red-100 text-red-800 border-red-200"
    : "bg-amber-100 text-amber-800 border-amber-200"
}

const FILAS_INICIALES = 60

interface Props {
  /** Cambia cómo se muestra la nota (score 0-10 de NPS o puntuación 1-5 de RMD). */
  tipo: "nps" | "rmd"
  data: TiempoRespuestaData
}

export function TiempoRespuestaBloque({ tipo, data }: Props) {
  const [verTodos, setVerTodos] = useState(false)
  const casos = verTodos ? data.casos : data.casos.slice(0, FILAS_INICIALES)

  const chart = data.porMes.map((m) => ({
    mes: fmtMes(m.mes),
    promedio: m.promedio,
    cerrados: m.cerrados,
    abiertos: m.abiertos,
  }))

  function valorLabel(c: CasoTiempo): string {
    return tipo === "nps" ? `${c.valor}/10` : `${c.valor}/5`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>
          Cada encuesta que deja al cliente como <b>detractor</b> o <b>pasivo</b>{" "}
          abre un caso. El reloj arranca el día de la encuesta y se detiene al
          cerrarse el plan de acción del cliente: ≤{" "}
          <b>{CASO_PLAZO_DETRACTOR_DIAS} días</b> para un detractor y ≤{" "}
          <b>{CASO_PLAZO_PASIVO_DIAS} días</b> para un pasivo (mismo criterio que
          el SLA de la matriz de Cumplimientos). Se mide desde el{" "}
          {fmtFecha(data.mideDesde)}; el acuerdo no es retroactivo.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <Timer className="h-4 w-4" /> Tiempo de respuesta
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-900">
              {data.promedioDias !== null ? (
                <>
                  {data.promedioDias}
                  <span className="ml-1 text-base font-medium text-slate-500">días</span>
                </>
              ) : (
                <span className="text-lg font-medium text-slate-400">Sin cierres aún</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Promedio encuesta → cierre del plan
              {data.promedioDetractores !== null || data.promedioPasivos !== null ? (
                <>
                  {" · detractores "}
                  {data.promedioDetractores ?? "—"} d · pasivos{" "}
                  {data.promedioPasivos ?? "—"} d
                </>
              ) : null}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <AlertTriangle className="h-4 w-4" /> Casos abiertos
            </div>
            <div
              className={`mt-1 text-3xl font-bold ${
                data.abiertosVencidos > 0 ? "text-red-600" : "text-slate-900"
              }`}
            >
              {data.abiertos}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {data.abiertosVencidos > 0 ? (
                <span className="font-medium text-red-600">
                  {data.abiertosVencidos} con el plazo vencido
                </span>
              ) : (
                "Ninguno con el plazo vencido"
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <CheckCircle2 className="h-4 w-4" /> Casos cerrados
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-900">{data.cerrados}</div>
            <p className="mt-1 text-xs text-slate-500">
              {data.cerradosTarde > 0
                ? `${data.cerradosTarde} fuera de plazo`
                : "Todos dentro del plazo"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Cierre en plazo (SLA)
            </div>
            <div
              className={`mt-1 text-3xl font-bold ${
                data.pctEnPlazo === null
                  ? "text-slate-400"
                  : data.pctEnPlazo >= SLA_CASOS_TARGET
                    ? "text-emerald-600"
                    : "text-red-600"
              }`}
            >
              {data.pctEnPlazo !== null ? `${data.pctEnPlazo}%` : "—"}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {data.evaluadosSla > 0
                ? `${data.cumplidosSla} de ${data.evaluadosSla} casos ya evaluables · meta ${SLA_CASOS_TARGET}%`
                : "Ningún caso venció ni cerró todavía"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Evolución mensual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Días promedio de cierre por mes de la encuesta
          </CardTitle>
        </CardHeader>
        <CardContent className="border-t pt-4">
          {chart.some((m) => m.promedio !== null) ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chart} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  label={{ value: "días", angle: -90, position: "insideLeft", fontSize: 12 }}
                />
                <Tooltip
                  formatter={(v) => [`${v ?? "—"} días`, "Promedio de cierre"]}
                />
                <ReferenceLine
                  y={CASO_PLAZO_DETRACTOR_DIAS}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{
                    value: `${CASO_PLAZO_DETRACTOR_DIAS} d detractor`,
                    fontSize: 11,
                    fill: "#dc2626",
                    position: "insideTopRight",
                  }}
                />
                <ReferenceLine
                  y={CASO_PLAZO_PASIVO_DIAS}
                  stroke="#d97706"
                  strokeDasharray="4 4"
                  label={{
                    value: `${CASO_PLAZO_PASIVO_DIAS} d pasivo`,
                    fontSize: 11,
                    fill: "#d97706",
                    position: "insideTopRight",
                  }}
                />
                <Bar dataKey="promedio" name="promedio" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {chart.map((m) => (
                    <Cell
                      key={m.mes}
                      fill={
                        m.promedio !== null && m.promedio > CASO_PLAZO_DETRACTOR_DIAS
                          ? "#f59e0b"
                          : "#10b981"
                      }
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              Todavía no hay casos cerrados para graficar.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Casos, los urgentes arriba */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Casos uno por uno — primero los que queman
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 border-t pt-4">
          {data.casos.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Sin casos desde el {fmtFecha(data.mideDesde)}.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-2 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <span className="col-span-4">Cliente</span>
                <span className="col-span-2 text-center">Nota</span>
                <span className="col-span-2 text-center">Vence</span>
                <span className="col-span-1 text-center">Días</span>
                <span className="col-span-3 text-right">Estado</span>
              </div>
              {casos.map((c, i) => {
                const ui = ESTADO_UI[c.estado]
                return (
                  <div
                    key={`${c.cod_cliente}-${c.fecha}-${i}`}
                    className="grid grid-cols-12 items-center gap-2 rounded-md border border-slate-100 bg-white px-2 py-1.5 text-sm"
                  >
                    <span className="col-span-4 min-w-0">
                      <span className="block truncate font-medium text-slate-800">
                        {c.nombre_cliente ?? `Cliente ${c.cod_cliente}`}
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        #{c.cod_cliente} · encuesta {fmtFecha(c.fecha)}
                      </span>
                    </span>
                    <span className="col-span-2 text-center">
                      <Badge variant="outline" className={catBadge(c.categoria)}>
                        {c.categoria === "detractor" ? "Detractor" : "Pasivo"} · {valorLabel(c)}
                      </Badge>
                    </span>
                    <span className="col-span-2 text-center text-xs text-slate-600">
                      {fmtFecha(c.vencimiento)}
                    </span>
                    <span className={`col-span-1 text-center text-base font-bold ${ui.dias}`}>
                      {c.dias}
                    </span>
                    <span className="col-span-3 text-right">
                      <Badge variant="outline" className={ui.badge}>
                        {ui.label}
                        {c.cierre ? ` · ${fmtFecha(c.cierre)}` : ""}
                      </Badge>
                    </span>
                  </div>
                )
              })}
              {!verTodos && data.casos.length > FILAS_INICIALES && (
                <button
                  type="button"
                  onClick={() => setVerTodos(true)}
                  className="mt-2 w-full rounded-md border border-slate-200 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                >
                  Mostrar los {data.casos.length} casos
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
