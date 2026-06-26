"use client"

import { useMemo } from "react"
import type { DiaCalendario, UmbralesPC } from "./client"
import { intensidadDia, INTENSIDAD_BG } from "./client"

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
  mesPertenencia: number           // 1-12 según el jueves (criterio ISO)
  dias: (DiaCalendario | null)[]   // 7 slots Lun..Dom
  totalPicos: number               // Σ trigger_count en la semana
  criticos: number                 // # días con estatus=CRITICO
}

const NOMBRES_MES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
]

// Mes "pertenencia" de la semana ISO: el del jueves (mismo criterio que el
// año ISO, así una semana que cruza meses queda asignada a uno solo).
function mesDeSemanaIso(fechaCualquiera: string): number {
  const d = new Date(fechaCualquiera + "T00:00:00")
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum)   // jueves de la misma semana ISO
  return utc.getUTCMonth() + 1
}

function agruparPorSemana(dias: DiaCalendario[]): Semana[] {
  const grupos: Record<string, Semana> = {}
  for (const d of dias) {
    const { year, week } = isoYearWeek(d.fecha)
    const id = `${year}-W${String(week).padStart(2, "0")}`
    if (!grupos[id]) {
      grupos[id] = {
        id, nro: week, anio: year,
        mesPertenencia: mesDeSemanaIso(d.fecha),
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

// Agrupa semanas por mes natural. Cada semana aparece en TODOS los meses
// donde tiene al menos un día visible (lun-sáb) del año en curso. Esto evita
// el bug de las semanas que cruzan diciembre→enero: la semana 1-2026 (cuyo
// jueves cae en enero) igual aparece en diciembre 2025 mientras tenga días
// 29/30/31-dic en el array.
function agruparPorMes(semanas: Semana[]): Semana[][] {
  const porMes: Semana[][] = Array.from({ length: 12 }, () => [])
  for (const s of semanas) {
    const mesesPresentes = new Set<number>()
    for (const d of s.dias) {
      if (d && d.dow !== 0) mesesPresentes.add(d.mes)
    }
    for (const m of mesesPresentes) {
      porMes[m - 1].push(s)
    }
  }
  return porMes
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

  // 12 meses en orden consecutivo. El grid CSS los acomoda 3 por fila:
  // [Ene Feb Mar] [Abr May Jun] [Jul Ago Sep] [Oct Nov Dic]
  const meses = agruparPorMes(semanas)

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-600">
        4 variables día a día agrupadas por semana ISO. Celda <span className="text-red-700 font-semibold">roja</span> si gatilla su trigger,
        <span className="text-emerald-700 font-semibold"> verde</span> si bajo target, gris si sin datos. Fila TIPO con la intensidad (BAJO·1 / MEDIO·2 / ALTO·3 / PICO·4).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {meses.map((sems, i) => (
          <TablaMes key={i} mes={i + 1} semanas={sems} umbrales={umbrales} />
        ))}
      </div>
    </div>
  )
}

function TablaMes({
  mes,
  semanas,
  umbrales,
}: {
  mes: number
  semanas: Semana[]
  umbrales: UmbralesPC
}) {
  // Contar críticos SOLO de los días del bloque que pertenecen a este mes
  // (porque las semanas cruzadas aparecen en 2 meses y w.criticos suma toda
  // la semana, no este mes).
  const criticosDelMes = semanas.reduce(
    (s, w) => s + w.dias.filter((d) => d != null && d.mes === mes && d.estatus === "CRITICO").length,
    0,
  )
  return (
    <div className="rounded-md border border-slate-200 overflow-hidden">
      {/* Banner mes */}
      <div className="bg-slate-800 text-white px-2 py-1 flex items-center justify-between text-xs">
        <span className="font-bold tracking-wider">{NOMBRES_MES[mes - 1]}</span>
        {criticosDelMes > 0 ? (
          <span className="text-[10px] bg-red-600 text-white rounded px-1.5 py-0.5">
            {criticosDelMes} críticos
          </span>
        ) : (
          <span className="text-[10px] opacity-60">— normal —</span>
        )}
      </div>
      {semanas.length === 0 ? (
        <div className="text-[10px] text-slate-400 text-center py-2">— sin semanas —</div>
      ) : (
        <table className="w-full text-[10px] border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-slate-200 px-1 py-0.5 w-10 text-left">SEM</th>
              <th className="border border-slate-200 px-1 py-0.5 w-12 text-left">Var</th>
              {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                <th key={i} className="border border-slate-200 px-1 py-0.5 text-center">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semanas.map((sem) => (
              <SemanaBloque key={sem.id} sem={sem} umbrales={umbrales} />
            ))}
          </tbody>
        </table>
      )}
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
        <td rowSpan={6} className={`border border-slate-200 px-1 py-0.5 align-top font-semibold text-center ${semColor}`}>
          <div className="text-xs font-bold leading-tight">{sem.nro}</div>
          <div className="text-[9px] opacity-70">{sem.anio}</div>
          <div className="text-[9px] font-semibold mt-0.5">{sem.criticos}c</div>
        </td>
        <td className="border border-slate-200 px-1 py-0.5 text-[9px] uppercase text-slate-500">Fecha</td>
        {sem.dias.map((d, i) => (
          <td key={i} className="border border-slate-200 px-1 py-0.5 text-center text-slate-700">
            {d ? fmtDM(d.fecha) : "—"}
          </td>
        ))}
      </tr>
      <FilaVariable label="VOL (HL)" sem={sem} render={(d) => fmtHL(Number(d.hl))} gatillo={(d) => d.trigger_vol} umbral={`PICO ≥ ${umbrales.vol_pico}`} />
      <FilaVariable label="OTIF (% rech.)" sem={sem} render={(d) => fmtPctC(Number(d.otif_estimado))} gatillo={(d) => d.trigger_otif} umbral={`> ${fmtPct(umbrales.otif_min)}`} />
      <FilaVariable label="AUS" sem={sem} render={(d) => fmtPctC(Number(d.pct_ausentismo))} gatillo={(d) => d.trigger_aus} umbral={`≥ ${fmtPct(umbrales.ausentismo_max)}`} />
      <FilaVariable label="#CL" sem={sem} render={(d) => String(d.clientes_dia)} gatillo={(d) => d.trigger_cli} umbral={`> ${umbrales.clientes}`} />
      <FilaTipo sem={sem} />
    </>
  )
}

// Versión compacta del % (sin decimales) para que entre en celdas chicas
const fmtPctC = (n: number) => Math.round(n * 100) + "%"

function FilaVariable({
  label,
  sem,
  render,
  gatillo,
  umbral,
}: {
  label: string
  sem: Semana
  render: (d: DiaCalendario) => string
  gatillo: (d: DiaCalendario) => boolean
  umbral: string
}) {
  return (
    <tr>
      <td
        className="border border-slate-200 px-1 py-0.5 text-[9px] uppercase font-semibold text-slate-600 bg-slate-50"
        title={umbral}
      >
        {label}
      </td>
      {sem.dias.map((d, i) => {
        if (!d) {
          return <td key={i} className="border border-slate-200 px-1 py-0.5 text-center bg-slate-50 text-slate-300">—</td>
        }
        // Día sin volumen real (excepto AUS que es mensual y puede tener valor)
        if (Number(d.hl) === 0 && label !== "AUS") {
          return <td key={i} className="border border-slate-200 px-1 py-0.5 text-center bg-slate-50 text-slate-300">—</td>
        }
        const g = gatillo(d)
        const cls = g
          ? "bg-red-100 text-red-900 font-semibold"
          : "bg-emerald-50 text-emerald-900"
        return (
          <td key={i} className={`border border-slate-200 px-1 py-0.5 text-center ${cls}`}>
            {render(d)}
          </td>
        )
      })}
    </tr>
  )
}

function FilaTipo({ sem }: { sem: Semana }) {
  return (
    <tr>
      <td className="border border-slate-200 px-1 py-0.5 text-[9px] uppercase font-semibold text-slate-600 bg-slate-50">
        TIPO
      </td>
      {sem.dias.map((d, i) => {
        if (!d) return <td key={i} className="border border-slate-200 px-1 py-0.5 text-center bg-slate-50 text-slate-300">—</td>
        const n = d.trigger_count
        if (n === 0) {
          return (
            <td key={i} className="border border-slate-200 px-1 py-0.5 text-center bg-emerald-100 text-emerald-900">
              —
            </td>
          )
        }
        return (
          <td key={i} className={`border border-slate-200 px-1 py-0.5 text-center font-bold text-[9px] ${INTENSIDAD_BG[intensidadDia(n)]}`}>
            {intensidadDia(n)}
          </td>
        )
      })}
    </tr>
  )
}
