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
  Info,
  MailQuestion,
  MapPin,
  Send,
  Star,
  Truck,
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
  RmdCoberturaCliente,
  RmdCoberturaData,
  RmdSegmento,
} from "@/actions/rmd-cobertura"
import type { RmdPlan } from "@/actions/rmd-planes"
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

/** Situaciones accionables, en orden de prioridad. */
const SEGMENTOS: Record<
  Exclude<RmdSegmento, "puntuando">,
  { label: string; corto: string; badge: string; ayuda: string }
> = {
  queja_abierta: {
    label: "Puntuó bajo y después se calló",
    corto: "Queja abierta",
    badge: "bg-red-100 text-red-800 border-red-200",
    ayuda:
      "Su última calificación fue 1-3 y las entregas siguientes no las puntuó. Es el reclamo que quedó sin cerrar.",
  },
  dejo_de_puntuar: {
    label: "Puntuaba bien y dejó de puntuar",
    corto: "Dejó de puntuar",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    ayuda:
      "Venía calificando 4-5 y lleva 4 o más entregas seguidas sin puntuar. Con la tasa habitual (~45 %) esa racha es poco probable si nada cambió.",
  },
  nunca_puntuo: {
    label: "Nunca puntuó una entrega",
    corto: "Nunca puntuó",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    ayuda:
      "Recibió tres o más encuestas de entrega y no calificó ninguna. Nunca supimos cómo le llega el pedido.",
  },
  baja_participacion: {
    label: "Casi nunca puntúa",
    corto: "Casi no puntúa",
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    ayuda:
      "Puntúa menos del 20 % de sus entregas teniendo 5 o más encuestas: la poca nota que deja pesa demasiado.",
  },
  pocos_envios: {
    label: "Una o dos encuestas, sin puntuar",
    corto: "Pocos envíos",
    badge: "bg-slate-50 text-slate-500 border-slate-200",
    ayuda:
      "Todavía hay poca evidencia: le llegaron una o dos encuestas en el año.",
  },
}

const TOPES: Record<string, string> = {
  "25": "Top 25",
  "50": "Top 50",
  "100": "Top 100",
  todos: "Todos",
}

function fmtNum(n: number, dec = 0): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

function colorTasa(t: number | null): string {
  if (t == null) return "text-slate-400"
  if (t >= 50) return "text-emerald-600"
  if (t >= 35) return "text-amber-600"
  return "text-red-600"
}

interface Props {
  data: RmdCoberturaData
  planes: RmdPlan[]
  /** Crea un plan de acción para ese cliente (abre el formulario prellenado). */
  onCrearPlan: (cliente: RmdCoberturaCliente) => void
  onVerPlan: (plan: PlanMarcable) => void
}

export function CoberturaBloque({
  data,
  planes,
  onCrearPlan,
  onVerPlan,
}: Props) {
  const { meses, choferes, clientes, resumen, anio } = data

  const [fPromotor, setFPromotor] = useState(TODOS)
  const [fSegmento, setFSegmento] = useState(TODOS)
  const [tope, setTope] = useState("50")

  const planesPorCliente = useMemo(
    () => planesPorClienteFoco(planes),
    [planes],
  )

  const listaPromotores = useMemo(
    () =>
      [
        ...new Set(clientes.map((c) => c.promotor).filter(Boolean)),
      ].sort() as string[],
    [clientes],
  )

  // Foco: prioridad primero (ya viene ordenado del server) y dentro de cada
  // grupo el que más volumen compra, que es donde el silencio cuesta más.
  const foco = useMemo(() => {
    const filtrados = clientes.filter(
      (c) =>
        (fPromotor === TODOS || c.promotor === fPromotor) &&
        (fSegmento === TODOS || c.segmento === fSegmento),
    )
    return tope === "todos" ? filtrados : filtrados.slice(0, Number(tope))
  }, [clientes, fPromotor, fSegmento, tope])

  const hlFoco = foco.reduce((s, c) => s + c.hl_anio, 0)

  const chart = meses
    .filter((m) => !m.parcial)
    .map((m) => ({
      mes: MESES[m.mes - 1],
      Encuestadas: m.enviadas,
      Calificadas: m.puntuadas,
      "Tasa %": m.tasa_respuesta,
    }))

  const mesParcial = meses.find((m) => m.parcial)
  const choferesConVolumen = choferes.filter((c) => c.enviadas >= 20)

  return (
    <div className="space-y-6">
      {/* ---------- KPIs ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Send className="h-4 w-4" /> Entregas encuestadas
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
              <Star className="h-4 w-4" /> Calificadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">
              {fmtNum(resumen.puntuadas)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {fmtNum(resumen.sin_calificar)} entregas sin nota
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
              className={`text-3xl font-semibold ${colorTasa(
                resumen.tasa_respuesta,
              )}`}
            >
              {resumen.tasa_respuesta == null
                ? "—"
                : `${fmtNum(resumen.tasa_respuesta, 1)} %`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              el RMD se calcula sobre esta parte
            </p>
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
            <strong>Cómo leer esta solapa.</strong> El RMD del panel sale solo de
            las entregas que el cliente calificó
            {resumen.tasa_respuesta != null && (
              <> ({fmtNum(resumen.tasa_respuesta, 1)} % de las encuestadas)</>
            )}
            . El que quedó disconforme muchas veces no puntúa, así que subir la
            tasa probablemente <strong>baje</strong> el RMD al principio: no es
            que la entrega empeore, es que la medición se vuelve más
            representativa.
          </p>
          {mesParcial && (
            <p className="text-xs">
              {MESES[mesParcial.mes - 1]} no entra en los totales: sus entregas
              todavía pueden recibir puntuación (llega a los 4 días de la
              entrega en la mitad de los casos, y hasta un mes después).
            </p>
          )}
        </div>
      </div>

      {/* ---------- Evolución mensual ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Entregas encuestadas vs calificadas, por mes de entrega
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
                dataKey="Encuestadas"
                fill="#cbd5e1"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="izq"
                dataKey="Calificadas"
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

      {/* ---------- Por chofer ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-slate-500" />
            Cobertura por chofer
          </CardTitle>
          <p className="text-xs text-slate-500">
            Cuánto de lo que entrega cada uno vuelve con nota. Donde la tasa es
            baja, el RMD de ese chofer se apoya en muy pocas opiniones. El chofer
            sale del TML/check del día de la entrega; si ese día no hubo, del
            camión asignado. Solo choferes con 20 entregas encuestadas o más.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {choferesConVolumen.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Todavía no hay entregas con camión identificado.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Chofer</th>
                  <th className="py-2 pr-3">Camión</th>
                  <th className="py-2 pr-3 text-right">Encuestadas</th>
                  <th className="py-2 pr-3 text-right">Calificadas</th>
                  <th className="py-2 pr-3 text-right">Tasa</th>
                  <th className="py-2 pr-3 text-right">RMD</th>
                  <th className="py-2 text-right">Bajas 1-3</th>
                </tr>
              </thead>
              <tbody>
                {choferesConVolumen.map((c) => (
                  <tr
                    key={c.chofer}
                    className="border-b last:border-0 hover:bg-slate-50"
                  >
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      {c.chofer}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {c.patentes.slice(0, 3).join(", ")}
                      {c.patentes.length > 3 && ` +${c.patentes.length - 3}`}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {fmtNum(c.enviadas)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {fmtNum(c.puntuadas)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-medium ${colorTasa(
                        c.tasa_respuesta,
                      )}`}
                    >
                      {c.tasa_respuesta == null
                        ? "—"
                        : `${fmtNum(c.tasa_respuesta, 1)} %`}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700">
                      {c.rmd == null ? "—" : c.rmd.toFixed(2)}
                    </td>
                    <td className="py-2 text-right">
                      {c.bajas > 0 ? (
                        <span className="font-semibold text-red-600">
                          {c.bajas}
                        </span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ---------- Foco sugerido ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Foco sugerido para salir a buscar la nota
              </CardTitle>
              <p className="text-xs text-slate-500">
                No son {fmtNum(resumen.sin_calificar)} entregas para perseguir:
                son {fmtNum(foco.length)} clientes, ordenados por urgencia y por
                volumen ({fmtNum(hlFoco)} HL del año).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={fSegmento}
                onValueChange={(v) => v && setFSegmento(v)}
              >
                <SelectTrigger className="h-8 w-[230px] text-xs">
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
                    {(v) => (v === TODOS ? "Todos los promotores" : String(v))}
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
                  <th className="py-2 pr-3 text-right">Entregas</th>
                  <th className="py-2 pr-3 text-right">Calif.</th>
                  <th className="py-2 pr-3">Última nota</th>
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
                              ? "entrega sin puntuar después"
                              : "entregas sin puntuar después"}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">{c.enviadas}</td>
                      <td className="py-2 pr-3 text-right">{c.puntuadas}</td>
                      <td className="py-2 pr-3 text-xs">
                        {c.ultima_puntuacion != null &&
                        c.ultima_puntuacion_fecha ? (
                          <>
                            <span
                              className={
                                c.ultima_puntuacion <= 3
                                  ? "font-semibold text-red-600"
                                  : c.ultima_puntuacion === 4
                                    ? "font-semibold text-amber-600"
                                    : "font-semibold text-emerald-600"
                              }
                            >
                              {c.ultima_puntuacion}
                            </span>{" "}
                            ·{" "}
                            {FMT_DIA.format(
                              new Date(c.ultima_puntuacion_fecha),
                            )}
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
