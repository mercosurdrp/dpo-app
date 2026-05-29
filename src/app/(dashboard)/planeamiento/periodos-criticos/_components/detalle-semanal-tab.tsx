"use client"

import { useMemo } from "react"
import type { DiaCalendario, UmbralesPC } from "./client"

const fmtHL = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
const fmtPct = (n: number) => (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%"
const fmtDM = (f: string) => {
  const d = new Date(f + "T00:00:00")
  return `${d.getDate()}/${d.getMonth() + 1}`
}

// ISO week (Lunes como inicio). Devuelve {year, week}.
function isoYearWeek(fecha: string): { year: number; week: number } {
  const d = new Date(fecha + "T00:00:00")
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = utc.getUTCDay() || 7              // Dom=7 (ISO)
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum)    // jueves de esta semana
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: utc.getUTCFullYear(), week: weekNum }
}

// Día ISO: 1=Lun..7=Dom (vs JS Date.getDay() 0=Dom..6=Sab)
function diaIso(fecha: string): number {
  const d = new Date(fecha + "T00:00:00")
  return d.getDay() === 0 ? 7 : d.getDay()
}

type Semana = {
  id: string
  nro: number
  anio: number
  dias: (DiaCalendario | null)[]   // 7 slots Lun..Dom
  totalPicos: number               // Σ trigger_count en la semana
  criticos: number                 // # días con estatus=CRITICO
}

function agruparPorSemana(dias: DiaCalendario[]): Semana[] {
  const grupos: Record<string, Semana> = {}
  for (const d of dias) {
    const { year, week } = isoYearWeek(d.fecha)
    const id = `${year}-W${String(week).padStart(2, "0")}`
    if (!grupos[id]) {
      grupos[id] = {
        id, nro: week, anio: year,
        dias: Array(7).fill(null),
        totalPicos: 0, criticos: 0,
      }
    }
    const slot = diaIso(d.fecha) - 1   // 0..6
    grupos[id].dias[slot] = d
    grupos[id].totalPicos += d.trigger_count ?? 0
    if (d.estatus === "CRITICO") grupos[id].criticos++
  }
  return Object.values(grupos).sort((a, b) =>
    a.anio !== b.anio ? a.anio - b.anio : a.nro - b.nro,
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function DetalleSemanalTab({
  dias,
  umbrales,
}: {
  dias: DiaCalendario[]
  umbrales: UmbralesPC
}) {
  const semanas = useMemo(() => agruparPorSemana(dias), [dias])

  if (semanas.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Sin datos para mostrar.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-600">
        Detalle semanal con las 4 variables día a día. Cada celda se pone <span className="text-red-700 font-semibold">en rojo</span> si gatilla su trigger,
        <span className="text-emerald-700 font-semibold"> verde</span> si está bajo el umbral, gris si no hay datos.
        La fila TIPO muestra el código del día (P/PP/PPP/PPPP) y al final la suma de PICOS de la semana.
      </p>
      <div className="overflow-auto rounded-md border border-slate-200 max-h-[78vh]">
        <table className="w-full text-[11px] border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              <th className="border border-slate-200 px-2 py-1 w-14 text-left">SEM</th>
              <th className="border border-slate-200 px-2 py-1 w-16 text-left">Variable</th>
              {["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"].map((d) => (
                <th key={d} className="border border-slate-200 px-2 py-1 text-center">{d}</th>
              ))}
              <th className="border border-slate-200 px-2 py-1 text-center w-20">Σ PICOS</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((sem) => (
              <SemanaBloque key={sem.id} sem={sem} umbrales={umbrales} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SemanaBloque({ sem, umbrales }: { sem: Semana; umbrales: UmbralesPC }) {
  const semColor =
    sem.criticos >= 3 ? "bg-red-100 text-red-900" :
    sem.criticos >= 1 ? "bg-amber-100 text-amber-900" :
    "bg-slate-50 text-slate-700"

  return (
    <>
      {/* Fila FECHA — encabezado del bloque, número de semana con rowSpan=6 */}
      <tr className="border-t-2 border-slate-300">
        <td rowSpan={6} className={`border border-slate-200 px-2 py-1 align-top font-semibold ${semColor}`}>
          <div className="text-sm">SEM {sem.nro}</div>
          <div className="text-[10px] font-normal opacity-70">{sem.anio}</div>
          <div className="mt-1 text-[10px] font-semibold">{sem.criticos} crit.</div>
        </td>
        <td className="border border-slate-200 px-2 py-0.5 text-[10px] uppercase text-slate-500">Fecha</td>
        {sem.dias.map((d, i) => (
          <td key={i} className="border border-slate-200 px-2 py-0.5 text-center text-slate-700">
            {d ? fmtDM(d.fecha) : "—"}
          </td>
        ))}
        <td className="border border-slate-200 px-2 py-0.5 text-center font-bold">{sem.totalPicos}</td>
      </tr>
      <FilaVariable label="VOL" sem={sem} render={(d) => `${fmtHL(Number(d.hl))}`} gatillo={(d) => d.trigger_vol} sufijo="HL" umbral={`PICO ≥ ${umbrales.vol_pico}`} />
      <FilaVariable label="OTIF" sem={sem} render={(d) => fmtPct(Number(d.otif_estimado))} gatillo={(d) => d.trigger_otif} umbral={`< ${fmtPct(umbrales.otif_min)}`} />
      <FilaVariable label="AUS" sem={sem} render={(d) => fmtPct(Number(d.pct_ausentismo))} gatillo={(d) => d.trigger_aus} umbral={`≥ ${fmtPct(umbrales.ausentismo_max)}`} />
      <FilaVariable label="#CL" sem={sem} render={(d) => String(d.clientes_dia)} gatillo={(d) => d.trigger_cli} umbral={`> ${umbrales.clientes}`} />
      <FilaTipo sem={sem} />
    </>
  )
}

function FilaVariable({
  label,
  sem,
  render,
  gatillo,
  sufijo,
  umbral,
}: {
  label: string
  sem: Semana
  render: (d: DiaCalendario) => string
  gatillo: (d: DiaCalendario) => boolean
  sufijo?: string
  umbral: string
}) {
  return (
    <tr>
      <td
        className="border border-slate-200 px-2 py-0.5 text-[10px] uppercase font-semibold text-slate-600 bg-slate-50"
        title={umbral}
      >
        {label}
      </td>
      {sem.dias.map((d, i) => {
        if (!d || Number(d.hl) === 0 && d.dow !== 0 && label !== "AUS") {
          // Día sin datos (excepto AUS que es mensual y puede tener valor)
          return <td key={i} className="border border-slate-200 px-2 py-0.5 text-center bg-slate-50 text-slate-300">—</td>
        }
        if (!d) {
          return <td key={i} className="border border-slate-200 px-2 py-0.5 text-center bg-slate-50 text-slate-300">—</td>
        }
        const g = gatillo(d)
        const cls = g
          ? "bg-red-100 text-red-900 font-semibold"
          : "bg-emerald-50 text-emerald-900"
        return (
          <td key={i} className={`border border-slate-200 px-2 py-0.5 text-center ${cls}`}>
            {render(d)}{sufijo ? <span className="text-[9px] opacity-70 ml-0.5">{sufijo}</span> : null}
          </td>
        )
      })}
      <td className="border border-slate-200 px-2 py-0.5"></td>
    </tr>
  )
}

function FilaTipo({ sem }: { sem: Semana }) {
  return (
    <tr>
      <td className="border border-slate-200 px-2 py-0.5 text-[10px] uppercase font-semibold text-slate-600 bg-slate-50">
        TIPO
      </td>
      {sem.dias.map((d, i) => {
        if (!d) return <td key={i} className="border border-slate-200 px-2 py-0.5 text-center bg-slate-50 text-slate-300">—</td>
        const n = d.trigger_count
        if (d.estatus === "CRITICO") {
          const cls =
            n >= 4 ? "bg-red-700 text-white" :
            n === 3 ? "bg-red-500 text-white" :
            "bg-orange-500 text-white"
          return (
            <td key={i} className={`border border-slate-200 px-2 py-0.5 text-center font-bold ${cls}`}>
              {d.codigo || "PP"}
            </td>
          )
        }
        if (n === 1) {
          return (
            <td key={i} className="border border-slate-200 px-2 py-0.5 text-center bg-amber-200 text-amber-900 font-semibold">
              {d.codigo}
            </td>
          )
        }
        return (
          <td key={i} className="border border-slate-200 px-2 py-0.5 text-center bg-emerald-100 text-emerald-900">
            —
          </td>
        )
      })}
      <td className="border border-slate-200 px-2 py-0.5 text-center font-bold bg-slate-100">
        {sem.totalPicos}
      </td>
    </tr>
  )
}
