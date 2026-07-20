"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Map as MapIcon,
  Target,
  Sparkles,
  TrendingDown,
  AlertTriangle,
  Plus,
  CalendarCheck,
} from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  crearPlanTerritorial,
  agregarAvancePlanTerritorial,
  registrarRevision,
  simularRelocalizacion,
  type Territorio,
  type CiudadResumen,
  type Escenario,
  type PlanTerritorial,
  type RevisionTerritorial,
  type Simulacion,
  type PalancaPlan,
} from "@/actions/plan-territorial"

const PILAR_PLANEAMIENTO_COLOR = "#EC4899"

const MESES = [
  "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const PALANCA_LABEL: Record<PalancaPlan, string> = {
  frecuencia: "Frecuencia de visita",
  drop_size: "Drop size",
  cartera: "Revisión de cartera",
  relocalizacion: "Relocalización del CD",
  otro: "Otra",
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}

function pesos(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return "$" + Math.round(n).toLocaleString("es-AR")
}

function num(n: number | null | undefined, dec = 2): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

interface Props {
  anio: number
  rol: string
  territorio: Territorio | null
  territorioError: string | null
  escenarios: Escenario[]
  planes: PlanTerritorial[]
  revisiones: RevisionTerritorial[]
  perfiles: Array<{ id: string; nombre: string }>
}

export function PlanTerritorialClient({
  anio,
  rol,
  territorio,
  territorioError,
  escenarios,
  planes,
  revisiones,
  perfiles,
}: Props) {
  const esEditor = ["admin", "supervisor", "admin_rrhh"].includes(rol)

  const base = escenarios.find((e) => e.tipo === "base")
  const objetivo = escenarios.find((e) => e.tipo === "objetivo")
  const dream = escenarios.find((e) => e.tipo === "dream")

  // El VLC/HL "base" no se carga a mano: es el del territorio vivo.
  const vlcBase = territorio?.total.costo_x_hl ?? null

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/indicadores"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
        </Link>
      </div>

      <div className="flex items-start gap-3">
        <div
          className="rounded-xl p-3"
          style={{
            backgroundColor: `${PILAR_PLANEAMIENTO_COLOR}18`,
            color: PILAR_PLANEAMIENTO_COLOR,
          }}
        >
          <MapIcon className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Plan Territorial (5.1)
          </h1>
          <p className="text-sm text-muted-foreground">
            Reducir el VLC/HL reorganizando el territorio: frecuencia, drop size y
            localización del centro de distribución.
          </p>
        </div>
      </div>

      {territorioError && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-2 pt-6 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No se pudo calcular el costo por ciudad: {territorioError}
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="escenarios">
        <TabsList>
          <TabsTrigger value="escenarios">Escenarios</TabsTrigger>
          <TabsTrigger value="ciudades">Diagnóstico por ciudad</TabsTrigger>
          <TabsTrigger value="planes">
            Planes de acción ({planes.length})
          </TabsTrigger>
          <TabsTrigger value="revisiones">Revisión mensual</TabsTrigger>
        </TabsList>

        {/* ---------------- Escenarios (R5.1.1) ---------------- */}
        <TabsContent value="escenarios" className="space-y-4 pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <EscenarioCard
              icono={<TrendingDown className="h-5 w-5" />}
              titulo="Base — hoy"
              subtitulo={base?.nombre ?? "VLC/HL actual"}
              valor={vlcBase}
              detalle={`${territorio?.meses.length ?? 0} meses de ${anio} con costo cargado`}
              color="#334155"
            />
            <EscenarioCard
              icono={<Target className="h-5 w-5" />}
              titulo="Objetivo 2026"
              subtitulo={objetivo?.nombre ?? "Meta del año"}
              valor={objetivo?.vlc_hl ?? null}
              detalle={
                vlcBase && objetivo?.vlc_hl
                  ? `${num((100 * (objetivo.vlc_hl - vlcBase)) / vlcBase, 1)}% vs base`
                  : "Sin meta cargada"
              }
              color="#0d9488"
            />
            <EscenarioCard
              icono={<Sparkles className="h-5 w-5" />}
              titulo="De ensueño"
              subtitulo={dream?.nombre ?? "Escenario aspiracional"}
              valor={dream?.vlc_hl ?? null}
              detalle={
                vlcBase && dream?.vlc_hl
                  ? `${num((100 * (dream.vlc_hl - vlcBase)) / vlcBase, 1)}% vs base`
                  : "Corré la simulación para calcularlo"
              }
              color={PILAR_PLANEAMIENTO_COLOR}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Cómo se calcula el VLC/HL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                VLC/HL = (costo de almacén + costo de distancia + costo de
                distribución) ÷ hectolitros vendidos. Sale en vivo del mismo
                modelo que alimenta el indicador Costo por PDV, así que el número
                de esta página y el de ese indicador son el mismo por
                construcción.
              </p>
              <p className="text-amber-700">
                El costo por ciudad es un <strong>reparto</strong>, no un costo
                medido: almacén y distribución se prorratean por bultos y
                entregas, y la distancia se imputa por los km de ruta desde el CD.
                El componente puramente variable queda pendiente de definir con
                Finanzas.
              </p>
            </CardContent>
          </Card>

          {dream && (
            <SimuladorRelocalizacion
              anio={anio}
              mesesDisponibles={territorio?.meses ?? []}
              dream={dream}
            />
          )}
        </TabsContent>

        {/* ---------------- Diagnóstico por ciudad ---------------- */}
        <TabsContent value="ciudades" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Costo y operación por ciudad · {anio} acumulado
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-right">Km</TableHead>
                    <TableHead className="text-right">PDV</TableHead>
                    <TableHead className="text-right">HL</TableHead>
                    <TableHead className="text-right">$/HL</TableHead>
                    <TableHead className="text-right">Entregas</TableHead>
                    <TableHead className="text-right">HL/entrega</TableHead>
                    <TableHead className="text-right">Bultos/entrega</TableHead>
                    <TableHead className="text-right">Entregas/PDV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(territorio?.ciudades ?? []).map((c) => (
                    <TableRow key={c.ciudad}>
                      <TableCell className="font-medium">{c.ciudad}</TableCell>
                      <TableCell className="text-right">
                        {c.km == null ? "—" : num(c.km, 0)}
                      </TableCell>
                      <TableCell className="text-right">{c.pdv}</TableCell>
                      <TableCell className="text-right">{num(c.hl, 0)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {pesos(c.costo_x_hl)}
                      </TableCell>
                      <TableCell className="text-right">
                        {num(c.entregas, 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {num(c.hl_por_entrega)}
                      </TableCell>
                      <TableCell className="text-right">
                        {num(c.bultos_por_entrega)}
                      </TableCell>
                      <TableCell className="text-right">
                        {num(c.entregas_por_pdv, 1)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {territorio && (
                    <TableRow className="border-t-2 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        {territorio.total.pdv}
                      </TableCell>
                      <TableCell className="text-right">
                        {num(territorio.total.hl, 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {pesos(territorio.total.costo_x_hl)}
                      </TableCell>
                      <TableCell className="text-right">
                        {num(territorio.total.entregas, 0)}
                      </TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {(territorio?.ciudades ?? []).map((c) => (
            <SerieCiudad key={c.ciudad} ciudad={c} planes={planes} />
          ))}
        </TabsContent>

        {/* ---------------- Planes (R5.1.2 / R5.1.4) ---------------- */}
        <TabsContent value="planes" className="space-y-4 pt-4">
          {esEditor && (
            <NuevoPlanDialog
              ciudades={(territorio?.ciudades ?? []).map((c) => c.ciudad)}
              perfiles={perfiles}
              territorio={territorio}
            />
          )}
          {planes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay planes territoriales cargados.
            </p>
          )}
          {planes.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              ciudad={territorio?.ciudades.find((c) => c.ciudad === p.ciudad)}
              esEditor={esEditor}
            />
          ))}
        </TabsContent>

        {/* ---------------- Revisiones (R5.1.3) ---------------- */}
        <TabsContent value="revisiones" className="space-y-4 pt-4">
          <Card className="border-slate-200">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              El 5.1 pide que ventas y operaciones revisen el progreso{" "}
              <strong>como mínimo una vez por mes</strong>. Cada registro de acá
              es la evidencia de esa revisión.
            </CardContent>
          </Card>

          {esEditor && (
            <NuevaRevisionDialog anio={anio} vlcActual={vlcBase} />
          )}

          {revisiones.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin revisiones registradas en {anio}.
            </p>
          )}
          <div className="space-y-3">
            {revisiones.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-1 pt-6">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">
                      {MESES[r.mes]} {r.anio}
                    </p>
                    <Badge variant="secondary">{pesos(r.vlc_hl_mes)} /HL</Badge>
                  </div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Participantes: </span>
                    {r.participantes ?? "—"}
                  </p>
                  {r.conclusion && (
                    <p className="whitespace-pre-wrap text-sm">{r.conclusion}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ==================================================================
// Sub-componentes
// ==================================================================

function EscenarioCard({
  icono,
  titulo,
  subtitulo,
  valor,
  detalle,
  color,
}: {
  icono: React.ReactNode
  titulo: string
  subtitulo: string
  valor: number | null
  detalle: string
  color: string
}) {
  return (
    <Card className="border-l-4" style={{ borderLeftColor: color }}>
      <CardContent className="space-y-1 pt-6">
        <div className="flex items-center gap-2" style={{ color }}>
          {icono}
          <span className="text-sm font-semibold">{titulo}</span>
        </div>
        <p className="text-3xl font-bold text-slate-900">{pesos(valor)}</p>
        <p className="text-xs text-muted-foreground">{subtitulo}</p>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </CardContent>
    </Card>
  )
}

/** Serie mensual de $/HL con la fecha de implementación marcada (R5.1.4). */
function SerieCiudad({
  ciudad,
  planes,
}: {
  ciudad: CiudadResumen
  planes: PlanTerritorial[]
}) {
  const datos = ciudad.serie.map((m) => ({
    mes: MESES[m.mes],
    mesNum: m.mes,
    costo: Math.round(m.costo_x_hl),
  }))

  // Si hay un plan implementado en esta ciudad, marcamos el mes: es lo que
  // permite decir "acá tocamos" y leer el antes/después.
  const marcas = planes
    .filter((p) => p.ciudad === ciudad.ciudad && p.fecha_implementacion)
    .map((p) => ({
      mes: MESES[Number(p.fecha_implementacion!.slice(5, 7))],
      titulo: p.titulo,
    }))

  if (datos.length < 2) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {ciudad.ciudad} — $/HL mes a mes
        </CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" fontSize={12} />
            <YAxis fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <RTooltip
              formatter={(v) => [pesos(Number(v)), "$/HL"]}
              labelClassName="text-xs"
            />
            {marcas.map((m, i) => (
              <ReferenceLine
                key={`${m.mes}-${i}`}
                x={m.mes}
                stroke={PILAR_PLANEAMIENTO_COLOR}
                strokeDasharray="4 4"
                label={{ value: "implementación", fontSize: 10, position: "top" }}
              />
            ))}
            <Line
              type="monotone"
              dataKey="costo"
              stroke={PILAR_PLANEAMIENTO_COLOR}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function SimuladorRelocalizacion({
  anio,
  mesesDisponibles,
  dream,
}: {
  anio: number
  mesesDisponibles: number[]
  dream: Escenario
}) {
  const [km, setKm] = useState<Record<string, number>>(dream.km_ciudad ?? {})
  const [mes, setMes] = useState<number>(
    mesesDisponibles[mesesDisponibles.length - 1] ?? 1,
  )
  const [sim, setSim] = useState<Simulacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  const ciudades = useMemo(() => Object.keys(km).sort(), [km])

  function correr() {
    setError(null)
    startTransition(async () => {
      const r = await simularRelocalizacion(anio, mes, km)
      if ("error" in r) {
        setError(r.error)
        setSim(null)
      } else {
        setSim(r.data)
      }
    })
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Simulador — ¿y si el CD estuviera en otro lado?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Recalcula el costo del mes con otra matriz de distancias, sin tocar
          nada real. Es el mismo motor del costo vigente: lo único que cambia son
          los km.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Mes base</Label>
            <select
              className="mt-1 block h-9 rounded-md border border-slate-300 px-2 text-sm"
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
            >
              {mesesDisponibles.map((m) => (
                <option key={m} value={m}>
                  {MESES[m]}
                </option>
              ))}
            </select>
          </div>
          {ciudades.map((c) => (
            <div key={c}>
              <Label className="text-xs">{c}</Label>
              <Input
                type="number"
                className="mt-1 w-24"
                value={km[c] ?? 0}
                onChange={(e) =>
                  setKm({ ...km, [c]: Number(e.target.value) })
                }
              />
            </div>
          ))}
          <Button onClick={correr} disabled={pendiente}>
            {pendiente ? "Calculando…" : "Simular"}
          </Button>
        </div>

        <p className="text-xs text-amber-700">
          Los km precargados son estimados de ruta desde San Nicolás. Hay que
          validarlos contra distancias reales antes de presentar el número.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {sim && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-muted-foreground">
                  VLC/HL total (hoy y simulado)
                </p>
                <p className="text-2xl font-bold">{pesos(sim.vlc_hl_actual)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Peso de la distancia
                </p>
                <p className="text-2xl font-bold text-emerald-600">
                  {num(sim.distancia_delta_pct, 1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {pesos(sim.costo_distancia_actual)} →{" "}
                  {pesos(sim.costo_distancia_simulado)}
                </p>
              </div>
            </div>

            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="flex items-start gap-2 pt-6 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>El VLC/HL total no se mueve, y es correcto que así
                  sea.</strong> El modelo parte del costo que Finanzas cargó para
                  el mes y lo reparte entre los PDV: cambiar los km cambia{" "}
                  <em>cómo se reparte</em>, no cuánto se gasta. Lo que ves abajo
                  es la redistribución entre ciudades y cuánto menos pesa la
                  distancia. Para convertir eso en un ahorro en pesos hay que
                  valorizar los km evitados a $/km y bajar el pool — decisión de
                  modelo todavía pendiente.
                </span>
              </CardContent>
            </Card>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ciudad</TableHead>
                  <TableHead className="text-right">Km hoy</TableHead>
                  <TableHead className="text-right">Km simulado</TableHead>
                  <TableHead className="text-right">$/HL hoy</TableHead>
                  <TableHead className="text-right">$/HL simulado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sim.por_ciudad.map((c) => (
                  <TableRow key={c.ciudad}>
                    <TableCell>{c.ciudad}</TableCell>
                    <TableCell className="text-right">
                      {c.km_actual == null ? "—" : num(c.km_actual, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.km_simulado == null ? "—" : num(c.km_simulado, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {pesos(c.costo_x_hl_actual)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {pesos(c.costo_x_hl_simulado)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* No ofrecemos "guardar como VLC/HL de ensueño": el número que
                devuelve la simulación es igual al actual, así que guardarlo
                daría un escenario de ensueño falso. Se habilita cuando el
                modelo sepa valorizar los km evitados. */}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PlanCard({
  plan,
  ciudad,
  esEditor,
}: {
  plan: PlanTerritorial
  ciudad: CiudadResumen | undefined
  esEditor: boolean
}) {
  const actual = ciudad?.costo_x_hl ?? null
  const delta =
    plan.linea_base && actual
      ? (100 * (actual - plan.linea_base)) / plan.linea_base
      : null

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900">{plan.titulo}</p>
              <Badge variant="outline">{plan.ciudad}</Badge>
              <Badge variant="secondary">{PALANCA_LABEL[plan.palanca]}</Badge>
            </div>
            {plan.descripcion && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {plan.descripcion}
              </p>
            )}
          </div>
          <Badge>{ESTADO_LABEL[plan.estado] ?? plan.estado}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Línea base</p>
            <p className="font-semibold">{pesos(plan.linea_base)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Meta</p>
            <p className="font-semibold">{pesos(plan.meta)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Hoy</p>
            <p className="font-semibold">{pesos(actual)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">vs base</p>
            <p
              className={`font-semibold ${
                delta == null
                  ? ""
                  : delta < 0
                    ? "text-emerald-600"
                    : "text-red-600"
              }`}
            >
              {delta == null ? "—" : `${num(delta, 1)}%`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            Comercial: {plan.responsable_comercial_nombre ?? "— sin asignar —"}
          </span>
          <span>
            Logística: {plan.responsable_logistica_nombre ?? "— sin asignar —"}
          </span>
          {plan.fecha_implementacion && (
            <span>Implementado: {plan.fecha_implementacion}</span>
          )}
        </div>

        {(!plan.responsable_comercial_nombre ||
          !plan.responsable_logistica_nombre) && (
          <p className="flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            El 5.1 pide alineación de ventas y operaciones: cargá los dos
            responsables.
          </p>
        )}

        {esEditor && <NuevoAvanceDialog plan={plan} costoActual={actual} />}
      </CardContent>
    </Card>
  )
}

function NuevoPlanDialog({
  ciudades,
  perfiles,
  territorio,
}: {
  ciudades: string[]
  perfiles: Array<{ id: string; nombre: string }>
  territorio: Territorio | null
}) {
  const [abierto, setAbierto] = useState(false)
  const [ciudad, setCiudad] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  // Precargamos la línea base con el $/HL vigente de la ciudad elegida: es
  // justamente el "antes" contra el que se va a medir la mejora.
  const lineaBaseSugerida =
    territorio?.ciudades.find((c) => c.ciudad === ciudad)?.costo_x_hl ?? null

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const r = await crearPlanTerritorial(formData)
      if ("error" in r) setError(r.error)
      else setAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button />}>
        <Plus className="h-4 w-4" /> Nuevo plan territorial
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo plan territorial</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ciudad">Ciudad</Label>
              <select
                id="ciudad"
                name="ciudad"
                required
                className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
              >
                <option value="">Elegir…</option>
                {ciudades.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="palanca">Palanca</Label>
              <select
                id="palanca"
                name="palanca"
                className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
              >
                {(
                  Object.keys(PALANCA_LABEL) as PalancaPlan[]
                ).map((p) => (
                  <option key={p} value={p}>
                    {PALANCA_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" name="titulo" required className="mt-1" />
          </div>

          <div>
            <Label htmlFor="descripcion">Qué se va a hacer</Label>
            <Textarea id="descripcion" name="descripcion" rows={3} className="mt-1" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="linea_base">Línea base ($/HL)</Label>
              <Input
                id="linea_base"
                name="linea_base"
                type="number"
                step="0.01"
                className="mt-1"
                defaultValue={
                  lineaBaseSugerida ? Math.round(lineaBaseSugerida) : ""
                }
              />
            </div>
            <div>
              <Label htmlFor="meta">Meta ($/HL)</Label>
              <Input id="meta" name="meta" type="number" step="0.01" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="fecha_implementacion">Implementación</Label>
              <Input
                id="fecha_implementacion"
                name="fecha_implementacion"
                type="date"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="linea_base_desde">Base desde</Label>
              <Input
                id="linea_base_desde"
                name="linea_base_desde"
                type="date"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="linea_base_hasta">Base hasta</Label>
              <Input
                id="linea_base_hasta"
                name="linea_base_hasta"
                type="date"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="responsable_comercial_id">
                Responsable comercial
              </Label>
              <select
                id="responsable_comercial_id"
                name="responsable_comercial_id"
                className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
              >
                <option value="">—</option>
                {perfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="responsable_logistica_id">
                Responsable logística
              </Label>
              <select
                id="responsable_logistica_id"
                name="responsable_logistica_id"
                className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
              >
                <option value="">—</option>
                {perfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Crear plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NuevoAvanceDialog({
  plan,
  costoActual,
}: {
  plan: PlanTerritorial
  costoActual: number | null
}) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const r = await agregarAvancePlanTerritorial(plan.id, formData)
      if ("error" in r) setError(r.error)
      else setAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Cargar avance ({plan.avances_count})
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avance — {plan.titulo}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="comentario">Comentario</Label>
            <Textarea id="comentario" name="comentario" rows={3} required className="mt-1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="costo_x_hl">$/HL al momento</Label>
              <Input
                id="costo_x_hl"
                name="costo_x_hl"
                type="number"
                step="0.01"
                className="mt-1"
                defaultValue={costoActual ? Math.round(costoActual) : ""}
              />
            </div>
            <div>
              <Label htmlFor="nuevo_estado">Estado</Label>
              <select
                id="nuevo_estado"
                name="nuevo_estado"
                className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                defaultValue={plan.estado}
              >
                {Object.keys(ESTADO_LABEL).map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_LABEL[e]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar avance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NuevaRevisionDialog({
  anio,
  vlcActual,
}: {
  anio: number
  vlcActual: number | null
}) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const r = await registrarRevision({
        anio,
        mes: Number(formData.get("mes")),
        participantes: String(formData.get("participantes") ?? ""),
        conclusion: String(formData.get("conclusion") ?? ""),
        vlc_hl_mes: formData.get("vlc_hl_mes")
          ? Number(formData.get("vlc_hl_mes"))
          : null,
      })
      if ("error" in r) setError(r.error)
      else setAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button />}>
        <CalendarCheck className="h-4 w-4" /> Registrar revisión mensual
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revisión mensual — ventas y operaciones</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mes">Mes</Label>
              <select
                id="mes"
                name="mes"
                className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                defaultValue={new Date().getMonth() + 1}
              >
                {MESES.slice(1).map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="vlc_hl_mes">VLC/HL del mes</Label>
              <Input
                id="vlc_hl_mes"
                name="vlc_hl_mes"
                type="number"
                step="0.01"
                className="mt-1"
                defaultValue={vlcActual ? Math.round(vlcActual) : ""}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="participantes">Participantes</Label>
            <Input
              id="participantes"
              name="participantes"
              required
              placeholder="Nombres de ventas y de operaciones"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="conclusion">Conclusión</Label>
            <Textarea id="conclusion" name="conclusion" rows={3} className="mt-1" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
