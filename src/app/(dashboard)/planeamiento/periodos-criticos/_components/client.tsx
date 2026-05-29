"use client"

import { useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CalendarRange, FlaskConical, Settings, ListTree, ColumnsIcon } from "lucide-react"
import { SimuladorTab } from "./simulador"
import { ConfiguracionTab } from "./configuracion"
import { PeriodosTab } from "./periodos-tab"

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

const fmtHL = (n: number) =>
  n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
const fmtPct = (n: number) =>
  (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%"

// Modelo Mercosur: el color del día sale del "codigo" (cantidad de triggers).
// Cuanto más triggers activos, más intenso el rojo. Días sin triggers van
// verde si tienen datos y gris si no.
function estiloCelda(d: DiaCalendario): string {
  if (d.hl === 0 && d.dow !== 0) return "bg-slate-100 text-slate-400"  // sin datos
  if (d.dow === 0) return "bg-slate-100 text-slate-400"               // domingo
  const n = d.trigger_count
  if (n >= 4) return "bg-red-700 text-white font-bold"
  if (n === 3) return "bg-red-500 text-white font-semibold"
  if (n === 2) return "bg-orange-500 text-white font-semibold"
  if (n === 1) return "bg-amber-300 text-amber-950 font-medium"
  return "bg-emerald-500/80 text-white"                                // sin triggers, día normal
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
            {d.estatus === "CRITICO" && (
              <span className="rounded bg-red-700 text-white px-1.5 py-0.5 text-[10px] font-bold">
                {d.codigo} · CRÍTICO
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
            <b>{conteo.criticos}</b> días CRÍTICOS · Codifica V (vol) · C (clientes) · O (OTIF) · U (ausentismo)
          </span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <Legend color="bg-red-700" label={`4 trig (${conteo.t4})`} />
            <Legend color="bg-red-500" label={`3 trig (${conteo.t3})`} />
            <Legend color="bg-orange-500" label={`2 trig (${conteo.t2})`} />
            <Legend color="bg-amber-300" label={`1 trig (${conteo.t1})`} />
            <Legend color="bg-emerald-500/80" label={`Normal (${conteo.normales})`} />
            <Legend color="bg-slate-100 border border-slate-300" label={`s/datos (${conteo.sin_datos})`} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="calendario">
        <TabsList>
          <TabsTrigger value="calendario"><CalendarRange className="w-4 h-4 mr-1.5" /> Calendario</TabsTrigger>
          <TabsTrigger value="periodos"><ListTree className="w-4 h-4 mr-1.5" /> Períodos críticos</TabsTrigger>
          <TabsTrigger value="comparativo"><ColumnsIcon className="w-4 h-4 mr-1.5" /> Comparativo</TabsTrigger>
          <TabsTrigger value="simulador"><FlaskConical className="w-4 h-4 mr-1.5" /> Simulador</TabsTrigger>
          <TabsTrigger value="config"><Settings className="w-4 h-4 mr-1.5" /> Configuración</TabsTrigger>
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

        <TabsContent value="periodos">
          <PeriodosTab dias={diasActivos} planes={planes} />
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

      <TooltipProvider delay={150}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ColumnaAnio anio={anioA} dias={diasA} />
          <ColumnaAnio anio={anioB} dias={diasB} />
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

function ColumnaAnio({ anio, dias }: { anio: number; dias: DiaCalendario[] }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-900 sticky top-0 bg-white py-1 z-10">
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

