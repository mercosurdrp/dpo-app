"use client"

import { useMemo, useState } from "react"
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
import {
  AlertTriangle,
  BellOff,
  ClipboardCheck,
  Info,
  MailQuestion,
  MapPin,
  Send,
  Target,
  User,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  NpsCoberturaCliente,
  NpsCoberturaData,
  NpsSegmento,
} from "@/actions/nps-cobertura"
import type { NpsPlan } from "@/actions/nps-planes"
import {
  PlanBadge,
  planesPorClienteFoco,
  type PlanMarcable,
} from "@/components/plan-badge"

const TODOS = "__todos__"

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const FMT_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

/** Los tres segmentos accionables, en orden de prioridad. */
const SEGMENTOS: Record<
  Exclude<NpsSegmento, "respondiendo">,
  { label: string; corto: string; badge: string; ayuda: string }
> = {
  queja_abierta: {
    label: "Se quejó y después se calló",
    corto: "Queja abierta",
    badge: "bg-red-100 text-red-800 border-red-200",
    ayuda:
      "Su última respuesta fue detractor o pasivo y la encuesta siguiente no la contestó. Es el reclamo que quedó sin cerrar.",
  },
  promotor_apagado: {
    label: "Votaba bien y dejó de votar",
    corto: "Promotor apagado",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    ayuda:
      "Venía puntuando 9 o 10 y dejó de responder. Puede ser desinterés o algo que se rompió después de su última respuesta.",
  },
  nunca_respondio: {
    label: "Nunca respondió",
    corto: "Nunca respondió",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    ayuda:
      "Recibió dos o más encuestas y no contestó ninguna. Nunca supimos qué piensa.",
  },
  un_solo_envio: {
    label: "Una sola encuesta, sin respuesta",
    corto: "Un solo envío",
    badge: "bg-slate-50 text-slate-500 border-slate-200",
    ayuda:
      "Todavía hay poca evidencia: le llegó una sola encuesta en el año.",
  },
}

function fmtNum(n: number, dec = 0): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

// 🚨 El Select de este repo es Base UI: <SelectValue/> vacío muestra el value
// CRUDO mientras el usuario no lo toca (se vería "__todos__"). Hay que pasarle
// la etiqueta como función.
const TOPES: Record<string, string> = {
  "25": "Top 25",
  "50": "Top 50",
  "100": "Top 100",
  todos: "Todos",
}

/** Foco de los planes de acción que atacan la tasa de respuesta de la encuesta. */
export const TASA_FOCO = "Tasa de respuesta"

interface Props {
  data: NpsCoberturaData
  planes: NpsPlan[]
  /** Crea un plan de acción para ese cliente (abre el formulario prellenado). */
  onCrearPlan: (cliente: NpsCoberturaCliente) => void
  onVerPlan: (plan: PlanMarcable) => void
  /** Crea un plan de acción general para subir la tasa de respuesta. */
  onCrearPlanTasa: () => void
}

export function CoberturaBloque({
  data,
  planes,
  onCrearPlan,
  onVerPlan,
  onCrearPlanTasa,
}: Props) {
  const { meses, promotores, clientes, resumen, anio } = data

  const [fPromotor, setFPromotor] = useState(TODOS)
  const [fSegmento, setFSegmento] = useState(TODOS)
  const [tope, setTope] = useState("50")

  const planesPorCliente = useMemo(
    () => planesPorClienteFoco(planes),
    [planes],
  )

  /** Planes generales que atacan la tasa de respuesta (foco = TASA_FOCO). */
  const planesTasa = useMemo(
    () => planes.filter((p) => p.foco_driver === TASA_FOCO),
    [planes],
  )

  const listaPromotores = useMemo(
    () => [...promotores].map((p) => p.promotor).sort(),
    [promotores],
  )

  // Foco: prioridad primero (ya viene ordenado del server) y dentro de cada
  // grupo el que más volumen compra, que es donde el silencio cuesta más.
  const foco = useMemo(() => {
    const filtrados = clientes.filter(
      (c) =>
        (fPromotor === TODOS || c.promotor === fPromotor) &&
        (fSegmento === TODOS || c.segmento === fSegmento),
    )
    return tope === "todos"
      ? filtrados
      : filtrados.slice(0, Number(tope))
  }, [clientes, fPromotor, fSegmento, tope])

  const hlFoco = foco.reduce((s, c) => s + c.hl_anio, 0)

  const chart = meses
    .filter((m) => !m.parcial)
    .map((m) => ({
      mes: MESES[m.mes - 1],
      Enviadas: m.enviadas,
      Respondidas: m.respondidas,
      "Tasa %": m.tasa_respuesta,
    }))

  const mesParcial = meses.find((m) => m.parcial)

  return (
    <div className="space-y-6">
      {/* ---------- KPIs ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Send className="h-4 w-4" /> Encuestas enviadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">
              {fmtNum(resumen.enviadas)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              meses cerrados de {anio}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <ClipboardCheck className="h-4 w-4" /> Respondidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">
              {fmtNum(resumen.respondidas)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {fmtNum(resumen.enviadas - resumen.respondidas)} sin respuesta
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <MailQuestion className="h-4 w-4" /> Tasa de respuesta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-semibold ${
                (resumen.tasa_respuesta ?? 0) >= 30
                  ? "text-emerald-600"
                  : (resumen.tasa_respuesta ?? 0) >= 20
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {resumen.tasa_respuesta == null
                ? "—"
                : `${fmtNum(resumen.tasa_respuesta, 1)} %`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              el NPS se calcula sobre esta parte
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {planesTasa.length > 0 && (
                <PlanBadge planes={planesTasa} onVerPlan={onVerPlan} />
              )}
              <button
                type="button"
                onClick={onCrearPlanTasa}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                title="Crear un plan de acción con foco en subir la tasa de respuesta"
              >
                <Target className="h-3.5 w-3.5" />
                Plan para subir la tasa
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <BellOff className="h-4 w-4" /> Clientes sin voz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">
              {fmtNum(resumen.clientes_sin_voz)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              de {fmtNum(resumen.clientes_alcanzados)} encuestados ·{" "}
              {fmtNum(resumen.hl_sin_voz)} HL
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Advertencia de interpretación ---------- */}
      <div className="flex gap-3 rounded-md border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p>
            <strong>Cómo leer esta solapa.</strong> El NPS del panel sale solo de
            los que contestaron
            {resumen.tasa_respuesta != null && (
              <> ({fmtNum(resumen.tasa_respuesta, 1)} % de los encuestados)</>
            )}
            . El que está enojado muchas veces no contesta, así que subir la tasa
            de respuesta probablemente <strong>baje</strong> el NPS al principio:
            eso no es que el servicio empeore, es que la medición se vuelve más
            representativa.
          </p>
          {mesParcial && (
            <p className="text-xs">
              {MESES[mesParcial.mes - 1]} no entra en los totales: el Power BI
              carga las enviadas del mes en curso con retraso.
            </p>
          )}
        </div>
      </div>

      {/* ---------- Evolución mensual ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Enviadas vs respondidas por mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="izq" tick={{ fontSize: 12 }} />
              <YAxis
                yAxisId="der"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 12 }}
                unit="%"
              />
              <Tooltip />
              <Legend />
              <Bar
                yAxisId="izq"
                dataKey="Enviadas"
                fill="#cbd5e1"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="izq"
                dataKey="Respondidas"
                fill="#0ea5e9"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="der"
                type="monotone"
                dataKey="Tasa %"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ---------- Por promotor ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cobertura por promotor</CardTitle>
          <p className="text-xs text-slate-500">
            Cuánto de su cartera encuestada contesta, y cuántos clientes tiene
            en cada situación. Ordenado por la tasa más baja.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Promotor</th>
                <th className="py-2 pr-3 text-right">Clientes</th>
                <th className="py-2 pr-3 text-right">Enviadas</th>
                <th className="py-2 pr-3 text-right">Respondidas</th>
                <th className="py-2 pr-3 text-right">Tasa</th>
                <th className="py-2 pr-3 text-right">Queja abierta</th>
                <th className="py-2 pr-3 text-right">Prom. apagado</th>
                <th className="py-2 pr-3 text-right">Nunca respondió</th>
                <th className="py-2 text-right">HL sin voz</th>
              </tr>
            </thead>
            <tbody>
              {promotores.map((p) => (
                <tr
                  key={p.promotor}
                  className="border-b last:border-0 hover:bg-slate-50"
                >
                  <td className="py-2 pr-3 font-medium text-slate-800">
                    {p.promotor}
                  </td>
                  <td className="py-2 pr-3 text-right">{p.clientes}</td>
                  <td className="py-2 pr-3 text-right">{p.enviadas}</td>
                  <td className="py-2 pr-3 text-right">{p.respondidas}</td>
                  <td
                    className={`py-2 pr-3 text-right font-medium ${
                      (p.tasa_respuesta ?? 0) >= 30
                        ? "text-emerald-600"
                        : (p.tasa_respuesta ?? 0) >= 20
                          ? "text-amber-600"
                          : "text-red-600"
                    }`}
                  >
                    {p.tasa_respuesta == null
                      ? "—"
                      : `${fmtNum(p.tasa_respuesta, 1)} %`}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {p.queja_abierta > 0 ? (
                      <span className="font-semibold text-red-600">
                        {p.queja_abierta}
                      </span>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {p.promotor_apagado || (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">{p.nunca_respondio}</td>
                  <td className="py-2 text-right text-slate-600">
                    {fmtNum(p.hl_sin_voz)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ---------- Foco sugerido ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Foco sugerido para salir a buscar respuesta
              </CardTitle>
              <p className="text-xs text-slate-500">
                No son {fmtNum(resumen.enviadas - resumen.respondidas)}{" "}
                encuestas para perseguir: son {fmtNum(foco.length)} clientes,
                ordenados por urgencia y por volumen ({fmtNum(hlFoco)} HL del
                año).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={fSegmento}
                onValueChange={(v) => v && setFSegmento(v)}
              >
                <SelectTrigger className="h-8 w-[210px] text-xs">
                  <SelectValue>
                    {(v) =>
                      v === TODOS
                        ? "Todas las situaciones"
                        : (SEGMENTOS[v as keyof typeof SEGMENTOS]?.label ??
                          String(v))
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas las situaciones</SelectItem>
                  {(
                    Object.keys(SEGMENTOS) as Array<keyof typeof SEGMENTOS>
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEGMENTOS[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={fPromotor}
                onValueChange={(v) => v && setFPromotor(v)}
              >
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue>
                    {(v) =>
                      v === TODOS ? "Todos los promotores" : String(v)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos los promotores</SelectItem>
                  {listaPromotores.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={tope} onValueChange={(v) => v && setTope(v)}>
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue>
                    {(v) => TOPES[String(v)] ?? String(v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TOPES).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {foco.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No hay clientes con ese filtro.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Situación</th>
                  <th className="py-2 pr-3 text-right">Env.</th>
                  <th className="py-2 pr-3 text-right">Resp.</th>
                  <th className="py-2 pr-3">Última respuesta</th>
                  <th className="py-2 pr-3 text-right">HL {anio}</th>
                  <th className="py-2 text-right">Plan</th>
                </tr>
              </thead>
              <tbody>
                {foco.map((c) => {
                  const seg = SEGMENTOS[
                    c.segmento as keyof typeof SEGMENTOS
                  ] ?? {
                    corto: c.segmento,
                    badge: "bg-slate-100 text-slate-700 border-slate-200",
                    ayuda: "",
                  }
                  const planesCli = planesPorCliente.get(c.cod_cliente) ?? []
                  return (
                    <tr
                      key={c.cod_cliente}
                      className="border-b align-top last:border-0 hover:bg-slate-50"
                    >
                      <td className="py-2 pr-3">
                        <p className="font-medium text-slate-800">
                          {c.nombre_cliente ?? `Cliente ${c.cod_cliente}`}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                          {c.promotor && (
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {c.promotor}
                            </span>
                          )}
                          {c.localidad && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {c.localidad}
                            </span>
                          )}
                        </p>
                        {c.ultimo_comentario && (
                          <p className="mt-1 max-w-md text-xs italic text-slate-500">
                            “{c.ultimo_comentario}”
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant="outline"
                          className={`${seg.badge} whitespace-nowrap`}
                          title={seg.ayuda}
                        >
                          {c.segmento === "queja_abierta" && (
                            <AlertTriangle className="mr-1 h-3 w-3" />
                          )}
                          {seg.corto}
                        </Badge>
                        {c.envios_ignorados > 0 && (
                          <p className="mt-1 text-xs text-slate-500">
                            {c.envios_ignorados}{" "}
                            {c.envios_ignorados === 1
                              ? "encuesta ignorada"
                              : "encuestas ignoradas"}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">{c.enviadas}</td>
                      <td className="py-2 pr-3 text-right">{c.respondidas}</td>
                      <td className="py-2 pr-3 text-xs">
                        {c.ultima_respuesta ? (
                          <>
                            <span
                              className={
                                c.ultima_categoria === "Detractor"
                                  ? "font-semibold text-red-600"
                                  : c.ultima_categoria === "Passive"
                                    ? "font-semibold text-amber-600"
                                    : "font-semibold text-emerald-600"
                              }
                            >
                              {c.ultimo_score}
                            </span>{" "}
                            ·{" "}
                            {FMT_DIA.format(new Date(c.ultima_respuesta))}
                          </>
                        ) : (
                          <span className="text-slate-400">nunca</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-600">
                        {fmtNum(c.hl_anio, 1)}
                      </td>
                      <td className="py-2 text-right">
                        {planesCli.length > 0 ? (
                          <PlanBadge planes={planesCli} onVerPlan={onVerPlan} />
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => onCrearPlan(c)}
                          >
                            Plan
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
