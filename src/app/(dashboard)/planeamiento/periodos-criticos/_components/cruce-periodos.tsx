"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowRight, ChevronDown, ChevronRight, TrendingDown, TrendingUp, Minus, Clock,
} from "lucide-react"
import type { DiaCalendario } from "./client"
import { intensidadDia, INTENSIDAD_BG } from "./client"
import { detectarPeriodosCriticos, type PeriodoCritico } from "../_lib/detectar-periodos"

// Las 4 variables que pueden gatillar, con su etiqueta corta.
const VARS: [keyof DiaCalendario, string][] = [
  ["trigger_vol", "Vol"],
  ["trigger_cli", "Cli"],
  ["trigger_otif", "OTIF"],
  ["trigger_aus", "Aus"],
]

const fmtDM = (f: string) => {
  const d = new Date(f + "T00:00:00")
  return `${d.getDate()}/${d.getMonth() + 1}`
}

// Variables que gatillaron en AL MENOS un día del conjunto.
function varsGatilladas(dias: DiaCalendario[]): Set<string> {
  const s = new Set<string>()
  for (const d of dias) for (const [k, lbl] of VARS) if (d[k] === true) s.add(lbl)
  return s
}

// Cruce de los períodos críticos del año base contra el año a comparar (mismas
// fechas mes/día): ¿se repitió?, ¿mismas variables o cambiaron?, ¿mejoró/empeoró?
export function CrucePeriodos({
  diasBase,
  diasComparar,
  anioBase,
  anioComparar,
}: {
  diasBase: DiaCalendario[]
  diasComparar: DiaCalendario[]
  anioBase: number
  anioComparar: number
}) {
  const periodos = useMemo(() => detectarPeriodosCriticos(diasBase), [diasBase])
  // Índice del año a comparar por "mm-dd" para encontrar el día equivalente.
  const mapB = useMemo(() => {
    const m = new Map<string, DiaCalendario>()
    for (const d of diasComparar) m.set(d.fecha.slice(5), d)
    return m
  }, [diasComparar])

  if (periodos.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-slate-500 text-center">
          No hay períodos críticos en {anioBase} para cruzar con {anioComparar}.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          Cruce de períodos · {anioBase}
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          {anioComparar}
        </CardTitle>
        <p className="text-xs text-slate-500">
          Para cada período crítico de {anioBase}, qué pasó en las mismas fechas de {anioComparar}:
          si se repitió, con las mismas variables o con otras, y si mejoró o empeoró.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {periodos.map((p) => (
          <CruceCard
            key={p.id}
            periodo={p}
            mapB={mapB}
            anioBase={anioBase}
            anioComparar={anioComparar}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function Chips({ vars, tono }: { vars: string[]; tono: string }) {
  if (vars.length === 0) return <span className="text-slate-400">—</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {vars.map((v) => (
        <span key={v} className={`px-1 rounded text-[10px] ${tono}`}>{v}</span>
      ))}
    </span>
  )
}

function CruceCard({
  periodo: p,
  mapB,
  anioBase,
  anioComparar,
}: {
  periodo: PeriodoCritico
  mapB: Map<string, DiaCalendario>
  anioBase: number
  anioComparar: number
}) {
  const [open, setOpen] = useState(false)

  // Días equivalentes en el año a comparar (por mm-dd).
  const diasB = p.dias
    .map((d) => mapB.get(d.fecha.slice(5)))
    .filter((d): d is DiaCalendario => Boolean(d))
  const hayDatosB = diasB.some((d) => Number(d.hl) > 0 || Number(d.pct_ausentismo) > 0)

  const maxA = Math.max(0, ...p.dias.map((d) => d.trigger_count ?? 0))
  const maxB = Math.max(0, ...diasB.map((d) => d.trigger_count ?? 0))
  const iA = intensidadDia(maxA)
  const iB = intensidadDia(maxB)

  const varsA = varsGatilladas(p.dias)
  const varsB = varsGatilladas(diasB)
  const seMantienen = [...varsA].filter((v) => varsB.has(v))
  const seSumaron = [...varsB].filter((v) => !varsA.has(v))
  const seFueron = [...varsA].filter((v) => !varsB.has(v))

  // Veredicto por intensidad (menos variables = mejoró).
  const veredicto = !hayDatosB
    ? { txt: "Aún sin datos", cls: "bg-slate-100 text-slate-500", Icon: Clock }
    : maxB < maxA
    ? { txt: "Mejoró", cls: "bg-emerald-100 text-emerald-800", Icon: TrendingDown }
    : maxB > maxA
    ? { txt: "Empeoró", cls: "bg-red-100 text-red-800", Icon: TrendingUp }
    : { txt: "Igual", cls: "bg-slate-100 text-slate-600", Icon: Minus }

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        <span className="font-medium text-sm text-slate-900 min-w-[130px]">{p.nombre}</span>

        <span className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500">{anioBase}</span>
          <Badge className={`${INTENSIDAD_BG[iA]} text-[10px]`}>{iA}</Badge>
          <Chips vars={[...varsA]} tono="bg-slate-100 text-slate-700" />
        </span>

        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />

        <span className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500">{anioComparar}</span>
          {hayDatosB ? (
            <>
              <Badge className={`${INTENSIDAD_BG[iB]} text-[10px]`}>{iB}</Badge>
              <Chips vars={[...varsB]} tono="bg-slate-100 text-slate-700" />
            </>
          ) : (
            <span className="text-slate-400">sin datos todavía</span>
          )}
        </span>

        <Badge className={`${veredicto.cls} ml-auto gap-1`}>
          <veredicto.Icon className="w-3 h-3" />
          {veredicto.txt}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1 text-xs"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          detalle
        </Button>
      </div>

      {/* Resumen de cambio de variables */}
      {hayDatosB && (
        <div className="px-2.5 pb-2 -mt-1 text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>Se mantienen: <Chips vars={seMantienen} tono="bg-amber-100 text-amber-800" /></span>
          {seSumaron.length > 0 && (
            <span>Aparecieron: <Chips vars={seSumaron} tono="bg-red-100 text-red-800" /></span>
          )}
          {seFueron.length > 0 && (
            <span>Se fueron: <Chips vars={seFueron} tono="bg-emerald-100 text-emerald-800" /></span>
          )}
        </div>
      )}

      {/* Detalle día a día */}
      {open && (
        <div className="border-t border-slate-100 p-2 overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-semibold px-1 py-0.5">Fecha</th>
                <th className="text-center font-semibold px-1 py-0.5">{anioBase}</th>
                <th className="text-left font-semibold px-1 py-0.5">Variables {anioBase}</th>
                <th className="text-center font-semibold px-1 py-0.5">{anioComparar}</th>
                <th className="text-left font-semibold px-1 py-0.5">Variables {anioComparar}</th>
              </tr>
            </thead>
            <tbody>
              {p.dias.map((dA) => {
                const dB = mapB.get(dA.fecha.slice(5))
                const iaDia = intensidadDia(dA.trigger_count ?? 0)
                const ibDia = dB ? intensidadDia(dB.trigger_count ?? 0) : null
                const vA = VARS.filter(([k]) => dA[k] === true).map(([, l]) => l)
                const vB = dB ? VARS.filter(([k]) => dB[k] === true).map(([, l]) => l) : []
                return (
                  <tr key={dA.fecha} className="border-t border-slate-100">
                    <td className="px-1 py-0.5 whitespace-nowrap">{fmtDM(dA.fecha)}</td>
                    <td className="px-1 py-0.5 text-center">
                      <span className={`px-1 rounded text-[10px] ${INTENSIDAD_BG[iaDia]}`}>{iaDia}</span>
                    </td>
                    <td className="px-1 py-0.5"><Chips vars={vA} tono="bg-slate-100 text-slate-700" /></td>
                    <td className="px-1 py-0.5 text-center">
                      {ibDia ? (
                        <span className={`px-1 rounded text-[10px] ${INTENSIDAD_BG[ibDia]}`}>{ibDia}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-1 py-0.5"><Chips vars={vB} tono="bg-slate-100 text-slate-700" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
