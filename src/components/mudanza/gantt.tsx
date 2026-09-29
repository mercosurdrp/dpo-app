"use client"

import { useMemo } from "react"
import type { MudanzaConfig, MudanzaTarea } from "@/types/mudanza"
import { MUDANZA_RUBROS } from "@/types/mudanza"
import {
  colorResponsable,
  diasEntre,
  estaAtrasada,
  formatFecha,
  isoHoy,
  parseFecha,
  superposiciones,
  tieneFechas,
} from "./formato"

const PX = 14 // píxeles por día
const DAY = 86400000
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

interface Props {
  tareas: MudanzaTarea[]
  config: MudanzaConfig | null
  /** Ids de los responsables en el orden del equipo (fija los colores). */
  ordenResponsables: string[]
  modo: "rubro" | "responsable"
  onSelect: (t: MudanzaTarea) => void
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function lunes(d: Date) {
  const x = new Date(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export function MudanzaGantt({ tareas, config, ordenResponsables, modo, onSelect }: Props) {
  const hoy = isoHoy()
  const datadas = useMemo(() => tareas.filter(tieneFechas), [tareas])
  const pisadas = useMemo(
    () => new Set(superposiciones(tareas).flat().map((t) => t.id)),
    [tareas],
  )

  const rango = useMemo(() => {
    let min = hoy
    let max = hoy
    for (const t of datadas) {
      if (t.inicio! < min) min = t.inicio!
      if (t.fin! > max) max = t.fin!
      if (t.inicio_real && t.inicio_real < min) min = t.inicio_real
      if (t.fin_real && t.fin_real > max) max = t.fin_real
    }
    for (const f of [config?.fecha_llaves, config?.fecha_mudanza]) {
      if (f && f < min) min = f
      if (f && f > max) max = f
    }
    const start = lunes(addDays(parseFecha(min), -7))
    const end = addDays(lunes(addDays(parseFecha(max), 13)), -1)
    const n = Math.round((end.getTime() - start.getTime()) / DAY) + 1
    return { start, end, n }
  }, [datadas, config, hoy])

  const off = (s: string) => Math.round((parseFecha(s).getTime() - rango.start.getTime()) / DAY) * PX
  const ancho = rango.n * PX

  const meses = useMemo(() => {
    const out: { label: string; dias: number }[] = []
    let d = new Date(rango.start)
    while (d <= rango.end) {
      const m = d.getMonth()
      const y = d.getFullYear()
      let n = 0
      while (d <= rango.end && d.getMonth() === m) {
        n++
        d = addDays(d, 1)
      }
      out.push({ label: `${MESES[m]} ${y}`, dias: n })
    }
    return out
  }, [rango])

  const semanas = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < rango.n; i += 7) {
      const w = addDays(rango.start, i)
      out.push(`${String(w.getDate()).padStart(2, "0")} ${MESES[w.getMonth()].toLowerCase()}`)
    }
    return out
  }, [rango])

  const findes = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < rango.n; i++) {
      const d = addDays(rango.start, i).getDay()
      if (d === 0 || d === 6) out.push(i)
    }
    return out
  }, [rango])

  const grupos = useMemo(() => {
    const g: Record<string, MudanzaTarea[]> = {}
    for (const t of datadas) {
      const k =
        modo === "responsable" ? (t.responsable_nombre ?? "Sin responsable") : t.rubro || "Sin rubro"
      ;(g[k] ??= []).push(t)
    }
    const keys = Object.keys(g).sort((a, b) => {
      if (modo === "rubro") {
        const ia = MUDANZA_RUBROS.indexOf(a)
        const ib = MUDANZA_RUBROS.indexOf(b)
        if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      }
      if (a === "Sin responsable") return 1
      if (b === "Sin responsable") return -1
      return a.localeCompare(b)
    })
    return keys.map((k) => ({
      key: k,
      tareas: g[k].sort((a, b) => a.inicio!.localeCompare(b.inicio!) || a.fin!.localeCompare(b.fin!)),
    }))
  }, [datadas, modo])

  if (datadas.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        Ninguna tarea tiene fechas planificadas todavía. Cargalas desde la pestaña Tareas.
      </div>
    )
  }

  const lineas = (
    <>
      {findes.map((i) => (
        <span
          key={i}
          className="absolute inset-y-0 bg-slate-100"
          style={{ left: i * PX, width: PX }}
        />
      ))}
      <span
        className="absolute inset-y-0 z-[1] border-l-2 border-orange-600"
        style={{ left: off(hoy) + PX / 2 }}
        title={`Hoy ${formatFecha(hoy)}`}
      />
      {config?.fecha_llaves && (
        <span
          className="absolute inset-y-0 z-[1] border-l-2 border-dashed border-violet-600"
          style={{ left: off(config.fecha_llaves) + PX / 2 }}
          title={`Llaves ${formatFecha(config.fecha_llaves)}`}
        />
      )}
      {config?.fecha_mudanza && (
        <span
          className="absolute inset-y-0 z-[1] border-l-2 border-dashed border-blue-600"
          style={{ left: off(config.fecha_mudanza) + PX / 2 }}
          title={`Mudanza ${formatFecha(config.fecha_mudanza)}`}
        />
      )}
    </>
  )

  return (
    <div className="space-y-2">
      <div className="max-h-[70vh] overflow-auto rounded-md border border-slate-200">
        <table className="border-separate border-spacing-0 text-xs" style={{ minWidth: "100%" }}>
          <thead className="sticky top-0 z-[4] bg-white">
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-[5] min-w-[240px] max-w-[300px] border-b border-r border-slate-200 bg-white px-3 py-1 text-left font-semibold text-slate-700"
              >
                Tarea
              </th>
              {meses.map((m, i) => (
                <th
                  key={i}
                  className="border-b border-l border-slate-200 px-2 py-1 text-left font-semibold text-slate-700"
                  style={{ minWidth: m.dias * PX, width: m.dias * PX }}
                >
                  {m.label}
                </th>
              ))}
            </tr>
            <tr>
              {semanas.map((w, i) => (
                <th
                  key={i}
                  className="border-b border-l border-slate-100 px-1 py-0.5 text-left font-normal tabular-nums text-slate-500"
                  style={{ minWidth: 7 * PX, width: 7 * PX }}
                  colSpan={1}
                >
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <GrupoFilas
                key={g.key}
                titulo={g.key}
                tareas={g.tareas}
                modo={modo}
                colorGrupo={
                  modo === "responsable"
                    ? colorResponsable(g.tareas[0]?.responsable_id ?? null, ordenResponsables)
                    : null
                }
                ancho={ancho}
                off={off}
                hoy={hoy}
                pisadas={pisadas}
                ordenResponsables={ordenResponsables}
                lineas={lineas}
                onSelect={onSelect}
                nSemanas={semanas.length}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-3 w-6 rounded-sm bg-slate-400/60" /> planificado
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-1.5 w-6 rounded-sm bg-slate-700" /> real
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-3 w-0 border-l-2 border-orange-600" /> hoy
        </span>
        {config?.fecha_llaves && (
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-0 border-l-2 border-dashed border-violet-600" /> llaves{" "}
            {formatFecha(config.fecha_llaves)}
          </span>
        )}
        {config?.fecha_mudanza && (
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-0 border-l-2 border-dashed border-blue-600" /> mudanza{" "}
            {formatFecha(config.fecha_mudanza)}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-3 w-6 rounded-sm outline outline-2 outline-red-500" /> atrasada
        </span>
        <span>rombo = hito · relleno = avance · &quot;se pisa&quot; = misma persona, mismas fechas</span>
      </div>
    </div>
  )
}

function GrupoFilas({
  titulo,
  tareas,
  modo,
  colorGrupo,
  ancho,
  off,
  hoy,
  pisadas,
  ordenResponsables,
  lineas,
  onSelect,
  nSemanas,
}: {
  titulo: string
  tareas: MudanzaTarea[]
  modo: "rubro" | "responsable"
  colorGrupo: string | null
  ancho: number
  off: (s: string) => number
  hoy: string
  pisadas: Set<string>
  ordenResponsables: string[]
  lineas: React.ReactNode
  onSelect: (t: MudanzaTarea) => void
  nSemanas: number
}) {
  return (
    <>
      <tr>
        <td className="sticky left-0 z-[2] border-b border-r border-slate-200 bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
          <span className="inline-flex items-center gap-2">
            {colorGrupo && (
              <i className="inline-block size-2.5 rounded-full" style={{ background: colorGrupo }} />
            )}
            {titulo}
            <span className="font-normal text-slate-400">· {tareas.length}</span>
          </span>
        </td>
        <td colSpan={nSemanas} className="border-b border-slate-200 bg-slate-100" />
      </tr>
      {tareas.map((t) => {
        const color = colorResponsable(t.responsable_id, ordenResponsables)
        const x = off(t.inicio!)
        const w = Math.max(PX, diasEntre(t.inicio!, t.fin!) * PX)
        const atrasada = estaAtrasada(t, hoy)
        const realInicio = t.inicio_real
        const realFin = t.fin_real ?? (t.inicio_real && t.estado !== "hecha" ? hoy : null)
        const xr = realInicio ? off(realInicio) : null
        const wr = realInicio && realFin && realFin >= realInicio ? Math.max(PX, diasEntre(realInicio, realFin) * PX) : null
        const tooltip = [
          t.nombre,
          `${t.responsable_nombre ?? "sin responsable"} · ${t.rubro}`,
          `Plan: ${formatFecha(t.inicio)} – ${formatFecha(t.fin)} (${diasEntre(t.inicio!, t.fin!)} d)`,
          realInicio
            ? `Real: ${formatFecha(realInicio)} – ${t.fin_real ? formatFecha(t.fin_real) : "en curso"}`
            : "Real: sin arrancar",
          `${t.estado.replace("_", " ")} · ${t.avance} %${atrasada ? " · ATRASADA" : ""}`,
        ].join("\n")
        return (
          <tr key={t.id} className="group">
            <td className="sticky left-0 z-[2] border-b border-r border-slate-100 bg-white px-3 py-1 group-hover:bg-slate-50">
              <button
                type="button"
                onClick={() => onSelect(t)}
                className="block w-full truncate text-left text-[13px] font-medium text-slate-800 hover:underline"
                title={t.nombre}
              >
                {t.hito ? "◆ " : ""}
                {t.nombre}
              </button>
              <div className="flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                {modo === "rubro" ? (
                  <>
                    <i className="inline-block size-2 rounded-full" style={{ background: color }} />
                    {t.responsable_nombre ?? "sin responsable"}
                  </>
                ) : (
                  t.rubro
                )}
                <span>· {t.estado.replace("_", " ")}</span>
                {atrasada && <span className="font-semibold text-red-600">· atrasada</span>}
              </div>
            </td>
            <td
              colSpan={nSemanas}
              className="relative h-[38px] border-b border-slate-100 p-0"
              style={{ minWidth: ancho, width: ancho }}
            >
              {lineas}
              {t.hito ? (
                <button
                  type="button"
                  onClick={() => onSelect(t)}
                  title={tooltip}
                  className={`absolute top-[11px] z-[2] size-4 rotate-45 rounded-[2px] border-2 border-white ${
                    atrasada ? "outline outline-2 outline-red-500" : ""
                  }`}
                  style={{ left: x + PX / 2 - 8, background: color, opacity: t.estado === "hecha" ? 0.45 : 0.95 }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(t)}
                  title={tooltip}
                  className={`absolute top-[6px] z-[2] h-[16px] rounded border-2 border-white ${
                    atrasada ? "outline outline-2 outline-red-500" : ""
                  } ${t.estado === "bloqueada" ? "bg-[repeating-linear-gradient(135deg,var(--c)_0_4px,transparent_4px_8px)]" : ""}`}
                  style={
                    {
                      left: x,
                      width: w,
                      "--c": color,
                      background: t.estado === "bloqueada" ? undefined : color,
                      opacity: t.estado === "hecha" ? 0.35 : 0.55,
                    } as React.CSSProperties
                  }
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-l-sm"
                    style={{ width: `${t.avance}%`, background: color }}
                  />
                </button>
              )}
              {xr != null && wr != null && !t.hito && (
                <span
                  className="absolute top-[25px] z-[2] h-[6px] rounded-sm bg-slate-700"
                  style={{ left: xr, width: wr }}
                  title={`Real: ${formatFecha(realInicio)} – ${t.fin_real ? formatFecha(t.fin_real) : "en curso"}`}
                />
              )}
              {xr != null && t.hito && (
                <span
                  className="absolute top-[27px] z-[2] size-2 rotate-45 bg-slate-700"
                  style={{ left: xr + PX / 2 - 4 }}
                  title={`Real: ${formatFecha(realInicio)}`}
                />
              )}
              <span
                className="pointer-events-none absolute top-[7px] z-[2] whitespace-nowrap text-[11px] text-slate-500"
                style={{ left: x + (t.hito ? PX + 4 : w + 6) }}
              >
                {t.hito ? formatFecha(t.inicio) : t.avance > 0 ? `${t.avance} %` : ""}
                {pisadas.has(t.id) && <span className="ml-1 font-semibold text-red-600">se pisa</span>}
              </span>
            </td>
          </tr>
        )
      })}
    </>
  )
}
