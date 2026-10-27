"use client"

import { useState, useTransition } from "react"
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
  Pencil,
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
  actualizarPlanTerritorial,
  agregarAvancePlanTerritorial,
  registrarRevision,
  type Territorio,
  type CiudadResumen,
  type Escenario,
  type PlanTerritorial,
  type RevisionTerritorial,
  type PalancaPlan,
} from "@/actions/plan-territorial"
import type { RuteroVigente } from "@/actions/territorial-rutero"
import { MESES, num, pesos } from "./formato"
import { RedisenoRutasSection } from "./rediseno-rutas"

const PILAR_PLANEAMIENTO_COLOR = "#EC4899"


/** Alcance del cambio de rutas: qué rutero tocó el plan. */
const PALANCA_LABEL: Record<PalancaPlan, string> = {
  ambas: "Rutas de entrega + visita",
  entrega: "Rutas de entrega",
  visita: "Rutas de visita (promotores)",
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}


interface AportePlan {
  ciudad: string
  base: number
  meta: number
  hl: number
  /** Cuánto baja el $/HL de TODA la red si esta ciudad llega a su meta. */
  aporte_red: number
}

/**
 * Meses (1-12) en que se implementó alguna etapa de rutas de estos planes, sin
 * repetir. Mira las etapas; si un plan no tiene ninguna documentada, usa su
 * fecha de implementación general.
 */
function mesesImplementacion(planes: PlanTerritorial[]): number[] {
  const meses = new Set<number>()
  for (const p of planes) {
    const fechas = p.etapas.length
      ? p.etapas.map((e) => e.fecha_implementacion)
      : [p.fecha_implementacion]
    for (const f of fechas) if (f) meses.add(Number(f.slice(5, 7)))
  }
  return [...meses].sort((a, b) => a - b)
}

/**
 * Serie mensual del VLC/HL de toda la red: para cada mes se suma el costo y los
 * HL de todas las ciudades y recién ahí se divide. Nunca se promedian los $/HL
 * por ciudad: eso sobre-pondera las ciudades chicas y da otro número.
 */
function serieRedTotal(
  territorio: Territorio | null,
): { mes: number; vlc: number }[] {
  if (!territorio) return []
  const acc = new Map<number, { costo: number; hl: number }>()
  for (const c of territorio.ciudades) {
    for (const m of c.serie) {
      const a = acc.get(m.mes) ?? { costo: 0, hl: 0 }
      a.costo += m.costo_total
      a.hl += m.hl
      acc.set(m.mes, a)
    }
  }
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([mes, a]) => ({ mes, vlc: a.hl ? a.costo / a.hl : 0 }))
}

/**
 * Objetivo de VLC/HL de la red DERIVADO de los planes: si cada ciudad con plan
 * llega a su meta, ¿en cuánto queda el $/HL de toda la red? Así el objetivo no
 * es un número suelto sino la consecuencia de los planes cargados — es lo que
 * ata R5.1.1 (escenario objetivo) con R5.1.2 (planes).
 */
function objetivoDerivado(
  territorio: Territorio | null,
  planes: PlanTerritorial[],
): { vlc: number | null; aportes: AportePlan[] } {
  if (!territorio || !territorio.total.hl) return { vlc: null, aportes: [] }

  // Una ciudad puede tener más de un plan: nos quedamos con la meta más
  // ambiciosa (la más baja) para no contar el ahorro dos veces.
  const metaPorCiudad = new Map<string, number>()
  for (const p of planes) {
    if (p.meta == null) continue
    const actual = metaPorCiudad.get(p.ciudad)
    if (actual == null || p.meta < actual) metaPorCiudad.set(p.ciudad, p.meta)
  }

  const totalHl = territorio.total.hl
  let ahorro = 0
  const aportes: AportePlan[] = []
  for (const [ciudad, meta] of metaPorCiudad) {
    const c = territorio.ciudades.find((x) => x.ciudad === ciudad)
    if (!c) continue
    const delta = c.costo_x_hl - meta
    if (delta <= 0) continue
    const ahorroRed = delta * c.hl
    ahorro += ahorroRed
    aportes.push({
      ciudad,
      base: c.costo_x_hl,
      meta,
      hl: c.hl,
      aporte_red: ahorroRed / totalHl,
    })
  }
  aportes.sort((a, b) => b.aporte_red - a.aporte_red)
  const vlc = (territorio.total.costo_total - ahorro) / totalHl
  return { vlc, aportes }
}

export interface AporteEnsueno {
  ciudad: string
  base: number
  ensueno: number
  hl: number
  /** true si la ciudad ya tiene plan de rutas (su meta es la del plan). */
  con_plan: boolean
}

/**
 * Escenario de ensueño DERIVADO: toda la red con rutas reestructuradas. Las
 * ciudades con plan llegan a su meta; a las demás se les aplica la misma
 * reducción porcentual de $/HL que se fijó como meta en las ciudades con plan
 * (ponderada por volumen). Es una extrapolación para dimensionar cuánto queda
 * por capturar, no un plan: reemplaza al viejo "CD en San Nicolás", que no era
 * un plan territorial.
 */
function ensuenoDerivado(
  territorio: Territorio | null,
  planes: PlanTerritorial[],
): { vlc: number | null; pct: number | null; aportes: AporteEnsueno[] } {
  if (!territorio || !territorio.total.hl) return { vlc: null, pct: null, aportes: [] }

  const metaPorCiudad = new Map<string, number>()
  for (const p of planes) {
    if (p.meta == null) continue
    const actual = metaPorCiudad.get(p.ciudad)
    if (actual == null || p.meta < actual) metaPorCiudad.set(p.ciudad, p.meta)
  }

  // Reducción porcentual comprometida en las ciudades con plan, ponderada por HL.
  let hlPlan = 0
  let costoPlan = 0
  let costoMeta = 0
  for (const [ciudad, meta] of metaPorCiudad) {
    const c = territorio.ciudades.find((x) => x.ciudad === ciudad)
    if (!c || !c.hl) continue
    hlPlan += c.hl
    costoPlan += c.costo_total
    costoMeta += Math.min(meta, c.costo_x_hl) * c.hl
  }
  if (!hlPlan || !costoPlan) return { vlc: null, pct: null, aportes: [] }
  const pct = (costoPlan - costoMeta) / costoPlan

  let costoTotal = 0
  const aportes: AporteEnsueno[] = []
  for (const c of territorio.ciudades) {
    const meta = metaPorCiudad.get(c.ciudad)
    const ens =
      meta != null ? Math.min(meta, c.costo_x_hl) : c.costo_x_hl * (1 - pct)
    costoTotal += ens * c.hl
    aportes.push({
      ciudad: c.ciudad,
      base: c.costo_x_hl,
      ensueno: ens,
      hl: c.hl,
      con_plan: meta != null,
    })
  }
  aportes.sort((a, b) => b.hl - a.hl)
  return { vlc: costoTotal / territorio.total.hl, pct, aportes }
}

interface Props {
  anio: number
  rol: string
  territorio: Territorio | null
  territorioError: string | null
  escenarios: Escenario[]
  planes: PlanTerritorial[]
  /** Rutero vigente de promotores por ciudad (base comercial); null si no respondió. */
  ruteros: Record<string, RuteroVigente | null>
  revisiones: RevisionTerritorial[]
  perfiles: Array<{ id: string; nombre: string }>
  /** Archivos de evidencia del 5.1 (presentaciones de rutas) para linkear desde cada etapa. */
  archivos: ArchivoEvidencia[]
}

export interface ArchivoEvidencia {
  id: string
  titulo: string
  file_name: string
}

export function PlanTerritorialClient({
  anio,
  rol,
  territorio,
  territorioError,
  escenarios,
  planes,
  ruteros,
  revisiones,
  perfiles,
  archivos,
}: Props) {
  const esEditor = ["admin", "supervisor", "admin_rrhh"].includes(rol)

  // Solapa Planes: una pestaña por ciudad, en el orden en que vienen los
  // planes (más nuevo primero), para no tener que bajar por todas las
  // tarjetas. Con los planes de Colón y Ramallo la página ya era larga.
  const ciudadesConPlan = Array.from(new Set(planes.map((p) => p.ciudad)))
  const [ciudadPlanes, setCiudadPlanes] = useState<string>("")
  const ciudadActiva = ciudadesConPlan.includes(ciudadPlanes)
    ? ciudadPlanes
    : (ciudadesConPlan[0] ?? "")

  const base = escenarios.find((e) => e.tipo === "base")
  const objetivo = escenarios.find((e) => e.tipo === "objetivo")
  const dream = escenarios.find((e) => e.tipo === "dream")

  // El VLC/HL "base" no se carga a mano: es el del territorio vivo.
  const vlcBase = territorio?.total.costo_x_hl ?? null

  // El objetivo de la red sale de las metas de los planes. Si además alguien
  // cargó un número a mano en el escenario objetivo, ese manda.
  const obj = objetivoDerivado(territorio, planes)
  const vlcObjetivo = objetivo?.vlc_hl ?? obj.vlc

  // El ensueño también se deriva (toda la red con rutas reestructuradas); un
  // número cargado a mano en el escenario manda, igual que en el objetivo.
  const ens = ensuenoDerivado(territorio, planes)
  const vlcDream = dream?.vlc_hl ?? ens.vlc

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
            Reestructuración de rutas por ciudad para bajar el VLC/HL: las de
            visita de los promotores y las de entrega, juntas, porque el día de
            visita define el día de pedido y ése el de reparto.
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

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="planes">Planes ({planes.length})</TabsTrigger>
          <TabsTrigger value="revisiones">
            Revisión mensual ({revisiones.length})
          </TabsTrigger>
          <TabsTrigger value="ciudades">Diagnóstico por ciudad</TabsTrigger>
          <TabsTrigger value="escenarios">Escenarios y metodología</TabsTrigger>
        </TabsList>

        {/* ---------------- Resumen: una pantalla por ciudad con plan ---------------- */}
        <TabsContent value="resumen" className="space-y-4 pt-4">
          <ResumenEscenarios
            anio={anio}
            meses={territorio?.meses ?? []}
            base={vlcBase}
            objetivo={vlcObjetivo}
            dream={vlcDream}
            revisiones={revisiones}
          />
          {planes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay planes territoriales cargados. Cargá el primero en
              la solapa Planes.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {planes.map((p) => (
              <ResumenCiudadCard
                key={p.id}
                plan={p}
                ciudad={territorio?.ciudades.find((c) => c.ciudad === p.ciudad)}
              />
            ))}
          </div>
        </TabsContent>

        {/* ---------------- Planes (R5.1.2 / R5.1.4) ---------------- */}
        <TabsContent value="planes" className="space-y-4 pt-4">
          {esEditor && (
            <PlanDialog
              ciudades={(territorio?.ciudades ?? []).map((c) => c.ciudad)}
              perfiles={perfiles}
              territorio={territorio}
              trigger={
                <Button>
                  <Plus className="h-4 w-4" /> Nuevo plan territorial
                </Button>
              }
            />
          )}
          {planes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay planes territoriales cargados.
            </p>
          )}
          {planes.length > 0 && (
            <Tabs
              value={ciudadActiva}
              onValueChange={setCiudadPlanes}
              className="space-y-4"
            >
              <TabsList>
                {ciudadesConPlan.map((c) => (
                  <TabsTrigger key={c} value={c}>
                    {c}
                  </TabsTrigger>
                ))}
              </TabsList>
              {ciudadesConPlan.map((c) => (
                <TabsContent key={c} value={c} className="space-y-4">
                  {planes
                    .filter((p) => p.ciudad === c)
                    .map((p) => (
                      <PlanCard
                        key={p.id}
                        plan={p}
                        ciudad={territorio?.ciudades.find(
                          (x) => x.ciudad === p.ciudad,
                        )}
                        rutero={ruteros[p.ciudad] ?? null}
                        esEditor={esEditor}
                        ciudades={(territorio?.ciudades ?? []).map(
                          (x) => x.ciudad,
                        )}
                        perfiles={perfiles}
                        territorio={territorio}
                        archivos={archivos}
                      />
                    ))}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </TabsContent>

        {/* ---------------- Revisiones (R5.1.3) ---------------- */}
        <TabsContent value="revisiones" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-sm text-muted-foreground">
              Ventas y operaciones revisan el progreso{" "}
              <strong>como mínimo una vez por mes</strong>. Cada registro es la
              evidencia de esa revisión. Los números salen solos del costo
              cargado; la conclusión es para lo que los números no dicen.
            </p>
            {esEditor && (
              <NuevaRevisionDialog anio={anio} vlcActual={vlcBase} />
            )}
          </div>
          {revisiones.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin revisiones registradas en {anio}.
            </p>
          )}
          <div className="space-y-3">
            {revisiones.map((r) => (
              <RevisionCard
                key={r.id}
                revision={r}
                territorio={territorio}
                planes={planes}
              />
            ))}
          </div>
        </TabsContent>

        {/* ---------------- Diagnóstico por ciudad ---------------- */}
        <TabsContent value="ciudades" className="space-y-4 pt-4">
          <DiagnosticoCiudades
            anio={anio}
            territorio={territorio}
            planes={planes}
          />
        </TabsContent>

        {/* ---------------- Escenarios y metodología (R5.1.1) ---------------- */}
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
              valor={vlcObjetivo}
              detalle={
                vlcBase && vlcObjetivo != null
                  ? `${num((100 * (vlcObjetivo - vlcBase)) / vlcBase, 1)}% vs base`
                  : "Cargá planes con meta para calcularlo"
              }
              color="#0d9488"
            />
            <EscenarioCard
              icono={<Sparkles className="h-5 w-5" />}
              titulo="De ensueño"
              subtitulo={dream?.nombre ?? "Toda la red con rutas reestructuradas"}
              valor={vlcDream}
              detalle={
                vlcBase && vlcDream != null
                  ? `${num((100 * (vlcDream - vlcBase)) / vlcBase, 1)}% vs base`
                  : "Cargá planes con meta para extrapolarlo"
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

          <SerieRedTotal
            anio={anio}
            territorio={territorio}
            planes={planes}
            objetivo={vlcObjetivo}
            dream={vlcDream}
          />

          <PuenteObjetivo
            base={vlcBase}
            objetivo={vlcObjetivo}
            aportes={obj.aportes}
            totalHl={territorio?.total.hl ?? 0}
          />

          <EscenarioEnsuenoCard
            nombre={dream?.nombre ?? "Toda la red con rutas reestructuradas"}
            supuestos={dream?.supuestos ?? null}
            manual={dream?.vlc_hl ?? null}
            vlc={vlcDream}
            pct={ens.pct}
            aportes={ens.aportes}
          />
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
  meta,
  compacta = false,
}: {
  ciudad: CiudadResumen
  planes: PlanTerritorial[]
  /** Meta de $/HL del plan: se dibuja como línea de referencia. */
  meta?: number | null
  /** Sin tarjeta ni título, más bajo: para embeber en otra tarjeta. */
  compacta?: boolean
}) {
  const datos = ciudad.serie.map((m) => ({
    mes: MESES[m.mes],
    mesNum: m.mes,
    costo: Math.round(m.costo_x_hl),
  }))

  // Cada etapa de rutas implementada en esta ciudad marca su mes: es lo que
  // permite decir "acá tocamos" y leer el antes/después.
  const marcas = mesesImplementacion(
    planes.filter((p) => p.ciudad === ciudad.ciudad),
  ).map((m) => ({ mes: MESES[m] }))

  if (datos.length < 2) return null

  const grafico = (
    <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" fontSize={12} />
            <YAxis
              fontSize={12}
              domain={["auto", "auto"]}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            />
            <RTooltip
              formatter={(v) => [pesos(Number(v)), "$/HL"]}
              labelClassName="text-xs"
            />
            {meta != null && (
              <ReferenceLine
                y={Math.round(meta)}
                stroke="#0d9488"
                strokeDasharray="5 4"
                label={{
                  value: "meta",
                  fontSize: 10,
                  position: "insideBottomRight",
                  fill: "#0d9488",
                }}
              />
            )}
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
  )

  if (compacta) return <div className="h-48">{grafico}</div>

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {ciudad.ciudad} — $/HL mes a mes
        </CardTitle>
      </CardHeader>
      <CardContent className="h-56">{grafico}</CardContent>
    </Card>
  )
}

/**
 * Escenario de ensueño: toda la red con rutas reestructuradas. Ciudad por
 * ciudad, cuánto baja el $/HL si las que ya tienen plan llegan a su meta y las
 * demás logran la misma reducción porcentual. Reemplaza al viejo "CD en San
 * Nicolás": mudar el depósito no es un plan territorial.
 */
function EscenarioEnsuenoCard({
  nombre,
  supuestos,
  manual,
  vlc,
  pct,
  aportes,
}: {
  nombre: string
  supuestos: string | null
  /** VLC/HL fijado a mano en el escenario (manda sobre el derivado). */
  manual: number | null
  vlc: number | null
  pct: number | null
  aportes: AporteEnsueno[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Escenario de ensueño — {nombre}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {supuestos && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {supuestos}
          </p>
        )}

        {manual != null && (
          <p className="text-sm text-amber-700">
            El VLC/HL de este escenario está fijado a mano en {pesos(manual)}; la
            tabla de abajo muestra la extrapolación automática.
          </p>
        )}

        {!aportes.length || pct == null ? (
          <p className="text-sm text-muted-foreground">
            Cargá al menos un plan de rutas con meta de $/HL para extrapolar el
            escenario al resto de la red.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ciudad</TableHead>
                  <TableHead className="text-right">HL</TableHead>
                  <TableHead className="text-right">$/HL hoy</TableHead>
                  <TableHead className="text-right">$/HL ensueño</TableHead>
                  <TableHead>Cómo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aportes.map((a) => (
                  <TableRow key={a.ciudad}>
                    <TableCell className="font-medium">{a.ciudad}</TableCell>
                    <TableCell className="text-right">{num(a.hl, 0)}</TableCell>
                    <TableCell className="text-right">{pesos(a.base)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">
                      {pesos(a.ensueno)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.con_plan
                        ? "Meta del plan de rutas"
                        : `Misma reducción que los planes (−${num(100 * pct, 1)}%)`}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Red</TableCell>
                  <TableCell className="text-right">
                    {num(aportes.reduce((s, a) => s + a.hl, 0), 0)}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right">{pesos(vlc)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * R5.1.4 — "mostrar la mejora del VLC/HL". La serie mensual del $/HL de TODA la
 * red, con las líneas del objetivo y del ensueño y la marca de cuándo se
 * implementó cada plan, para leer el antes/después a nivel red (no sólo por
 * ciudad, que ya está en la solapa de diagnóstico).
 */
function SerieRedTotal({
  anio,
  territorio,
  planes,
  objetivo,
  dream,
}: {
  anio: number
  territorio: Territorio | null
  planes: PlanTerritorial[]
  objetivo: number | null
  dream: number | null
}) {
  const datos = serieRedTotal(territorio).map((d) => ({
    mes: MESES[d.mes],
    vlc: Math.round(d.vlc),
  }))
  if (datos.length < 2) return null

  // Sólo marcamos meses de implementación que existan en la serie cargada, así
  // no queda una línea colgada en un mes sin datos.
  const marcas = mesesImplementacion(planes)
    .map((m) => ({ mes: MESES[m] }))
    .filter((m) => datos.some((d) => d.mes === m.mes))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          VLC/HL total de la red — evolución {anio}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" fontSize={12} />
            <YAxis
              fontSize={12}
              domain={["auto", "auto"]}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            />
            <RTooltip formatter={(v) => [pesos(Number(v)), "$/HL red"]} />
            {objetivo != null && (
              <ReferenceLine
                y={Math.round(objetivo)}
                stroke="#0d9488"
                strokeDasharray="5 4"
                label={{
                  value: "Objetivo",
                  fontSize: 10,
                  position: "insideTopRight",
                  fill: "#0d9488",
                }}
              />
            )}
            {dream != null && (
              <ReferenceLine
                y={Math.round(dream)}
                stroke={PILAR_PLANEAMIENTO_COLOR}
                strokeDasharray="5 4"
                label={{
                  value: "Ensueño",
                  fontSize: 10,
                  position: "insideBottomRight",
                  fill: PILAR_PLANEAMIENTO_COLOR,
                }}
              />
            )}
            {marcas.map((m, i) => (
              <ReferenceLine
                key={`${m.mes}-${i}`}
                x={m.mes}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{ value: "implementación", fontSize: 10, position: "top" }}
              />
            ))}
            <Line
              type="monotone"
              dataKey="vlc"
              stroke="#334155"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

/**
 * Puente base → objetivo: deja ver que el objetivo de la red es exactamente la
 * suma de lo que aporta cada plan de ciudad, ponderado por volumen. Ata R5.1.2
 * (planes) con R5.1.1 (escenario objetivo con su VLC/HL).
 */
function PuenteObjetivo({
  base,
  objetivo,
  aportes,
  totalHl,
}: {
  base: number | null
  objetivo: number | null
  aportes: AportePlan[]
  totalHl: number
}) {
  if (!aportes.length || base == null || objetivo == null) return null
  const reduccion = base ? (100 * (objetivo - base)) / base : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          De la base al objetivo — qué aporta cada plan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          El objetivo de VLC/HL de la red no es un número suelto: es lo que queda
          cuando cada ciudad con plan llega a su meta, ponderado por su volumen.
          Por eso las ciudades chicas mueven poco el total aunque su $/HL baje
          bastante.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">$/HL ciudad</TableHead>
                <TableHead className="text-right">HL</TableHead>
                <TableHead className="text-right">Aporte a la red</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="font-semibold">
                <TableCell>Base de la red — hoy</TableCell>
                <TableCell className="text-right">{pesos(base)}</TableCell>
                <TableCell className="text-right">{num(totalHl, 0)}</TableCell>
                <TableCell className="text-right">—</TableCell>
              </TableRow>
              {aportes.map((a) => (
                <TableRow key={a.ciudad}>
                  <TableCell>
                    {a.ciudad}: {pesos(a.base)} → {pesos(a.meta)}
                  </TableCell>
                  <TableCell className="text-right text-emerald-600">
                    −{pesos(a.base - a.meta)}
                  </TableCell>
                  <TableCell className="text-right">{num(a.hl, 0)}</TableCell>
                  <TableCell className="text-right font-medium text-emerald-600">
                    −{pesos(a.aporte_red)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-semibold">
                <TableCell>
                  Objetivo de la red
                  {reduccion != null && (
                    <span className="ml-2 text-xs text-emerald-600">
                      {num(reduccion, 1)}% vs base
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">{pesos(objetivo)}</TableCell>
                <TableCell className="text-right">{num(totalHl, 0)}</TableCell>
                <TableCell className="text-right">—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function PlanCard({
  plan,
  ciudad,
  rutero,
  esEditor,
  ciudades,
  perfiles,
  territorio,
  archivos,
}: {
  plan: PlanTerritorial
  ciudad: CiudadResumen | undefined
  rutero: RuteroVigente | null
  esEditor: boolean
  ciudades: string[]
  perfiles: Array<{ id: string; nombre: string }>
  territorio: Territorio | null
  archivos: ArchivoEvidencia[]
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
            <p className="text-xs text-muted-foreground">Acumulado del año</p>
            <p className="font-semibold">{pesos(actual)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Acumulado vs base</p>
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

        {ciudad && (
          <div className="border-t pt-3">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              $/HL mes a mes · {plan.ciudad}
            </p>
            <SerieCiudad ciudad={ciudad} planes={[plan]} meta={plan.meta} compacta />
          </div>
        )}

        <RedisenoRutasSection
          plan={plan}
          ciudad={ciudad}
          rutero={rutero}
          esEditor={esEditor}
          archivos={archivos}
        />

        {plan.avances.length > 0 && (
          <Accordion className="border-t">
            <AccordionItem value="notas" className="border-b-0">
              <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground">
                Notas del plan ({plan.avances.length})
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
            {plan.avances.map((a) => (
              <div key={a.id} className="rounded-md bg-slate-50 p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {a.created_at.slice(8, 10)}/{a.created_at.slice(5, 7)}/
                    {a.created_at.slice(0, 4)}
                    {a.autor_nombre ? ` · ${a.autor_nombre}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    {a.costo_x_hl != null && (
                      <Badge variant="secondary">{pesos(a.costo_x_hl)} /HL</Badge>
                    )}
                    {a.estado_resultante && (
                      <Badge variant="outline">
                        {ESTADO_LABEL[a.estado_resultante] ?? a.estado_resultante}
                      </Badge>
                    )}
                  </span>
                </div>
                {a.comentario && (
                  <p className="mt-1 whitespace-pre-wrap">{a.comentario}</p>
                )}
              </div>
            ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {esEditor && (
          <div className="flex flex-wrap gap-2">
            <NuevoAvanceDialog plan={plan} costoActual={actual} />
            <PlanDialog
              ciudades={ciudades}
              perfiles={perfiles}
              territorio={territorio}
              plan={plan}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Alta y edición de un plan territorial.
 *
 * Es UN solo componente para las dos cosas: si recibe `plan` edita, si no
 * crea. Tener dos formularios casi iguales garantizaba que un campo agregado
 * en uno se olvidara en el otro.
 *
 * 🚨 Los campos van CONTROLADOS, no con defaultValue. Con defaultValue la
 * línea base se escribía sólo en el primer render: si elegías Colón y después
 * cambiabas a Arrecifes, el input se quedaba con el número de Colón y el plan
 * nacía con la línea base de otra ciudad (pasó de verdad).
 */
function PlanDialog({
  ciudades,
  perfiles,
  territorio,
  plan,
  trigger,
}: {
  ciudades: string[]
  perfiles: Array<{ id: string; nombre: string }>
  territorio: Territorio | null
  /** Si viene, el diálogo edita ese plan en vez de crear uno nuevo. */
  plan?: PlanTerritorial
  trigger: React.ReactElement
}) {
  const editando = plan != null

  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  const [ciudad, setCiudad] = useState(plan?.ciudad ?? "")
  const [palanca, setPalanca] = useState<PalancaPlan>(plan?.palanca ?? "ambas")
  const [titulo, setTitulo] = useState(plan?.titulo ?? "")
  const [descripcion, setDescripcion] = useState(plan?.descripcion ?? "")
  const [lineaBase, setLineaBase] = useState(
    plan?.linea_base != null ? String(Math.round(plan.linea_base)) : "",
  )
  const [meta, setMeta] = useState(
    plan?.meta != null ? String(Math.round(plan.meta)) : "",
  )
  const [fechaImpl, setFechaImpl] = useState(plan?.fecha_implementacion ?? "")
  const [baseDesde, setBaseDesde] = useState(plan?.linea_base_desde ?? "")
  const [baseHasta, setBaseHasta] = useState(plan?.linea_base_hasta ?? "")
  const [comercial, setComercial] = useState(plan?.responsable_comercial_id ?? "")
  const [logistica, setLogistica] = useState(plan?.responsable_logistica_id ?? "")

  const costoDe = (c: string) =>
    territorio?.ciudades.find((x) => x.ciudad === c)?.costo_x_hl ?? null

  // Al cambiar de ciudad se re-sugiere la línea base con el $/HL vigente de
  // ESA ciudad. Al editar no se pisa: el valor guardado es el "antes" contra
  // el que ya se viene midiendo y cambiarlo solo falsearía la mejora.
  function onCiudad(c: string) {
    setCiudad(c)
    if (!editando) {
      const sug = costoDe(c)
      setLineaBase(sug ? String(Math.round(sug)) : "")
    }
  }

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const r = editando
        ? await actualizarPlanTerritorial(plan.id, formData)
        : await crearPlanTerritorial(formData)
      if ("error" in r) setError(r.error)
      else setAbierto(false)
    })
  }

  const sugerida = costoDe(ciudad)

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editando ? `Editar — ${plan.titulo}` : "Nuevo plan territorial"}
          </DialogTitle>
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
                onChange={(e) => onCiudad(e.target.value)}
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
              <Label htmlFor="palanca">Alcance del cambio de rutas</Label>
              <select
                id="palanca"
                name="palanca"
                className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                value={palanca}
                onChange={(e) => setPalanca(e.target.value as PalancaPlan)}
              >
                {(Object.keys(PALANCA_LABEL) as PalancaPlan[]).map((x) => (
                  <option key={x} value={x}>
                    {PALANCA_LABEL[x]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              name="titulo"
              required
              className="mt-1"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="descripcion">Qué se va a hacer</Label>
            <Textarea
              id="descripcion"
              name="descripcion"
              rows={3}
              className="mt-1"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
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
                value={lineaBase}
                onChange={(e) => setLineaBase(e.target.value)}
              />
              {ciudad && sugerida != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {ciudad} hoy: {pesos(sugerida)}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="meta">Meta ($/HL)</Label>
              <Input
                id="meta"
                name="meta"
                type="number"
                step="0.01"
                className="mt-1"
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fecha_implementacion">Implementación</Label>
              <Input
                id="fecha_implementacion"
                name="fecha_implementacion"
                type="date"
                className="mt-1"
                value={fechaImpl}
                onChange={(e) => setFechaImpl(e.target.value)}
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
                value={baseDesde}
                onChange={(e) => setBaseDesde(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="linea_base_hasta">Base hasta</Label>
              <Input
                id="linea_base_hasta"
                name="linea_base_hasta"
                type="date"
                className="mt-1"
                value={baseHasta}
                onChange={(e) => setBaseHasta(e.target.value)}
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
                value={comercial}
                onChange={(e) => setComercial(e.target.value)}
              >
                <option value="">—</option>
                {perfiles.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
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
                value={logistica}
                onChange={(e) => setLogistica(e.target.value)}
              >
                <option value="">—</option>
                {perfiles.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              {pendiente
                ? "Guardando…"
                : editando
                  ? "Guardar cambios"
                  : "Crear plan"}
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
        Agregar nota
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nota — {plan.titulo}</DialogTitle>
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
              {pendiente ? "Guardando…" : "Guardar nota"}
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

// ==================================================================
// Resumen: lo que hay que ver en una pantalla
// ==================================================================

function fmtFechaCorta(iso: string | null): string {
  if (!iso) return ""
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function pctTexto(desde: number | null, hasta: number | null): string | null {
  if (desde == null || hasta == null || !desde) return null
  const p = (100 * (hasta - desde)) / desde
  return `${p > 0 ? "+" : ""}${num(p, 1)}%`
}

/**
 * $/HL de la ciudad desde una fecha (agregado sobre totales, nunca promedio de
 * ratios). El mes de implementación cuenta si el cambio arrancó antes del 15.
 */
function costoDesde(
  ciudad: CiudadResumen | undefined,
  fecha: string | null,
): { costo_x_hl: number | null; meses: number[] } {
  if (!ciudad || !fecha) return { costo_x_hl: null, meses: [] }
  const anio = Number(fecha.slice(0, 4))
  const mes = Number(fecha.slice(5, 7))
  const dia = Number(fecha.slice(8, 10))
  const ms = ciudad.serie.filter((m) =>
    m.anio !== anio ? m.anio > anio : m.mes !== mes ? m.mes > mes : dia <= 15,
  )
  const hl = ms.reduce((a, m) => a + m.hl, 0)
  const costo = ms.reduce((a, m) => a + m.costo_total, 0)
  return { costo_x_hl: hl ? costo / hl : null, meses: ms.map((m) => m.mes) }
}

/** Primera fecha de implementación del plan (etapa 1 o la general). */
function primeraImplementacion(plan: PlanTerritorial): string | null {
  const fechas = plan.etapas
    .map((e) => e.fecha_implementacion)
    .filter((f): f is string => !!f)
    .sort()
  return fechas[0] ?? plan.fecha_implementacion
}

function ResumenEscenarios({
  anio,
  meses,
  base,
  objetivo,
  dream,
  revisiones,
}: {
  anio: number
  meses: number[]
  base: number | null
  objetivo: number | null
  dream: number | null
  revisiones: RevisionTerritorial[]
}) {
  const ultimoMes = meses.length ? meses[meses.length - 1] : null
  const ultimaRev = revisiones.length
    ? revisiones.reduce((a, r) => (r.mes > a.mes ? r : a))
    : null
  const proxima = ultimaRev
    ? ultimaRev.mes >= 12
      ? `Enero ${anio + 1}`
      : `${MESES[ultimaRev.mes + 1]} ${anio}`
    : null

  const pObj = pctTexto(base, objetivo)
  const pDream = pctTexto(base, dream)
  const items: Array<{
    label: string
    valor: number | null
    nota: string
    color: string
  }> = [
    {
      label: `VLC/HL red ${anio}`,
      valor: base,
      nota: ultimoMes
        ? `acumulado a ${MESES[ultimoMes]} · sólo lo entregado a PDV, sin la bolsa de depósito (no es el VLC/HL del Sueño)`
        : "sin costo cargado",
      color: "#334155",
    },
    {
      label: "Objetivo",
      valor: objetivo,
      nota: pObj ? `${pObj} si los planes llegan a su meta` : "cargá planes con meta",
      color: "#0d9488",
    },
    {
      label: "Ensueño",
      valor: dream,
      nota: pDream
        ? `${pDream} con toda la red reestructurada`
        : "se extrapola de los planes",
      color: PILAR_PLANEAMIENTO_COLOR,
    },
  ]

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-6">
        {items.map((it) => (
          <div key={it.label} className="min-w-[150px] max-w-[260px]">
            <p className="text-xs font-semibold" style={{ color: it.color }}>
              {it.label}
            </p>
            <p className="text-2xl font-bold text-slate-900">{pesos(it.valor)}</p>
            <p className="text-xs text-muted-foreground">{it.nota}</p>
          </div>
        ))}
        <div className="ml-auto text-right text-xs text-muted-foreground">
          <p className="flex items-center justify-end gap-1 font-semibold text-slate-700">
            <CalendarCheck className="h-3.5 w-3.5" /> Revisión mensual
          </p>
          {ultimaRev ? (
            <>
              <p>
                Última: {MESES[ultimaRev.mes]} {ultimaRev.anio}
              </p>
              <p>Próxima: {proxima}</p>
            </>
          ) : (
            <p>Sin revisiones en {anio}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Tarjeta de una ciudad con plan: etapas, base → meta → cómo viene, y la serie
 * con las marcas. Es la lectura de "¿cómo va Colón?" sin recorrer solapas.
 */
function ResumenCiudadCard({
  plan,
  ciudad,
}: {
  plan: PlanTerritorial
  ciudad: CiudadResumen | undefined
}) {
  const ultimo = ciudad?.serie.length
    ? ciudad.serie[ciudad.serie.length - 1]
    : null
  const anterior =
    ciudad && ciudad.serie.length > 1
      ? ciudad.serie[ciudad.serie.length - 2]
      : null
  const desde = costoDesde(ciudad, primeraImplementacion(plan))
  const meta = plan.meta
  const colorVsMeta = (v: number | null) =>
    v == null || meta == null
      ? "text-slate-900"
      : v <= meta
        ? "text-emerald-600"
        : "text-red-600"
  const rangoBase =
    plan.linea_base_desde && plan.linea_base_hasta
      ? ` (${MESES[Number(plan.linea_base_desde.slice(5, 7))]}–${MESES[Number(plan.linea_base_hasta.slice(5, 7))]})`
      : ""
  const rangoDesde = desde.meses.length
    ? ` (${MESES[desde.meses[0]]}–${MESES[desde.meses[desde.meses.length - 1]]})`
    : ""

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{plan.ciudad}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {PALANCA_LABEL[plan.palanca]}
            </p>
          </div>
          <Badge>{ESTADO_LABEL[plan.estado] ?? plan.estado}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {plan.etapas.length === 0 ? (
          <p className="flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3 w-3" /> Sin reestructuración
            documentada todavía.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {plan.etapas.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Etapa {e.etapa}</Badge>
                <span className="text-slate-800">
                  {e.titulo ?? "Reestructuración de rutas"}
                </span>
                {e.fecha_implementacion ? (
                  <span className="text-xs text-muted-foreground">
                    desde el {fmtFechaCorta(e.fecha_implementacion)}
                  </span>
                ) : (
                  <span className="text-xs text-amber-700">sin fecha</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Línea base{rangoBase}</p>
            <p className="font-semibold">{pesos(plan.linea_base)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Meta</p>
            <p className="font-semibold text-teal-700">{pesos(meta)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Último mes{ultimo ? ` (${MESES[ultimo.mes]})` : ""}
            </p>
            <p className={`font-semibold ${colorVsMeta(ultimo?.costo_x_hl ?? null)}`}>
              {pesos(ultimo?.costo_x_hl)}
              {anterior && ultimo && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {pctTexto(anterior.costo_x_hl, ultimo.costo_x_hl)} vs{" "}
                  {MESES[anterior.mes]}
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Desde la implementación{rangoDesde}
            </p>
            <p className={`font-semibold ${colorVsMeta(desde.costo_x_hl)}`}>
              {pesos(desde.costo_x_hl)}
              {desde.costo_x_hl != null && plan.linea_base != null && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {pctTexto(plan.linea_base, desde.costo_x_hl)} vs base
                </span>
              )}
            </p>
          </div>
        </div>

        {ciudad && (
          <SerieCiudad ciudad={ciudad} planes={[plan]} meta={meta} compacta />
        )}
      </CardContent>
    </Card>
  )
}

// ==================================================================
// Revisión mensual con los números calculados
// ==================================================================

/**
 * Una revisión hecha en el mes M lee el último mes cerrado con costo cargado
 * anterior a M. Si todavía no hay ninguno, no muestra números.
 */
function mesLeido(territorio: Territorio | null, mesRevision: number): number | null {
  if (!territorio) return null
  const previos = territorio.meses.filter((m) => m < mesRevision)
  return previos.length ? previos[previos.length - 1] : null
}

function RevisionCard({
  revision: r,
  territorio,
  planes,
}: {
  revision: RevisionTerritorial
  territorio: Territorio | null
  planes: PlanTerritorial[]
}) {
  const mes = mesLeido(territorio, r.mes)
  const red = serieRedTotal(territorio)
  const redMes = mes != null ? (red.find((d) => d.mes === mes)?.vlc ?? null) : null
  const redPrev = mes != null ? (red.find((d) => d.mes === mes - 1)?.vlc ?? null) : null

  const ciudadesConPlan = [...new Set(planes.map((p) => p.ciudad))]
  const filas = ciudadesConPlan.map((nombre) => {
    const c = territorio?.ciudades.find((x) => x.ciudad === nombre)
    const actual = mes != null ? (c?.serie.find((m) => m.mes === mes) ?? null) : null
    const previo = mes != null ? (c?.serie.find((m) => m.mes === mes - 1) ?? null) : null
    const metas = planes
      .filter((p) => p.ciudad === nombre && p.meta != null)
      .map((p) => p.meta as number)
    const meta = metas.length ? Math.min(...metas) : null
    return { nombre, actual, previo, meta }
  })

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-slate-900">
            {MESES[r.mes]} {r.anio}
          </p>
          <Badge variant="secondary">
            {mes != null ? `lee ${MESES[mes]}` : `${pesos(r.vlc_hl_mes)} /HL`}
          </Badge>
        </div>

        {mes != null && (
          <div className="flex flex-wrap gap-2">
            <Chip
              label="Red"
              valor={redMes}
              delta={pctTexto(redPrev, redMes)}
              deltaRef={mes > 1 ? MESES[mes - 1] : null}
            />
            {filas.map((f) => (
              <Chip
                key={f.nombre}
                label={f.nombre}
                valor={f.actual?.costo_x_hl ?? null}
                delta={pctTexto(
                  f.previo?.costo_x_hl ?? null,
                  f.actual?.costo_x_hl ?? null,
                )}
                deltaRef={f.previo ? MESES[f.previo.mes] : null}
                meta={f.meta}
              />
            ))}
          </div>
        )}

        <p className="text-sm">
          <span className="text-muted-foreground">Participantes: </span>
          {r.participantes ?? "—"}
        </p>
        {r.conclusion && (
          <p className="whitespace-pre-wrap text-sm">{r.conclusion}</p>
        )}
      </CardContent>
    </Card>
  )
}

function Chip({
  label,
  valor,
  delta,
  deltaRef,
  meta,
}: {
  label: string
  valor: number | null
  delta: string | null
  deltaRef: string | null
  meta?: number | null
}) {
  const vsMeta =
    valor != null && meta != null ? (valor <= meta ? "ok" : "alto") : null
  return (
    <div
      className={`rounded-md border px-3 py-1.5 text-sm ${
        vsMeta === "ok"
          ? "border-emerald-200 bg-emerald-50"
          : vsMeta === "alto"
            ? "border-red-200 bg-red-50"
            : "border-slate-200 bg-slate-50"
      }`}
    >
      <span className="text-xs text-muted-foreground">{label} </span>
      <span className="font-semibold">{pesos(valor)}</span>
      {delta && (
        <span className="ml-1 text-xs text-muted-foreground">
          {delta}
          {deltaRef ? ` vs ${deltaRef}` : ""}
        </span>
      )}
      {meta != null && (
        <span className="ml-1 text-xs text-muted-foreground">
          · meta {pesos(meta)}
        </span>
      )}
    </div>
  )
}

// ==================================================================
// Diagnóstico por ciudad: tabla corta, gráficos al desplegar
// ==================================================================

function DiagnosticoCiudades({
  anio,
  territorio,
  planes,
}: {
  anio: number
  territorio: Territorio | null
  planes: PlanTerritorial[]
}) {
  const conPlan = new Set(planes.map((p) => p.ciudad))
  const ciudades = [...(territorio?.ciudades ?? [])].sort((a, b) => {
    const pa = conPlan.has(a.ciudad) ? 0 : 1
    const pb = conPlan.has(b.ciudad) ? 0 : 1
    return pa - pb || b.costo_x_hl - a.costo_x_hl
  })

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Costo y operación por ciudad · {anio} acumulado
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            El $/HL por ciudad es un reparto del costo de la red (almacén y
            distribución por bultos y entregas, distancia por km desde el CD),
            no un costo medido. Las ciudades con plan van primero.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ciudad</TableHead>
                <TableHead className="text-right">$/HL</TableHead>
                <TableHead className="text-right">HL</TableHead>
                <TableHead className="text-right">Entregas</TableHead>
                <TableHead className="text-right">Bultos/entrega</TableHead>
                <TableHead className="text-right">Km</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ciudades.map((c) => (
                <TableRow key={c.ciudad}>
                  <TableCell className="font-medium">
                    {c.ciudad}
                    {conPlan.has(c.ciudad) && (
                      <Badge variant="outline" className="ml-2">
                        plan
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {pesos(c.costo_x_hl)}
                  </TableCell>
                  <TableCell className="text-right">{num(c.hl, 0)}</TableCell>
                  <TableCell className="text-right">{num(c.entregas, 0)}</TableCell>
                  <TableCell className="text-right">
                    {num(c.bultos_por_entrega)}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.km == null ? "—" : num(c.km, 0)}
                  </TableCell>
                </TableRow>
              ))}
              {territorio && (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    {pesos(territorio.total.costo_x_hl)}
                  </TableCell>
                  <TableCell className="text-right">
                    {num(territorio.total.hl, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {num(territorio.total.entregas, 0)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {ciudades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">$/HL mes a mes por ciudad</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion>
              {ciudades.map((c) => (
                <AccordionItem key={c.ciudad} value={c.ciudad}>
                  <AccordionTrigger className="text-sm">
                    <span>
                      {c.ciudad}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {pesos(c.costo_x_hl)} /HL acumulado
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <SerieCiudad ciudad={c} planes={planes} compacta />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </>
  )
}
