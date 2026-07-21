"use client"

import { useMemo, useState } from "react"
import { claveSemana, rangoDeSemana, semanaDelAnio } from "@/lib/tiempo-interno"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts"
import type { TiKpis, TiMensual, TiRegistro } from "@/types/database"
import { TiPlanAccionSection } from "./tiempo-interno-plan-accion-section"
import {
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  BarChart3,
  Minus,
} from "lucide-react"

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

function color(ti: number) {
  return ti <= 30 ? "#10B981" : ti <= 45 ? "#F59E0B" : "#EF4444"
}

function TiBadge({ ti }: { ti: number }) {
  if (ti <= 30) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{ti} min</Badge>
  if (ti <= 45) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{ti} min</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{ti} min</Badge>
}

const MOTIVO_LABEL: Record<string, string> = {
  sin_match: "Chofer sin legajo",
  sin_biometrico: "Sin fichaje de salida",
  no_ficha: "No ficha (fuera del reloj)",
  negativo: "Salida antes del retorno",
  outlier: "Fuera de rango (>3h)",
}

function Tendencia({ mensual }: { mensual: TiMensual[] }) {
  if (mensual.length < 2) return <span className="text-sm text-muted-foreground">Sin datos suficientes</span>
  const last3 = mensual.slice(-3)
  const diff = last3[last3.length - 1].promedio_minutos - last3[0].promedio_minutos
  if (diff < -2) return (
    <span className="flex items-center gap-1 text-sm font-medium text-green-600">
      <TrendingDown className="h-4 w-4" /> Mejora ({Math.abs(diff)} min)
    </span>
  )
  if (diff > 2) return (
    <span className="flex items-center gap-1 text-sm font-medium text-red-600">
      <TrendingUp className="h-4 w-4" /> Deterioro (+{diff} min)
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-sm font-medium text-slate-600">
      <Minus className="h-4 w-4" /> Estable
    </span>
  )
}

interface Props {
  kpis: TiKpis
  planesResumen: import("@/types/database").TiPlanResumen[]
}

export function TiempoInternoClient({ kpis, planesResumen }: Props) {
  const [tab, setTab] = useState("semanal")

  const semanalData = kpis.semanal.map((s) => ({
    name: `S${s.semana}`, ti: s.promedio_minutos, pctMeta: s.pct_dentro_meta, total: s.total,
  }))
  const mensualData = kpis.mensual.map((m) => ({
    name: MESES[m.mes], ti: m.promedio_minutos, pctMeta: m.pct_dentro_meta, total: m.total,
  }))
  const coberturaPct = kpis.totalRetornos ? Math.round((kpis.conTi / kpis.totalRetornos) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tiempo Interno (TI)</h1>
        <p className="text-sm text-muted-foreground">
          Desde el checklist de retorno al CD hasta el fichaje de salida del chofer — Pilar Entrega 1.3
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">TI Promedio</p>
                <p className={`text-3xl font-bold ${
                  kpis.promedioMinutos <= 30 ? "text-green-600" : kpis.promedioMinutos <= 45 ? "text-amber-600" : "text-red-600"
                }`}>
                  {kpis.promedioMinutos} min
                </p>
              </div>
              <div className={`rounded-full p-3 ${
                kpis.promedioMinutos <= 30 ? "bg-green-100" : kpis.promedioMinutos <= 45 ? "bg-amber-100" : "bg-red-100"
              }`}>
                <Clock className={`h-5 w-5 ${
                  kpis.promedioMinutos <= 30 ? "text-green-600" : kpis.promedioMinutos <= 45 ? "text-amber-600" : "text-red-600"
                }`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Meta: ≤ {kpis.metaMinutos} min · mediana {kpis.mediana} min</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">% Dentro Meta</p>
                <p className={`text-3xl font-bold ${
                  kpis.pctDentroMeta >= kpis.pctMetaMinimo ? "text-green-600" : kpis.pctDentroMeta >= 50 ? "text-amber-600" : "text-red-600"
                }`}>
                  {kpis.pctDentroMeta}%
                </p>
              </div>
              <div className={`rounded-full p-3 ${
                kpis.pctDentroMeta >= kpis.pctMetaMinimo ? "bg-green-100" : kpis.pctDentroMeta >= 50 ? "bg-amber-100" : "bg-red-100"
              }`}>
                <Target className={`h-5 w-5 ${
                  kpis.pctDentroMeta >= kpis.pctMetaMinimo ? "text-green-600" : kpis.pctDentroMeta >= 50 ? "text-amber-600" : "text-red-600"
                }`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Meta: ≥ {kpis.pctMetaMinimo}% — {kpis.dentroMeta}/{kpis.conTi} con TI
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cobertura</p>
                <p className="text-3xl font-bold text-slate-900">{coberturaPct}%</p>
              </div>
              <div className="rounded-full bg-blue-100 p-3">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {kpis.conTi}/{kpis.totalRetornos} retornos con TI calculable
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sin fichaje salida</p>
                <p className={`text-3xl font-bold ${kpis.sinBiometrico > 0 ? "text-amber-600" : "text-slate-900"}`}>
                  {kpis.sinBiometrico}
                </p>
              </div>
              <div className="rounded-full bg-amber-100 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Olvidos de fichada ({kpis.excluidos} excluidos por rango)
              {kpis.noFicha > 0 && (
                <>
                  {" · "}
                  <span className="font-medium">{kpis.noFicha}</span> de choferes que
                  no fichan, contados aparte
                </>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tendencia 3 meses</p>
                <div className="mt-1"><Tendencia mensual={kpis.mensual} /></div>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <BarChart3 className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">DPO: mejora sostenida</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="semanal">Semanal</TabsTrigger>
          <TabsTrigger value="mensual">Mensual</TabsTrigger>
        </TabsList>

        {(["semanal", "mensual"] as const).map((modo) => {
          const data = modo === "semanal" ? semanalData : mensualData
          const xlabel = modo === "semanal" ? "Semana" : "Mes"
          return (
            <TabsContent key={modo} value={modo}>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">TI Promedio por {xlabel}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis fontSize={11} unit=" min" />
                          <Tooltip formatter={(v) => [`${v} min`, "TI"]} />
                          <ReferenceLine y={30} stroke="#10B981" strokeDasharray="5 5" label={{ value: "Meta 30min", position: "right", fontSize: 10 }} />
                          <Bar dataKey="ti" radius={[4, 4, 0, 0]}>
                            {data.map((e, i) => (<Cell key={i} fill={color(e.ti)} />))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">% Dentro de Meta por {xlabel}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                          <Tooltip formatter={(v) => [`${v}%`, "% Meta"]} />
                          <ReferenceLine y={65} stroke="#10B981" strokeDasharray="5 5" label={{ value: "65%", position: "right", fontSize: 10 }} />
                          <Line type="monotone" dataKey="pctMeta" stroke="#F59E0B" strokeWidth={2} dot={{ fill: "#F59E0B", r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )
        })}
      </Tabs>

      {/* Plan de Acción R1.3.4 */}
      <TiPlanAccionSection resumen={planesResumen} />

      {/* Registros */}
      <RegistrosTable registros={kpis.registros} />

      {/* Calidad del dato: sin esto, dos ajustes quedan invisibles y el que mire
          la serie no entiende por qué mayo cambió ni qué pasó con los faltantes. */}
      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="pt-6">
          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-medium text-slate-700">Sobre el dato</p>
            <p>
              <span className="font-medium">Reloj desfasado del 6 al 18 de mayo:</span> el
              biométrico grabó con 3 horas de más (la mediana de entrada saltó de 06:56 a
              09:55 y volvió sola el 19). El desfase se corrige en el cálculo, así que esas
              semanas ya no muestran los 91 y 121 min que publicaban antes. No afectó al
              ausentismo ni a las horas trabajadas: ahí entrada y salida se corrieron igual
              y la resta se cancela.
            </p>
            {kpis.choferesSinFichaje.length > 0 && (
              <p>
                <span className="font-medium">Fuera de la medición:</span>{" "}
                {kpis.choferesSinFichaje.join(", ")} — no tienen ninguna marca en el reloj
                en todo el período, así que sus retornos no cuentan como dato faltante. Si
                empiezan a fichar, entran solos.
              </p>
            )}
            <p>
              <span className="font-medium">Salida antes del retorno:</span> se descartan.
              El checklist no guarda una hora de retorno declarada sino el momento en que
              se envía el formulario, así que cargarlo tarde da un TI negativo.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function horaArg(iso: string | null): string {
  if (!iso) return "—"
  // iso ya está en UTC real → mostrar en ARG (UTC-3)
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000)
  return d.toISOString().slice(11, 16)
}

const TODAS_LAS_SEMANAS = "__todas__"
const FILAS_POR_PAGINA = 100

function RegistrosTable({ registros }: { registros: TiRegistro[] }) {
  const [semanaSel, setSemanaSel] = useState<string>(TODAS_LAS_SEMANAS)
  const [tope, setTope] = useState(FILAS_POR_PAGINA)

  // Semanas presentes en los datos, de la más reciente a la más vieja, con el
  // rango de fechas al lado: "Semana 29" solo no le dice nada a nadie.
  const semanas = useMemo(() => {
    const porClave = new Map<string, { clave: string; semana: number; fechas: string[] }>()
    for (const r of registros) {
      const { semana } = semanaDelAnio(r.fecha)
      const clave = claveSemana(r.fecha)
      if (!porClave.has(clave)) porClave.set(clave, { clave, semana, fechas: [] })
      porClave.get(clave)!.fechas.push(r.fecha)
    }
    return [...porClave.values()]
      .map((g) => ({
        clave: g.clave,
        label: `Semana ${g.semana} (${rangoDeSemana(g.fechas)})`,
        cantidad: g.fechas.length,
      }))
      .sort((a, b) => b.clave.localeCompare(a.clave, undefined, { numeric: true }))
  }, [registros])

  const filtrados = useMemo(
    () =>
      semanaSel === TODAS_LAS_SEMANAS
        ? registros
        : registros.filter((r) => claveSemana(r.fecha) === semanaSel),
    [registros, semanaSel],
  )

  const visibles = filtrados.slice(0, tope)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Detalle por retorno</CardTitle>
            <p className="text-xs text-muted-foreground">
              TI = fichaje de salida − checklist de retorno, por chofer/día. Las filas sin TI se muestran con su motivo.
            </p>
          </div>
          {semanas.length > 0 && (
            <select
              value={semanaSel}
              onChange={(e) => {
                setSemanaSel(e.target.value)
                setTope(FILAS_POR_PAGINA)
              }}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
            >
              <option value={TODAS_LAS_SEMANAS}>
                Todas las semanas ({registros.length})
              </option>
              {semanas.map((s) => (
                <option key={s.clave} value={s.clave}>
                  {s.label} — {s.cantidad}
                </option>
              ))}
            </select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filtrados.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {registros.length === 0
              ? "Sin retornos en el período."
              : "Sin retornos en la semana elegida."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead>Dominio</TableHead>
                  <TableHead>Retorno</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead className="text-right">TI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{r.fecha}</TableCell>
                    <TableCell className="text-sm">{r.chofer}</TableCell>
                    <TableCell className="font-medium">{r.dominio}</TableCell>
                    <TableCell className="text-sm font-mono">{horaArg(r.hora_retorno)}</TableCell>
                    <TableCell className="text-sm font-mono">{horaArg(r.hora_salida)}</TableCell>
                    <TableCell className="text-right">
                      {r.motivo_sin_dato === null && r.ti_minutos != null ? (
                        <TiBadge ti={r.ti_minutos} />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {MOTIVO_LABEL[r.motivo_sin_dato ?? ""] ?? "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* Antes cortaba en 100 filas sin avisar: se veía como si no hubiera más. */}
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Mostrando {visibles.length} de {filtrados.length}
                {semanaSel !== TODAS_LAS_SEMANAS && " en la semana elegida"}
              </p>
              {visibles.length < filtrados.length && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTope((t) => t + FILAS_POR_PAGINA)}
                >
                  Ver {Math.min(FILAS_POR_PAGINA, filtrados.length - visibles.length)} más
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
