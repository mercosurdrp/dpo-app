"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CalendarRange, FlaskConical, Settings, ListTree, ColumnsIcon, Table, ClipboardCheck, Grid2x2, Gift } from "lucide-react"
import { SimuladorTab } from "./simulador"
import { ConfiguracionTab } from "./configuracion"
import { PeriodosTab } from "./periodos-tab"
import { DetalleSemanalTab } from "./detalle-semanal-tab"
import { RevisionMensualTab } from "./revision-mensual-tab"
import { SwotTab } from "./swot-tab"
import { IncentivosTab } from "./incentivos-tab"
import { CrucePeriodos } from "./cruce-periodos"

export type DiaCalendario = {
  anio: number
  fecha: string
  dow: number
  dia_semana: string
  mes: number
  hl: number
  hl_rechazo: number
  camiones: number
  clientes_dia: number
  pct_rechazo: number
  otif_estimado: number
  pct_ausentismo: number
  clasif_vol: "PICO" | "NORMAL"   // superó la capacidad de distribución, o no
  pct_capacidad: number           // hl / capacidad (1 = justo la capacidad)
  es_feriado: boolean
  nombre_feriado: string | null
  tipo_feriado: string | null   // nacional | provincial | empresa
  // Triggers booleanos (modelo Mercosur)
  trigger_vol: boolean
  trigger_cli: boolean
  trigger_otif: boolean
  trigger_aus: boolean
  trigger_count: number
  contexto_count: number     // cuántas de las otras 3 acompañan al volumen
  estatus: "CRITICO" | "NORMAL"
}

// Lo único configurable fuera de la capacidad y el contexto es el año vigente.
export type CfgPC = {
  anio: number
}

// `codigo` es una Intensidad: hay un plan por escalón (CRITICO, LIMITE, NORMAL).
export type PlanAccion = {
  codigo: string
  descripcion: string
  plan_texto: string
}

export type UmbralesPC = {
  // Capacidad de distribución: los 3 números que la definen…
  camiones: number
  hl_por_camion: number
  pct_ocupacion: number
  /** …y el HL que sale de multiplicarlos. Lo calcula la base (columna generada). */
  vol_pico: number
  // Variables de contexto: agravan el día crítico, no lo crean.
  clientes: number
  otif_min: number        // tasa de rechazo máxima
  ausentismo_max: number
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

// dow=0 Domingo. La grilla empieza el domingo, igual que el Excel original.
const NOMBRES_DOW = ["D", "L", "M", "M", "J", "V", "S"]

// Color por fase del ciclo de gestión del período crítico. El ícono va siempre
// coloreado y la solapa activa toma un fondo tintado de su fase, para que se
// distingan de un vistazo y se lean como pasos secuenciales del proceso.
//   detectar → analizar → planificar → revisar (R3.4.2) → evaluar (R3.4.3)
const FASE = {
  detectar:   "[&_svg]:text-sky-600 data-active:bg-sky-100 data-active:text-sky-900",
  analizar:   "[&_svg]:text-violet-600 data-active:bg-violet-100 data-active:text-violet-900",
  planificar: "[&_svg]:text-amber-600 data-active:bg-amber-100 data-active:text-amber-900",
  revisar:    "[&_svg]:text-emerald-600 data-active:bg-emerald-100 data-active:text-emerald-900",
  evaluar:    "[&_svg]:text-rose-600 data-active:bg-rose-100 data-active:text-rose-900",
  setup:      "[&_svg]:text-slate-500 data-active:bg-slate-200 data-active:text-slate-900",
} as const

// Tab vertical y angosto: ícono arriba, texto debajo (se apila en 2 líneas),
// flex-1 para repartir el ancho → las 10 solapas entran en una sola fila.
const TAB =
  "flex-1 min-w-0 flex-col gap-1 h-auto px-1 py-2 text-[11px] leading-tight text-center whitespace-normal"

const fmtHL = (n: number) =>
  n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
const fmtPct = (n: number) =>
  (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%"

// La escala (CRITICO / LIMITE / NORMAL) vive en _lib/intensidad.ts porque también
// la usan la API del mes siguiente y la sección de la reunión. Acá se re-exporta
// para que las pestañas sigan importando desde "./client".
export {
  intensidadDia, intensidadMax, INTENSIDAD_BG, INTENSIDAD_LABEL, PCT_LIMITE,
  type Intensidad,
} from "../_lib/intensidad"
import { intensidadDia, INTENSIDAD_BG, INTENSIDAD_LABEL, PCT_LIMITE } from "../_lib/intensidad"

/** Las 3 variables de contexto que cruzaron (todas menos volumen). */
export type ConTriggers = Pick<
  DiaCalendario,
  "trigger_vol" | "trigger_cli" | "trigger_otif" | "trigger_aus"
>

/** Cuántas variables de contexto cruzaron. Se muestra, no decide el color. */
export function contextoDia(d: ConTriggers): number {
  return (d.trigger_cli ? 1 : 0) + (d.trigger_otif ? 1 : 0) + (d.trigger_aus ? 1 : 0)
}

function estiloCelda(d: DiaCalendario): string {
  if (d.hl === 0 && d.dow !== 0) return "bg-slate-100 text-slate-400"  // sin datos
  if (d.dow === 0) return "bg-slate-100 text-slate-400"               // domingo
  return INTENSIDAD_BG[intensidadDia(d)]
}

// Etiquetas humanas de los triggers (para tooltip). El volumen va primero: es
// el único que define criticidad.
const TRIGGER_LABELS: Array<[keyof DiaCalendario, string]> = [
  ["trigger_vol", "Volumen sobre la capacidad"],
  ["trigger_cli", "Clientes > umbral"],
  ["trigger_otif", "Rechazo > umbral"],
  ["trigger_aus", "Ausentismo ≥ umbral"],
]

function MesGrid({ mes, dias }: { mes: number; dias: DiaCalendario[] }) {
  // Construir 6 semanas x 7 días (dom..sáb) con dias del mes
  const delMes = dias.filter((d) => d.mes === mes)
  if (delMes.length === 0) return null

  const primer = new Date(delMes[0].fecha + "T00:00:00")
  const offset = primer.getDay() // 0=Dom..6=Sab
  const cells: (DiaCalendario | null)[] = Array(offset).fill(null).concat(delMes)
  while (cells.length % 7 !== 0) cells.push(null)
  const semanas: (DiaCalendario | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) semanas.push(cells.slice(i, i + 7))

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h3 className="text-base font-semibold text-slate-900">{MESES[mes - 1]}</h3>
          <span className="text-xs text-slate-500">
            {delMes.filter((d) => d.estatus === "CRITICO").length} críticos
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {NOMBRES_DOW.map((d, i) => (
            <div key={i} className="text-center text-[11px] font-semibold text-slate-500 uppercase">
              {d}
            </div>
          ))}
          {semanas.flat().map((d, i) => (
            <DiaCell key={i} d={d} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DiaCell({ d }: { d: DiaCalendario | null }) {
  if (!d) return <div className="aspect-square rounded" />

  const fecha = new Date(d.fecha + "T00:00:00")
  const cls = estiloCelda(d)
  const dayNum = fecha.getDate()
  const triggersActivos = TRIGGER_LABELS.filter(([k]) => d[k] === true)
  const conDatos = d.hl > 0 && d.dow !== 0

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={`relative aspect-square rounded flex flex-col items-center justify-center leading-none cursor-default ${cls} ${d.es_feriado ? "ring-2 ring-yellow-400" : ""}`}
          >
            <span className="text-[15px] font-semibold">{dayNum}</span>
            {conDatos && <span className="mt-0.5 text-[9px] opacity-80">{fmtHL(d.hl)}</span>}
          </div>
        }
      />
      <TooltipContent side="top" className="text-xs">
        <div className="space-y-0.5 min-w-[200px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">
              {d.dia_semana} {fecha.toLocaleDateString("es-AR")}
            </span>
            {intensidadDia(d) !== "NORMAL" && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${INTENSIDAD_BG[intensidadDia(d)]}`}>
                {INTENSIDAD_LABEL[intensidadDia(d)]}
              </span>
            )}
          </div>
          {d.es_feriado && (
            <div className="text-yellow-700 font-medium">★ {d.nombre_feriado}</div>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 border-t border-slate-200">
            <span>HL:</span>
            <span className="text-right">
              <b>{fmtHL(d.hl)}</b> · {fmtPct(d.pct_capacidad)} de la capacidad
            </span>
            <span>Clientes:</span><span className="text-right"><b>{d.clientes_dia}</b></span>
            <span>Rechazo:</span><span className="text-right"><b>{fmtPct(d.otif_estimado)}</b></span>
            <span>Ausentismo:</span><span className="text-right"><b>{fmtPct(d.pct_ausentismo)}</b></span>
          </div>
          {triggersActivos.length > 0 && (
            <div className="mt-1 pt-1 border-t border-slate-200">
              <div className="text-[10px] uppercase text-slate-500 mb-0.5">Variables cruzadas</div>
              {triggersActivos.map(([k, label]) => (
                <div key={k as string} className="text-[10px]">• {label}</div>
              ))}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export function PeriodosCriticosClient({
  cfg,
  umbrales,
  dias,
  planes,
  errorDias,
}: {
  cfg: CfgPC
  umbrales: UmbralesPC
  dias: DiaCalendario[]      // todos los años del v_pc_calendario_dia_multianio
  planes: PlanAccion[]
  errorDias: string | null
}) {
  // Mapa por año + lista ordenada de años disponibles (con al menos 1 día con datos)
  const { aniosDisponibles, diasPorAnio } = useMemo(() => {
    const byAnio: Record<number, DiaCalendario[]> = {}
    const conDatos = new Set<number>()
    for (const d of dias) {
      const a = d.anio
      if (!byAnio[a]) byAnio[a] = []
      byAnio[a].push(d)
      if (d.hl > 0 || d.pct_ausentismo > 0) conDatos.add(a)
    }
    const anios = Array.from(conDatos).sort((a, b) => a - b)
    return { aniosDisponibles: anios, diasPorAnio: byAnio }
  }, [dias])

  // Año activo del selector. Default = anio_vigente de la config si está disponible.
  const [anioActivo, setAnioActivo] = useState<number>(() =>
    aniosDisponibles.includes(cfg.anio) ? cfg.anio
      : aniosDisponibles[aniosDisponibles.length - 1] ?? cfg.anio
  )

  const diasActivos = diasPorAnio[anioActivo] ?? []

  const conteo = useMemo(() => {
    const c = { criticos: 0, limite: 0, normales: 0, sin_datos: 0 }
    for (const d of diasActivos) {
      if (d.dow === 0) continue                      // domingo: no se reparte
      if (d.hl === 0) { c.sin_datos++; continue }
      switch (intensidadDia(d)) {
        case "CRITICO": c.criticos++; break
        case "LIMITE":  c.limite++; break
        default:        c.normales++
      }
    }
    return c
  }, [diasActivos])

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Períodos Críticos</h1>
        <p className="text-sm text-slate-600">
          Pilar Planeamiento · Bloque 3.4 — Un día es crítico cuando el volumen supera la capacidad de
          distribución. Clientes, rechazo y ausentismo se cruzan como contexto: agravan el día, no lo vuelven crítico.
        </p>
      </header>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Año:</span>
            <select
              value={anioActivo}
              onChange={(e) => setAnioActivo(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 px-2 text-sm font-semibold"
            >
              {aniosDisponibles.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <span className="text-xs text-slate-600">
            <b>{conteo.criticos}</b> días críticos · superan {fmtHL(umbrales.vol_pico)} HL de capacidad
          </span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <Legend color="bg-red-600" label={`Crítico: supera la capacidad (${conteo.criticos})`} />
            <Legend color="bg-amber-300" label={`Al límite: ${Math.round(PCT_LIMITE * 100)}–100% (${conteo.limite})`} />
            <Legend color="bg-emerald-500/80" label={`Normal (${conteo.normales})`} />
            <Legend color="bg-slate-100 border border-slate-300" label={`s/datos (${conteo.sin_datos})`} />
          </div>
        </CardContent>
      </Card>

      <UmbralesInlineCard umbrales={umbrales} />


      {/* Solapas ordenadas según el ciclo de gestión del período crítico
          (R3.4.1 detectar → analizar → planificar → R3.4.2 revisar → R3.4.3 evaluar)
          y agrupadas por color de fase para distinguirlas de un vistazo. */}
      <Tabs defaultValue="calendario">
        <TabsList className="flex w-full flex-nowrap items-stretch gap-1 h-auto">
          <TabsTrigger value="calendario" className={`${TAB} ${FASE.detectar}`}><CalendarRange className="w-4 h-4" /><span>Calendario</span></TabsTrigger>
          <TabsTrigger value="detalle" className={`${TAB} ${FASE.detectar}`}><Table className="w-4 h-4" /><span>Detalle semanal</span></TabsTrigger>
          <TabsTrigger value="periodos" className={`${TAB} ${FASE.analizar}`}><ListTree className="w-4 h-4" /><span>Períodos críticos</span></TabsTrigger>
          <TabsTrigger value="comparativo" className={`${TAB} ${FASE.analizar}`}><ColumnsIcon className="w-4 h-4" /><span>Comparativo</span></TabsTrigger>
          <TabsTrigger value="comparativo-inverso" className={`${TAB} ${FASE.analizar}`}><ColumnsIcon className="w-4 h-4" /><span>Comparativo inverso</span></TabsTrigger>
          <TabsTrigger value="simulador" className={`${TAB} ${FASE.planificar}`}><FlaskConical className="w-4 h-4" /><span>Simulador</span></TabsTrigger>
          <TabsTrigger value="revision" className={`${TAB} ${FASE.revisar}`}><ClipboardCheck className="w-4 h-4" /><span>Revisión mensual</span></TabsTrigger>
          <TabsTrigger value="swot" className={`${TAB} ${FASE.evaluar}`}><Grid2x2 className="w-4 h-4" /><span>Análisis FODA</span></TabsTrigger>
          <TabsTrigger value="incentivos" className={`${TAB} ${FASE.evaluar}`}><Gift className="w-4 h-4" /><span>Incentivos</span></TabsTrigger>
          <TabsTrigger value="config" className={`${TAB} ${FASE.setup}`}><Settings className="w-4 h-4" /><span>Configuración</span></TabsTrigger>
        </TabsList>

        <TabsContent value="calendario" className="space-y-3">
          {errorDias && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {errorDias}
            </div>
          )}
          <TooltipProvider delay={150}>
            {/* 3 columnas como máximo: el calendario se lee más grande que con 4. */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 12 }, (_, i) => (
                <MesGrid key={i} mes={i + 1} dias={diasActivos} />
              ))}
            </div>
          </TooltipProvider>
        </TabsContent>

        <TabsContent value="detalle">
          <DetalleSemanalTab dias={diasActivos} umbrales={umbrales} />
        </TabsContent>

        <TabsContent value="periodos">
          <PeriodosTab
            diasPorAnio={diasPorAnio}
            aniosDisponibles={aniosDisponibles}
            anioAnticipar={anioActivo}
            planes={planes}
          />
        </TabsContent>
        <TabsContent value="comparativo">
          <ComparativoTab
            aniosDisponibles={aniosDisponibles}
            diasPorAnio={diasPorAnio}
          />
        </TabsContent>
        <TabsContent value="comparativo-inverso">
          <ComparativoInversoTab
            aniosDisponibles={aniosDisponibles}
            diasPorAnio={diasPorAnio}
          />
        </TabsContent>
        <TabsContent value="simulador">
          <SimuladorTab dias={diasActivos} umbrales={umbrales} />
        </TabsContent>
        <TabsContent value="revision">
          <RevisionMensualTab dias={diasActivos} anio={anioActivo} />
        </TabsContent>
        <TabsContent value="swot">
          <SwotTab dias={diasActivos} anio={anioActivo} />
        </TabsContent>
        <TabsContent value="incentivos">
          <IncentivosTab anioActivo={anioActivo} />
        </TabsContent>
        <TabsContent value="config">
          <ConfiguracionTab cfg={cfg} umbrales={umbrales} planes={planes} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`inline-block w-3 h-3 rounded-sm ${color}`} />
      <span className="text-slate-700">{label}</span>
    </div>
  )
}

// ============================================================================
// Card inline con la capacidad de distribución y los targets de contexto,
// editables sin salir del calendario. Mismo endpoint que el tab Configuración.
// ============================================================================
export function UmbralesInlineCard({ umbrales }: { umbrales: UmbralesPC }) {
  const router = useRouter()
  const [camiones, setCamiones] = useState(umbrales.camiones)
  const [hlCam, setHlCam] = useState(umbrales.hl_por_camion)
  const [ocup, setOcup] = useState(umbrales.pct_ocupacion)
  const [cli, setCli] = useState(umbrales.clientes)
  const [otif, setOtif] = useState(umbrales.otif_min)
  const [aus, setAus] = useState(umbrales.ausentismo_max)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Mismo cálculo que la columna generada de la base, para ver el HL al tipear.
  const capacidad = Math.round(camiones * hlCam * ocup)

  const dirty =
    camiones !== umbrales.camiones ||
    hlCam !== umbrales.hl_por_camion ||
    ocup !== umbrales.pct_ocupacion ||
    cli !== umbrales.clientes ||
    otif !== umbrales.otif_min ||
    aus !== umbrales.ausentismo_max

  async function guardar() {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/umbrales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camiones, hl_por_camion: hlCam, pct_ocupacion: ocup,
          clientes: cli, otif_min: otif, ausentismo_max: aus,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setMsg("Guardado")
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 2500)
    }
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="text-xs font-semibold text-slate-700 mr-1">
            Capacidad de distribución <span className="font-normal text-slate-500">(define el día crítico)</span>:
          </div>
          <UInput label="Camiones" value={camiones} onChange={setCamiones} step={1} min={1} max={200} integer />
          <span className="pb-1.5 text-slate-400">×</span>
          <UInput label="HL por camión" value={hlCam} onChange={setHlCam} step={1} min={1} max={1000} suffix="HL" />
          <span className="pb-1.5 text-slate-400">×</span>
          <UInput label="Ocupación bodega" value={ocup} onChange={setOcup} step={0.05} min={0.05} max={3} pct />
          <span className="pb-1.5 text-slate-400">=</span>
          <span className="pb-1 text-sm font-semibold text-slate-900">
            {fmtHL(capacidad)} HL
            {capacidad !== umbrales.vol_pico && (
              <span className="ml-1 text-[10px] font-normal text-amber-700">sin guardar</span>
            )}
          </span>
          <Button onClick={guardar} disabled={!dirty || saving} size="sm" className="ml-auto">
            {saving ? "Guardando…" : "Guardar"}
          </Button>
          {msg && (
            <span className={msg === "Guardado" ? "text-xs text-emerald-700" : "text-xs text-red-700"}>
              {msg}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
          <div className="text-xs font-semibold text-slate-700 mr-1">
            Contexto <span className="font-normal text-slate-500">(agrava el día, no lo vuelve crítico)</span>:
          </div>
          <UInput label="Clientes >" value={cli} onChange={setCli} step={10} integer />
          <UInput label="Rechazo >" value={otif} onChange={setOtif} step={0.01} pct />
          <UInput label="Ausentismo ≥" value={aus} onChange={setAus} step={0.005} pct />
        </div>
      </CardContent>
    </Card>
  )
}

function UInput({
  label, value, onChange, step, min = 0, max, suffix, pct, integer,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step: number
  min?: number
  max?: number
  suffix?: string
  pct?: boolean
  integer?: boolean
}) {
  return (
    <label className="flex flex-col text-[10px] text-slate-500">
      <span>{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            onChange(integer ? Math.round(n) : n)
          }}
          className="h-7 w-20 rounded-md border border-slate-200 px-1.5 text-sm"
        />
        {suffix && <span className="text-[10px] text-slate-500">{suffix}</span>}
        {pct && <span className="text-[10px] text-slate-500">(0-1)</span>}
      </div>
    </label>
  )
}

// ============================================================================
// Pestaña "Comparativo" — dos años lado a lado para ver el solapamiento
// (¿qué semana fue crítica el año pasado y cómo viene este?).
// ============================================================================
function ComparativoTab({
  aniosDisponibles,
  diasPorAnio,
}: {
  aniosDisponibles: number[]
  diasPorAnio: Record<number, DiaCalendario[]>
}) {
  const ultimo = aniosDisponibles[aniosDisponibles.length - 1] ?? new Date().getFullYear()
  const anterior = aniosDisponibles[aniosDisponibles.length - 2] ?? ultimo - 1
  const [anioA, setAnioA] = useState<number>(anterior)
  const [anioB, setAnioB] = useState<number>(ultimo)
  const diasA = diasPorAnio[anioA] ?? []
  const diasB = diasPorAnio[anioB] ?? []

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Año A:</span>
            <select
              value={anioA}
              onChange={(e) => setAnioA(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 px-2 text-sm font-semibold"
            >
              {aniosDisponibles.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <span className="text-slate-400">vs</span>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Año B:</span>
            <select
              value={anioB}
              onChange={(e) => setAnioB(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 px-2 text-sm font-semibold"
            >
              {aniosDisponibles.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <ResumenAnio anio={anioA} dias={diasA} />
          <ResumenAnio anio={anioB} dias={diasB} />
        </CardContent>
      </Card>

      {/* Cruce de períodos: qué pasó en B con los períodos críticos de A */}
      <CrucePeriodos diasBase={diasA} diasComparar={diasB} anioBase={anioA} anioComparar={anioB} />

      <TooltipProvider delay={150}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ColumnaAnio anio={anioA} dias={diasA} bgWrap="bg-sky-50 border-sky-200" bgHeader="bg-sky-50" />
          <ColumnaAnio anio={anioB} dias={diasB} bgWrap="bg-amber-50 border-amber-200" bgHeader="bg-amber-50" />
        </div>
      </TooltipProvider>
    </div>
  )
}

// Comparativo inverso: períodos que fueron críticos en el año en curso
// (transcurrido) y que NO lo fueron en las mismas fechas del año anterior.
function ComparativoInversoTab({
  aniosDisponibles,
  diasPorAnio,
}: {
  aniosDisponibles: number[]
  diasPorAnio: Record<number, DiaCalendario[]>
}) {
  const ultimo =
    aniosDisponibles[aniosDisponibles.length - 1] ?? new Date().getFullYear()
  const anterior = aniosDisponibles[aniosDisponibles.length - 2] ?? ultimo - 1
  // Base = año en curso (último); Comparar = anterior.
  const [anioBase, setAnioBase] = useState<number>(ultimo)
  const [anioComp, setAnioComp] = useState<number>(anterior)

  const hoyIso = useMemo(() => {
    const d = new Date()
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-")
  }, [])
  // El año base se toma "transcurrido": si es el año actual, sólo hasta hoy.
  const diasBase = useMemo(() => {
    const arr = diasPorAnio[anioBase] ?? []
    return anioBase === new Date().getFullYear()
      ? arr.filter((d) => d.fecha <= hoyIso)
      : arr
  }, [diasPorAnio, anioBase, hoyIso])
  const diasComp = diasPorAnio[anioComp] ?? []

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Año (transcurrido):</span>
            <select
              value={anioBase}
              onChange={(e) => setAnioBase(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 px-2 text-sm font-semibold"
            >
              {aniosDisponibles.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <span className="text-slate-400">vs</span>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Comparar con:</span>
            <select
              value={anioComp}
              onChange={(e) => setAnioComp(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 px-2 text-sm font-semibold"
            >
              {aniosDisponibles.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <ResumenAnio anio={anioBase} dias={diasBase} />
          <ResumenAnio anio={anioComp} dias={diasComp} />
        </CardContent>
      </Card>

      <CrucePeriodos
        diasBase={diasBase}
        diasComparar={diasComp}
        anioBase={anioBase}
        anioComparar={anioComp}
        soloNuevos
      />
    </div>
  )
}

function ResumenAnio({ anio, dias }: { anio: number; dias: DiaCalendario[] }) {
  const criticos = dias.filter((d) => d.estatus === "CRITICO").length
  const conDatos = dias.filter((d) => d.hl > 0).length
  return (
    <div className="text-xs text-slate-600 border-l border-slate-200 pl-3">
      <b className="text-slate-900">{anio}:</b> {criticos} críticos · {conDatos} días con datos
    </div>
  )
}

function ColumnaAnio({
  anio,
  dias,
  bgWrap,
  bgHeader,
}: {
  anio: number
  dias: DiaCalendario[]
  bgWrap: string
  bgHeader: string
}) {
  return (
    <div className={`space-y-2 rounded-lg border p-2 ${bgWrap}`}>
      <div className={`text-sm font-semibold text-slate-900 sticky top-0 py-1 z-10 ${bgHeader}`}>
        Año {anio}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {Array.from({ length: 12 }, (_, i) => (
          <MesGrid key={i} mes={i + 1} dias={dias} />
        ))}
      </div>
    </div>
  )
}

