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
  ChevronRight,
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
import { Button, buttonVariants } from "@/components/ui/button"
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

          {dream && <EscenarioDreamCard dream={dream} />}
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
          {planes.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              ciudad={territorio?.ciudades.find((c) => c.ciudad === p.ciudad)}
              esEditor={esEditor}
              ciudades={(territorio?.ciudades ?? []).map((c) => c.ciudad)}
              perfiles={perfiles}
              territorio={territorio}
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

/**
 * Escenario de ensueño: matriz de km + acceso al simulador.
 *
 * El simulador NO se re-implementa acá: ya existe en Costo por PDV > Simulación,
 * con el desglose por componente y el delta contra el modelo real. Tener dos
 * simuladores del mismo escenario es garantía de que en algún momento den
 * distinto, así que esta página muestra los supuestos y manda al que ya está.
 */
function EscenarioDreamCard({ dream }: { dream: Escenario }) {
  const km = dream.km_ciudad ?? {}
  const ciudades = Object.keys(km).sort((a, b) => (km[b] ?? 0) - (km[a] ?? 0))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Escenario de ensueño — supuestos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {dream.supuestos && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {dream.supuestos}
          </p>
        )}

        <div className="flex flex-wrap gap-4">
          {ciudades.map((c) => (
            <div key={c} className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-xs text-muted-foreground">{c}</p>
              <p className="font-semibold">{num(km[c], 0)} km</p>
            </div>
          ))}
        </div>

        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="space-y-2 pt-6 text-sm text-slate-700">
            <p>
              <strong>Cómo se calcula el ahorro.</strong> Se mide sobre el{" "}
              <strong>costo por llegar</strong> (el line-haul: km de ida y vuelta
              a cada ciudad × viajes × $/km), que es el único componente que se
              mueve al cambiar de dónde sale el camión. Almacén y reparto quedan
              igual. Es la misma apertura que muestra el pop-up de costo
              logístico en Costo por PDV.
            </p>
            <p>
              <strong>Ene–jun 2026:</strong> el costo de llegar baja{" "}
              <strong>$60.733.313</strong> (entre 10,4% y 14,0% según el mes),
              sobre un costo logístico de $922.006.318 y 48.238 HL ⇒ VLC/HL de{" "}
              <strong>19.114 a 17.855</strong>, un <strong>6,59%</strong> menos.
            </p>
          </CardContent>
        </Card>

        <Link
          href="/planeamiento/costo-por-pdv"
          className={buttonVariants({ variant: "secondary" })}
        >
          Abrir el simulador en Costo por PDV{" "}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  )
}

function PlanCard({
  plan,
  ciudad,
  esEditor,
  ciudades,
  perfiles,
  territorio,
}: {
  plan: PlanTerritorial
  ciudad: CiudadResumen | undefined
  esEditor: boolean
  ciudades: string[]
  perfiles: Array<{ id: string; nombre: string }>
  territorio: Territorio | null
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
  const [palanca, setPalanca] = useState<PalancaPlan>(plan?.palanca ?? "otro")
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
              <Label htmlFor="palanca">Palanca</Label>
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
