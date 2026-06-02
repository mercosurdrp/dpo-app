"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CalendarRange, FlaskConical, Settings, ListTree, ColumnsIcon, Table, ClipboardCheck, Grid2x2 } from "lucide-react"
import { SimuladorTab } from "./simulador"
import { ConfiguracionTab } from "./configuracion"
import { PeriodosTab } from "./periodos-tab"
import { DetalleSemanalTab } from "./detalle-semanal-tab"
import { RevisionMensualTab } from "./revision-mensual-tab"
import { SwotTab } from "./swot-tab"
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
  clasif_vol: "PICO" | "ALTO" | "MEDIO" | "BAJO"
  es_feriado: boolean
  nombre_feriado: string | null
  score: number
  // Triggers booleanos (modelo Mercosur)
  trigger_vol: boolean
  trigger_cli: boolean
  trigger_otif: boolean
  trigger_aus: boolean
  trigger_count: number
  codigo: string             // "AAAA" / "AAA" / "AA" / "A" / ""
  estatus: "CRITICO" | "NORMAL"
  // Compatibilidad con simulador / configuración del score continuo
  nivel: "BAJO" | "MEDIO" | "ALTO"
}

export type CfgPC = {
  anio: number
  w_vol: number
  w_otif: number
  w_aus: number
  umbral_alto: number
  umbral_medio: number
  hl_p90_2025: number | null
}

export type PlanAccion = {
  codigo: string
  descripcion: string
  plan_texto: string
}

export type UmbralesPC = {
  vol_pico: number
  vol_alto: number
  vol_medio: number
  clientes: number
  otif_min: number
  ausentismo_max: number
  min_triggers: number
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

const fmtHL = (n: number) =>
  n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
const fmtPct = (n: number) =>
  (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%"

// Intensidad del día = cuántas de las 4 variables (Vol/Cli/OTIF/Aus) cruzaron
// su target ese día. Es el idioma único del módulo: 4=PICO · 3=ALTO · 2=MEDIO ·
// 1=BAJO · 0=NORMAL. Reemplaza al viejo código "PPPP".
export type Intensidad = "PICO" | "ALTO" | "MEDIO" | "BAJO" | "NORMAL"

export function intensidadDia(triggerCount: number): Intensidad {
  if (triggerCount >= 4) return "PICO"
  if (triggerCount === 3) return "ALTO"
  if (triggerCount === 2) return "MEDIO"
  if (triggerCount === 1) return "BAJO"
  return "NORMAL"
}

// Color de fondo por intensidad (celdas del calendario / badges).
export const INTENSIDAD_BG: Record<Intensidad, string> = {
  PICO:   "bg-red-700 text-white font-bold",
  ALTO:   "bg-red-500 text-white font-semibold",
  MEDIO:  "bg-orange-500 text-white font-semibold",
  BAJO:   "bg-amber-300 text-amber-950 font-medium",
  NORMAL: "bg-emerald-500/80 text-white",
}

function estiloCelda(d: DiaCalendario): string {
  if (d.hl === 0 && d.dow !== 0) return "bg-slate-100 text-slate-400"  // sin datos
  if (d.dow === 0) return "bg-slate-100 text-slate-400"               // domingo
  return INTENSIDAD_BG[intensidadDia(d.trigger_count)]
}

// Etiquetas humanas de los triggers (para tooltip).
const TRIGGER_LABELS: Array<[keyof DiaCalendario, string]> = [
  ["trigger_otif", "OTIF < umbral"],
  ["trigger_vol", "Volumen = PICO"],
  ["trigger_cli", "Clientes > umbral"],
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
      <CardContent className="p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-900">{MESES[mes - 1]}</h3>
          <span className="text-xs text-slate-500">
            {delMes.filter((d) => d.estatus === "CRITICO").length} críticos
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {NOMBRES_DOW.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-slate-500 uppercase">
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
  if (!d) return <div className="aspect-square rounded-sm" />

  const fecha = new Date(d.fecha + "T00:00:00")
  const cls = estiloCelda(d)
  const dayNum = fecha.getDate()
  const triggersActivos = TRIGGER_LABELS.filter(([k]) => d[k] === true)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={`relative aspect-square rounded-sm text-[11px] flex items-center justify-center cursor-default ${cls} ${d.es_feriado ? "ring-2 ring-yellow-400" : ""}`}
          >
            {dayNum}
          </div>
        }
      />
      <TooltipContent side="top" className="text-xs">
        <div className="space-y-0.5 min-w-[200px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">
              {d.dia_semana} {fecha.toLocaleDateString("es-AR")}
            </span>
            {d.trigger_count > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${INTENSIDAD_BG[intensidadDia(d.trigger_count)]}`}>
                {intensidadDia(d.trigger_count)} · {d.trigger_count}/4
              </span>
            )}
          </div>
          {d.es_feriado && (
            <div className="text-yellow-700 font-medium">★ {d.nombre_feriado}</div>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 border-t border-slate-200">
            <span>HL:</span><span className="text-right"><b>{fmtHL(d.hl)}</b> · {d.clasif_vol}</span>
            <span>Clientes:</span><span className="text-right"><b>{d.clientes_dia}</b></span>
            <span>OTIF est:</span><span className="text-right"><b>{fmtPct(d.otif_estimado)}</b></span>
            <span>Ausentismo:</span><span className="text-right"><b>{fmtPct(d.pct_ausentismo)}</b></span>
          </div>
          {triggersActivos.length > 0 && (
            <div className="mt-1 pt-1 border-t border-slate-200">
              <div className="text-[10px] uppercase text-slate-500 mb-0.5">Triggers activos</div>
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
    const c = { criticos: 0, t1: 0, t2: 0, t3: 0, t4: 0, normales: 0, sin_datos: 0 }
    for (const d of diasActivos) {
      if (d.hl === 0 && d.dow !== 0) { c.sin_datos++; continue }
      if (d.estatus === "CRITICO") c.criticos++
      const n = d.trigger_count
      if (n === 0) c.normales++
      else if (n === 1) c.t1++
      else if (n === 2) c.t2++
      else if (n === 3) c.t3++
      else if (n >= 4) c.t4++
    }
    return c
  }, [diasActivos])

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Períodos Críticos</h1>
        <p className="text-sm text-slate-600">
          Pilar Planeamiento · Bloque 3.4 — Calendario por triggers (Volumen · Clientes · OTIF · Ausentismo).
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
            <b>{conteo.criticos}</b> días críticos · intensidad = cuántas de las 4 variables cruzan su target
          </span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <Legend color="bg-red-700" label={`PICO · 4 (${conteo.t4})`} />
            <Legend color="bg-red-500" label={`ALTO · 3 (${conteo.t3})`} />
            <Legend color="bg-orange-500" label={`MEDIO · 2 (${conteo.t2})`} />
            <Legend color="bg-amber-300" label={`BAJO · 1 (${conteo.t1})`} />
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
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="calendario" className={FASE.detectar}><CalendarRange className="w-4 h-4 mr-1.5" /> Calendario</TabsTrigger>
          <TabsTrigger value="detalle" className={FASE.detectar}><Table className="w-4 h-4 mr-1.5" /> Detalle semanal</TabsTrigger>
          <TabsTrigger value="periodos" className={FASE.analizar}><ListTree className="w-4 h-4 mr-1.5" /> Períodos críticos</TabsTrigger>
          <TabsTrigger value="comparativo" className={FASE.analizar}><ColumnsIcon className="w-4 h-4 mr-1.5" /> Comparativo</TabsTrigger>
          <TabsTrigger value="simulador" className={FASE.planificar}><FlaskConical className="w-4 h-4 mr-1.5" /> Simulador</TabsTrigger>
          <TabsTrigger value="revision" className={FASE.revisar}><ClipboardCheck className="w-4 h-4 mr-1.5" /> Revisión mensual</TabsTrigger>
          <TabsTrigger value="swot" className={FASE.evaluar}><Grid2x2 className="w-4 h-4 mr-1.5" /> Análisis FODA</TabsTrigger>
          <TabsTrigger value="config" className={FASE.setup}><Settings className="w-4 h-4 mr-1.5" /> Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="calendario" className="space-y-3">
          {errorDias && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {errorDias}
            </div>
          )}
          <TooltipProvider delay={150}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
        <TabsContent value="simulador">
          <SimuladorTab dias={diasActivos} cfg={cfg} umbrales={umbrales} />
        </TabsContent>
        <TabsContent value="revision">
          <RevisionMensualTab dias={diasActivos} anio={anioActivo} />
        </TabsContent>
        <TabsContent value="swot">
          <SwotTab dias={diasActivos} anio={anioActivo} />
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
// Card inline con los 6 umbrales editables al toque. Mismo endpoint que el
// tab Configuración, pero accesible mientras se mira el calendario.
// ============================================================================
function UmbralesInlineCard({ umbrales }: { umbrales: UmbralesPC }) {
  const router = useRouter()
  const [vp, setVP] = useState(umbrales.vol_pico)
  const [va, setVA] = useState(umbrales.vol_alto)
  const [vm, setVM] = useState(umbrales.vol_medio)
  const [cli, setCli] = useState(umbrales.clientes)
  const [otif, setOtif] = useState(umbrales.otif_min)
  const [aus, setAus] = useState(umbrales.ausentismo_max)
  const [mt, setMt] = useState(umbrales.min_triggers)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const dirty =
    vp !== umbrales.vol_pico ||
    va !== umbrales.vol_alto ||
    vm !== umbrales.vol_medio ||
    cli !== umbrales.clientes ||
    otif !== umbrales.otif_min ||
    aus !== umbrales.ausentismo_max ||
    mt !== umbrales.min_triggers

  async function guardar() {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/umbrales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vol_pico: vp, vol_alto: va, vol_medio: vm,
          clientes: cli, otif_min: otif, ausentismo_max: aus, min_triggers: mt,
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
      <CardContent className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="text-xs font-semibold text-slate-700 mr-1">Targets (1 variable cuenta si cruza):</div>
          <UInput label="Vol PICO ≥" value={vp} onChange={setVP} step={50} suffix="HL" />
          <UInput label="Vol ALTO ≥" value={va} onChange={setVA} step={50} suffix="HL" />
          <UInput label="Vol MEDIO ≥" value={vm} onChange={setVM} step={50} suffix="HL" />
          <UInput label="Clientes >" value={cli} onChange={setCli} step={10} integer />
          <UInput label="OTIF <" value={otif} onChange={setOtif} step={0.01} pct />
          <UInput label="Aus ≥" value={aus} onChange={setAus} step={0.005} pct />
          <UInput label="Crítico si #variables ≥" value={mt} onChange={setMt} step={1} min={1} max={4} integer />
          <Button onClick={guardar} disabled={!dirty || saving} size="sm" className="ml-auto">
            {saving ? "Guardando…" : "Guardar"}
          </Button>
          {msg && (
            <span className={msg === "Guardado" ? "text-xs text-emerald-700" : "text-xs text-red-700"}>
              {msg}
            </span>
          )}
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

