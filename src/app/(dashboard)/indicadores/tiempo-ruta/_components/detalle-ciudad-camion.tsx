"use client"

// Pestaña «Por ciudad y camión» de Tiempo en Ruta (pedido de Fausto, 12/11/2026):
// todas las ciudades → una ciudad → un camión, con gráficos para ver dónde está
// el tiempo. Se calcula en el navegador con los retornos que ya trae la página.

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"
import { ChevronRight, Eye, MapPin, Truck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  AJUSTE_TRASLADO_MINUTOS,
  TIEMPO_RUTA_META_MINUTOS,
  minutosAjustados,
  type RetornoRuta,
} from "@/lib/tiempo-ruta/meta"
import {
  COLOR_NIVEL,
  PERIODOS,
  SIN_CIUDAD,
  agruparPor,
  camionDe,
  ciudadDe,
  ciudadFrecuente,
  colorTiempo,
  etiquetaMes,
  filtrarPeriodo,
  mesesDe,
  nivelTiempo,
  porDiaSemana,
  resumenRetornos,
  serieMensualPor,
  type Periodo,
} from "@/lib/tiempo-ruta/detalle"

const META_H = TIEMPO_RUTA_META_MINUTOS / 60
const PALETA = ["#2563EB", "#F97316", "#8B5CF6", "#0EA5E9", "#DB2777", "#64748B", "#14B8A6"]

const horas = (min: number) => +(min / 60).toFixed(2)
function hhmm(min: number): string {
  return `${Math.floor(min / 60)}:${String(Math.round(min) % 60).padStart(2, "0")}`
}

interface Props {
  retornos: RetornoRuta[]
  ajustar: boolean
}

export function DetalleCiudadCamion({ retornos, ajustar }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("3meses")
  const [ciudad, setCiudad] = useState<string | null>(null)
  const [camion, setCamion] = useState<string | null>(null)
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const base = useMemo(() => filtrarPeriodo(retornos, periodo, hoy), [retornos, periodo, hoy])
  const enCiudad = useMemo(
    () => (ciudad ? base.filter((r) => ciudadDe(r) === ciudad) : base),
    [base, ciudad],
  )
  const enCamion = useMemo(
    () => (camion ? enCiudad.filter((r) => camionDe(r) === camion) : enCiudad),
    [enCiudad, camion],
  )

  const ciudades = useMemo(() => agruparPor(base, ciudadDe, ajustar), [base, ajustar])
  const camiones = useMemo(() => agruparPor(enCiudad, camionDe, ajustar), [enCiudad, ajustar])
  const actual = resumenRetornos(enCamion, ajustar)

  const elegirCiudad = (c: string | null) => {
    setCiudad(c)
    setCamion(null)
  }

  return (
    <div className="space-y-4">
      {/* Barra de control: período + dónde estoy */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <Chip activo={!ciudad && !camion} onClick={() => elegirCiudad(null)}>
              Todas las ciudades
            </Chip>
            {ciudad && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <Chip activo={!camion} onClick={() => setCamion(null)}>
                  <MapPin className="h-3.5 w-3.5" /> {ciudad}
                </Chip>
              </>
            )}
            {camion && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <Chip activo>
                  <Truck className="h-3.5 w-3.5" /> {camion}
                </Chip>
              </>
            )}
          </nav>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                onClick={() => setPeriodo(p.valor)}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  periodo === p.valor ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Resumen del nivel elegido */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumen
          titulo="Promedio"
          valor={actual.n ? hhmm(actual.promedio) : "—"}
          color={actual.n ? colorTiempo(actual.promedio) : undefined}
          detalle={`Meta ≤ ${META_H} h${ajustar ? " · ajustado por traslado" : ""}`}
        />
        <Resumen titulo="Mediana" valor={actual.n ? hhmm(actual.mediana) : "—"} detalle="El retorno del medio" />
        <Resumen titulo="% retornos ≤ 7 h" valor={actual.n ? `${actual.pctMeta}%` : "—"} detalle="Informativo" />
        <Resumen titulo="Retornos" valor={String(actual.n)} detalle={`Desde ${base[0]?.fecha ?? "—"}`} />
      </div>

      {enCamion.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No hay retornos en este período.
          </CardContent>
        </Card>
      ) : camion ? (
        <FichaCamion
          camion={camion}
          retornos={enCamion}
          flota={base}
          ajustar={ajustar}
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <RankingCard
              titulo="Promedio por ciudad"
              icono={<MapPin className="h-4 w-4" />}
              grupos={ciudades}
              elegido={ciudad}
              ayuda="Tocá una ciudad para ver sus camiones."
              onElegir={(c) => elegirCiudad(c === ciudad ? null : c)}
            />
            <EvolucionCiudades retornos={base} ajustar={ajustar} resaltada={ciudad} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankingCard
              titulo={ciudad ? `Camiones que repartieron en ${ciudad}` : "Promedio por camión"}
              icono={<Truck className="h-4 w-4" />}
              grupos={camiones}
              elegido={null}
              ayuda="Tocá un camión para ver su ficha."
              onElegir={(c) => setCamion(c)}
            />
            <DiaSemana retornos={enCiudad} ajustar={ajustar} />
          </div>

          <Dispersion
            retornos={enCiudad}
            ajustar={ajustar}
            columna={ciudad ? camionDe : ciudadDe}
            orden={(ciudad ? camiones : ciudades).map((g) => g.clave)}
            titulo={ciudad ? `Cada retorno en ${ciudad}, por camión` : "Cada retorno, por ciudad"}
          />

          <MapaCalor retornos={enCiudad} ajustar={ajustar} onElegir={setCamion} />
        </>
      )}

      <p className="text-xs text-muted-foreground">
        La ciudad de cada retorno es la de más carga del camión ese día.
        {ajustar &&
          ` Con el ajuste se descuenta el traslado: ${Object.entries(AJUSTE_TRASLADO_MINUTOS)
            .map(([r, m]) => `${r} −${m / 60} h`)
            .join(", ")}.`}
      </p>
    </div>
  )
}

// ───────────────────────── piezas ─────────────────────────

function Chip({
  activo,
  onClick,
  children,
}: {
  activo?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 transition-colors ${
        activo
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  )
}

function Resumen({
  titulo,
  valor,
  detalle,
  color,
}: {
  titulo: string
  valor: string
  detalle: string
  color?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-2xl font-bold text-slate-900" style={color ? { color } : undefined}>
          {valor}
        </p>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </CardContent>
    </Card>
  )
}

function TooltipCaja({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-md">{children}</div>
}

function RankingCard({
  titulo,
  icono,
  grupos,
  elegido,
  ayuda,
  onElegir,
}: {
  titulo: string
  icono: React.ReactNode
  grupos: ReturnType<typeof agruparPor>
  elegido: string | null
  ayuda: string
  onElegir: (clave: string) => void
}) {
  const data = grupos.map((g) => ({ ...g, horas: horas(g.promedio) }))
  const alto = Math.max(180, data.length * 36 + 40)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icono} {titulo}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </CardHeader>
      <CardContent>
        <div style={{ height: alto }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 4, right: 70 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" fontSize={11} unit="h" domain={[0, (max: number) => Math.max(Math.ceil(max), 9)]} />
              <YAxis type="category" dataKey="clave" width={130} fontSize={11} interval={0} />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                content={({ active, payload }) => {
                  const g = payload?.[0]?.payload as (typeof data)[number] | undefined
                  if (!active || !g) return null
                  return (
                    <TooltipCaja>
                      <p className="font-semibold">{g.clave}</p>
                      <p>Promedio {hhmm(g.promedio)} · mediana {hhmm(g.mediana)}</p>
                      <p>{g.pctMeta}% de los retornos ≤ {META_H} h · {g.n} retornos</p>
                    </TooltipCaja>
                  )
                }}
              />
              <ReferenceLine x={META_H} stroke="#10B981" strokeDasharray="5 5" label={{ value: `${META_H} h`, position: "top", fontSize: 10 }} />
              <Bar
                dataKey="horas"
                radius={[0, 4, 4, 0]}
                className="cursor-pointer"
                onClick={(d) => {
                  const clave = (d as { payload?: { clave?: string } }).payload?.clave
                  if (clave) onElegir(clave)
                }}
              >
                {data.map((g) => (
                  <Cell
                    key={g.clave}
                    fill={colorTiempo(g.promedio)}
                    fillOpacity={elegido && elegido !== g.clave ? 0.3 : 1}
                    stroke={elegido === g.clave ? "#0f172a" : undefined}
                    strokeWidth={elegido === g.clave ? 2 : 0}
                  />
                ))}
                <LabelList
                  dataKey="promedio"
                  position="right"
                  fontSize={11}
                  formatter={(v) => hhmm(Number(v))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {grupos.map((g) => (
            <span key={g.clave}>
              {g.clave}: <strong>{g.n}</strong> ret.
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function EvolucionCiudades({
  retornos,
  ajustar,
  resaltada,
}: {
  retornos: RetornoRuta[]
  ajustar: boolean
  resaltada: string | null
}) {
  const { data, claves } = useMemo(() => {
    const serie = serieMensualPor(retornos, ciudadDe, ajustar)
    const claves = [...serie.keys()].filter((c) => c !== SIN_CIUDAD).sort()
    const data = mesesDe(retornos).map((mes) => {
      const fila: Record<string, string | number | null> = { mes: etiquetaMes(mes) }
      for (const c of claves) {
        const p = serie.get(c)?.get(mes)
        fila[c] = p ? horas(p.promedio) : null
      }
      return fila
    })
    return { data, claves }
  }, [retornos, ajustar])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Evolución mensual por ciudad</CardTitle>
        <p className="text-xs text-muted-foreground">
          {resaltada ? `Resaltada: ${resaltada}.` : "Cada línea es una ciudad."} Debajo de la línea verde, en meta.
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} unit="h" domain={[0, (max: number) => Math.max(Math.ceil(max), 9)]} />
              <Tooltip formatter={(v, name) => [hhmm(Number(v) * 60), String(name)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={META_H} stroke="#10B981" strokeDasharray="5 5" />
              {claves.map((c, i) => {
                const apagada = resaltada !== null && resaltada !== c
                return (
                  <Line
                    key={c}
                    type="monotone"
                    dataKey={c}
                    stroke={apagada ? "#cbd5e1" : PALETA[i % PALETA.length]}
                    strokeWidth={resaltada === c ? 3.5 : 2}
                    dot={{ r: apagada ? 0 : 3 }}
                    connectNulls
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function DiaSemana({ retornos, ajustar }: { retornos: RetornoRuta[]; ajustar: boolean }) {
  const data = porDiaSemana(retornos, ajustar)
    .filter((d) => d.n > 0)
    .map((d) => ({ ...d, horas: horas(d.promedio) }))
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Por día de la semana</CardTitle>
        <p className="text-xs text-muted-foreground">¿Hay días que siempre son más largos?</p>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="dia" fontSize={11} />
              <YAxis fontSize={11} unit="h" domain={[0, (max: number) => Math.max(Math.ceil(max), 9)]} />
              <Tooltip
                content={({ active, payload }) => {
                  const d = payload?.[0]?.payload as (typeof data)[number] | undefined
                  if (!active || !d) return null
                  return (
                    <TooltipCaja>
                      <p className="font-semibold">{d.dia}</p>
                      <p>Promedio {hhmm(d.promedio)} · {d.n} retornos</p>
                    </TooltipCaja>
                  )
                }}
              />
              <ReferenceLine y={META_H} stroke="#10B981" strokeDasharray="5 5" />
              <Bar dataKey="horas" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.dia} fill={colorTiempo(d.promedio)} />
                ))}
                <LabelList dataKey="promedio" position="top" fontSize={10} formatter={(v) => hhmm(Number(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function Dispersion({
  retornos,
  ajustar,
  columna,
  orden,
  titulo,
}: {
  retornos: RetornoRuta[]
  ajustar: boolean
  columna: (r: RetornoRuta) => string
  orden: string[]
  titulo: string
}) {
  const { puntos, promedios } = useMemo(() => {
    const idx = new Map(orden.map((c, i) => [c, i]))
    const puntos: Record<"ok" | "alerta" | "mal", { x: number; y: number; fecha: string; camion: string; col: string; min: number }[]> =
      { ok: [], alerta: [], mal: [] }
    retornos.forEach((r, i) => {
      const col = columna(r)
      const x = idx.get(col)
      if (x === undefined) return
      const min = minutosAjustados(r, ajustar)
      // Jitter fijo por posición: los puntos del mismo día no se tapan y no «bailan» al re-renderizar.
      const jitter = (((i * 37) % 100) / 100 - 0.5) * 0.55
      puntos[nivelTiempo(min)].push({ x: x + jitter, y: horas(min), fecha: r.fecha, camion: camionDe(r), col, min })
    })
    const promedios = agruparPor(retornos, columna, ajustar)
      .filter((g) => idx.has(g.clave))
      .map((g) => ({ x: idx.get(g.clave)!, y: horas(g.promedio), col: g.clave, min: g.promedio, fecha: "", camion: "" }))
    return { puntos, promedios }
  }, [retornos, ajustar, columna, orden])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cada punto es un día de un camión; la raya negra es el promedio. Muchos puntos rojos = problema de todos los días;
          pocos puntos sueltos arriba = días puntuales.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="h-80" style={{ minWidth: Math.max(480, orden.length * 70) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[-0.6, orden.length - 0.4]}
                  ticks={orden.map((_, i) => i)}
                  tickFormatter={(i: number) => orden[i] ?? ""}
                  fontSize={11}
                  interval={0}
                />
                <YAxis type="number" dataKey="y" unit="h" fontSize={11} domain={[0, (max: number) => Math.max(Math.ceil(max), 9)]} />
                <ZAxis range={[28, 28]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as { col: string; min: number; fecha: string; camion: string } | undefined
                    if (!active || !p) return null
                    return (
                      <TooltipCaja>
                        {p.fecha ? (
                          <>
                            <p className="font-semibold">{p.fecha} · {p.camion}</p>
                            <p>{p.col} · {hhmm(p.min)}</p>
                          </>
                        ) : (
                          <p className="font-semibold">Promedio {p.col}: {hhmm(p.min)}</p>
                        )}
                      </TooltipCaja>
                    )
                  }}
                />
                <ReferenceLine y={META_H} stroke="#10B981" strokeDasharray="5 5" />
                {(["ok", "alerta", "mal"] as const).map((n) => (
                  <Scatter key={n} data={puntos[n]} fill={COLOR_NIVEL[n]} fillOpacity={0.55} isAnimationActive={false} />
                ))}
                <Scatter
                  data={promedios}
                  isAnimationActive={false}
                  shape={(props: { cx?: number; cy?: number }) => (
                    <rect x={(props.cx ?? 0) - 18} y={(props.cy ?? 0) - 2} width={36} height={4} rx={2} fill="#0f172a" />
                  )}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MapaCalor({
  retornos,
  ajustar,
  onElegir,
}: {
  retornos: RetornoRuta[]
  ajustar: boolean
  onElegir: (camion: string) => void
}) {
  const { meses, filas } = useMemo(() => {
    const meses = mesesDe(retornos)
    const serie = serieMensualPor(retornos, camionDe, ajustar)
    const total = agruparPor(retornos, camionDe, ajustar)
    const filas = total.map((g) => ({ camion: g.clave, total: g, porMes: serie.get(g.clave) }))
    return { meses, filas }
  }, [retornos, ajustar])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Mapa de calor: camión × mes</CardTitle>
        <p className="text-xs text-muted-foreground">
          Promedio de cada camión en cada mes (el número chico es la cantidad de retornos). Tocá un camión para ver su ficha.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white px-2 py-1 text-left font-medium text-muted-foreground">Camión</th>
                {meses.map((m) => (
                  <th key={m} className="px-2 py-1 text-center font-medium text-muted-foreground">
                    {etiquetaMes(m)}
                  </th>
                ))}
                <th className="px-2 py-1 text-center font-medium text-muted-foreground">Período</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.camion}>
                  <td className="sticky left-0 bg-white px-1">
                    <button
                      type="button"
                      onClick={() => onElegir(f.camion)}
                      className="font-mono font-medium text-slate-800 underline-offset-2 hover:underline"
                    >
                      {f.camion}
                    </button>
                  </td>
                  {meses.map((m) => {
                    const p = f.porMes?.get(m)
                    return (
                      <td
                        key={m}
                        className="min-w-16 rounded px-2 py-1.5 text-center"
                        style={p ? { backgroundColor: colorTiempo(p.promedio) + "33", color: "#0f172a" } : undefined}
                      >
                        {p ? (
                          <>
                            <span className="font-semibold">{hhmm(p.promedio)}</span>
                            <span className="ml-1 text-[10px] text-slate-500">{p.n}</span>
                          </>
                        ) : (
                          <span className="text-slate-300">·</span>
                        )}
                      </td>
                    )
                  })}
                  <td
                    className="min-w-16 rounded px-2 py-1.5 text-center font-bold"
                    style={{ backgroundColor: colorTiempo(f.total.promedio) + "55" }}
                  >
                    {hhmm(f.total.promedio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function FichaCamion({
  camion,
  retornos,
  flota,
  ajustar,
}: {
  camion: string
  retornos: RetornoRuta[]
  flota: RetornoRuta[]
  ajustar: boolean
}) {
  const frecuente = ciudadFrecuente(retornos)
  const data = useMemo(() => {
    const propio = serieMensualPor(retornos, () => camion, ajustar).get(camion)
    const todos = serieMensualPor(flota, () => "flota", ajustar).get("flota")
    return mesesDe(flota).map((mes) => ({
      mes: etiquetaMes(mes),
      camion: propio?.get(mes) ? horas(propio.get(mes)!.promedio) : null,
      flota: todos?.get(mes) ? horas(todos.get(mes)!.promedio) : null,
    }))
  }, [retornos, flota, camion, ajustar])
  const ultimos = [...retornos]
    .sort((a, b) => (b.fecha + (b.hora ?? "")).localeCompare(a.fecha + (a.hora ?? "")))
    .slice(0, 10)

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4" /> {camion} contra la flota
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Promedio mensual del camión y de todos los camiones.
              {frecuente && ` Reparte más que nada en ${frecuente}.`}
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" fontSize={11} />
                  <YAxis fontSize={11} unit="h" domain={[0, (max: number) => Math.max(Math.ceil(max), 9)]} />
                  <Tooltip formatter={(v, name) => [hhmm(Number(v) * 60), name === "camion" ? camion : "Flota"]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "camion" ? camion : "Flota")} />
                  <ReferenceLine y={META_H} stroke="#10B981" strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="flota" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls />
                  <Line type="monotone" dataKey="camion" stroke="#2563EB" strokeWidth={3} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <DiaSemana retornos={retornos} ajustar={ajustar} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Últimos retornos de {camion}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Ciudad</th>
                  <th className="py-2 pr-3 font-medium">Chofer</th>
                  <th className="py-2 pr-3 text-right font-medium">Tiempo</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {ultimos.map((r) => {
                  const min = minutosAjustados(r, ajustar)
                  return (
                    <tr key={r.id ?? r.fecha} className="border-b last:border-0">
                      <td className="py-2 pr-3">{r.fecha}</td>
                      <td className="py-2 pr-3">{ciudadDe(r)}</td>
                      <td className="py-2 pr-3">{r.chofer ?? "—"}</td>
                      <td className="py-2 pr-3 text-right font-semibold" style={{ color: colorTiempo(min) }}>
                        {hhmm(min)}
                      </td>
                      <td className="py-2 text-right">
                        {r.id && (
                          <Link href={`/vehiculos/checklist/${r.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
