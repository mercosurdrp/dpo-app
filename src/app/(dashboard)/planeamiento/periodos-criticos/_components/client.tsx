"use client"

import { useMemo } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CalendarRange, FlaskConical, Settings, ListTree } from "lucide-react"
import { SimuladorTab } from "./simulador"
import { ConfiguracionTab } from "./configuracion"
import { PeriodosTab } from "./periodos-tab"

export type DiaCalendario = {
  fecha: string
  dow: number
  dia_semana: string
  mes: number
  hl: number
  hl_rechazo: number
  camiones: number
  pct_rechazo: number
  pct_ausentismo: number
  es_feriado: boolean
  nombre_feriado: string | null
  score: number
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

function estiloNivel(nivel: "BAJO" | "MEDIO" | "ALTO" | null, hl: number): string {
  if (nivel === "ALTO") return "bg-red-500 text-white font-semibold"
  if (nivel === "MEDIO") return "bg-amber-400 text-amber-950 font-medium"
  if (nivel === "BAJO" && hl > 0) return "bg-emerald-500/80 text-white"
  return "bg-slate-100 text-slate-400"  // sin datos / domingo
}

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
            {delMes.filter((d) => d.nivel === "ALTO").length} ALTO · {delMes.filter((d) => d.nivel === "MEDIO").length} MEDIO
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
  const cls = estiloNivel(d.nivel, d.hl)
  const dayNum = fecha.getDate()

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
        <div className="space-y-0.5">
          <div className="font-semibold">
            {d.dia_semana} {fecha.toLocaleDateString("es-AR")}
          </div>
          {d.es_feriado && (
            <div className="text-yellow-700 font-medium">★ {d.nombre_feriado}</div>
          )}
          <div>HL: <b>{fmtHL(d.hl)}</b></div>
          <div>% Rechazo: <b>{fmtPct(d.pct_rechazo)}</b></div>
          <div>% Ausentismo: <b>{fmtPct(d.pct_ausentismo)}</b></div>
          <div>Camiones: <b>{d.camiones}</b></div>
          <div className="mt-1 pt-1 border-t border-slate-200">
            Score: <b>{d.score.toFixed(3)}</b> → <b>{d.nivel}</b>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export function PeriodosCriticosClient({
  cfg,
  dias,
  errorDias,
}: {
  cfg: CfgPC
  dias: DiaCalendario[]
  errorDias: string | null
}) {
  const conteo = useMemo(() => {
    const c = { ALTO: 0, MEDIO: 0, BAJO: 0, sin_datos: 0 }
    for (const d of dias) {
      if (d.hl === 0 && d.dow !== 0) c.sin_datos++
      else c[d.nivel]++
    }
    return c
  }, [dias])

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Períodos Críticos</h1>
        <p className="text-sm text-slate-600">
          Pilar Planeamiento · Bloque 3.4 — Calendario basado en volumen, OTIF (1−rechazo) y ausentismo.
        </p>
      </header>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <Badge variant="outline">Año {cfg.anio}</Badge>
          <span className="text-xs text-slate-600">
            Pesos: <b>Vol {(cfg.w_vol * 100).toFixed(0)}%</b> · <b>OTIF {(cfg.w_otif * 100).toFixed(0)}%</b> · <b>Aus {(cfg.w_aus * 100).toFixed(0)}%</b>
          </span>
          <span className="text-xs text-slate-600">
            Umbrales: ALTO ≥ {cfg.umbral_alto} · MEDIO ≥ {cfg.umbral_medio}
          </span>
          {cfg.hl_p90_2025 == null && (
            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
              ⚠ Falta seed 2025 (P90 sin cachear): el score normaliza con valor 1
            </span>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs">
            <Legend color="bg-red-500" label={`ALTO (${conteo.ALTO})`} />
            <Legend color="bg-amber-400" label={`MEDIO (${conteo.MEDIO})`} />
            <Legend color="bg-emerald-500/80" label={`BAJO (${conteo.BAJO})`} />
            <Legend color="bg-slate-100 border border-slate-300" label={`s/datos (${conteo.sin_datos})`} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="calendario">
        <TabsList>
          <TabsTrigger value="calendario"><CalendarRange className="w-4 h-4 mr-1.5" /> Calendario</TabsTrigger>
          <TabsTrigger value="periodos"><ListTree className="w-4 h-4 mr-1.5" /> Períodos críticos</TabsTrigger>
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
                <MesGrid key={i} mes={i + 1} dias={dias} />
              ))}
            </div>
          </TooltipProvider>
        </TabsContent>

        <TabsContent value="periodos">
          <PeriodosTab dias={dias} />
        </TabsContent>
        <TabsContent value="simulador">
          <SimuladorTab dias={dias} cfg={cfg} />
        </TabsContent>
        <TabsContent value="config">
          <ConfiguracionTab cfg={cfg} />
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

