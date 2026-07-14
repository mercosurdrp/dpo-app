import type { createClient } from "@/lib/supabase/server"
import { SELECT_RUTA_LIMPIA, esRutaLimpia } from "@/lib/foxtrot/ruta-limpia"

// Tiempo en ruta — el nodo del Árbol del Sueño y la fila del cuadro mensual.
//
// Son las HORAS QUE DURA UNA SALIDA, o sea el insumo del TLP (que las multiplica
// por la dotación). 🚨 Tiene que medir lo MISMO que el TLP, así que sale de las
// mismas dos fuentes:
//
//   - desde ABRIL: el CHECKLIST de retorno (retorno − liberación del camión), que
//     arrancó el 9-abr y es el que usa el TLP viaje a viaje;
//   - antes de abril: FOXTROT, solo RUTAS LIMPIAS (las cerradas el mismo día que
//     arrancaron) — con lo que se cerraron enero, febrero y marzo.
//
// Las dos fuentes ya miden casi igual: en junio, sobre las 104 rutas que parean,
// Foxtrot da 6,78 hs y el checklist 6,79 (mediana de la diferencia: 0). En mayo el
// checklist todavía corría 24 min más largo.
//
// El promedio es PONDERADO (Σ horas ÷ Σ viajes): una salida pesa igual venga de
// donde venga, en vez de que una ciudad chica pese como una grande.
//
// 🚨 Este módulo NO usa el motor del TLP (`fetchViajesTlp`): lee el checklist
// directo, que son ~200 filas por mes. Meter el motor entero acá tumbó el cuadro
// mensual el 13-jul.

type Supabase = Awaited<ReturnType<typeof createClient>>

const PAGE = 1000

/** Primer mes con checklist de retorno (arrancó el 9-abr-2026). */
export const TIEMPO_RUTA_CHECKLIST_DESDE = "2026-04"

export type FuenteTiempoRuta = "checklist" | "foxtrot"

export interface TiempoRutaMes {
  /** 1..12 */
  mes: number
  /** Horas promedio por salida. */
  horas: number
  /** Viajes (checklist) o rutas limpias (Foxtrot) que promediaron. */
  viajes: number
  fuente: FuenteTiempoRuta
}

export interface TiempoRutaAnual {
  anio: number
  /** Promedio ponderado del año: Σ horas ÷ Σ viajes. */
  ytd: number
  viajes: number
  meses: TiempoRutaMes[]
}

export async function tiempoRutaAnual(
  supabase: Supabase,
  anio: number,
): Promise<TiempoRutaAnual | null> {
  const hoy = new Date().toISOString().slice(0, 10)
  const hasta = hoy < `${anio}-12-31` ? hoy : `${anio}-12-31`
  const desde = `${anio}-01-01`

  type Acum = { min: number; viajes: number; fuente: FuenteTiempoRuta }
  const porMes = new Map<number, Acum>()
  const mesDe = (fecha: string) => Number(fecha.slice(5, 7))
  const esDeCierre = (fecha: string) => fecha.slice(0, 7) < TIEMPO_RUTA_CHECKLIST_DESDE

  // Antes de abril: Foxtrot, rutas limpias.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("foxtrot_routes")
      .select(`fecha, tiempo_ruta_minutos, ${SELECT_RUTA_LIMPIA}`)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{
      fecha: string
      tiempo_ruta_minutos: number | null
      ini: string | null
      fin: string | null
    }>
    for (const r of rows) {
      const min = Number(r.tiempo_ruta_minutos ?? 0)
      if (!esDeCierre(r.fecha) || min <= 0 || !esRutaLimpia(r.ini, r.fin)) continue
      const mes = mesDe(r.fecha)
      const a = porMes.get(mes) ?? { min: 0, viajes: 0, fuente: "foxtrot" as FuenteTiempoRuta }
      a.min += min
      a.viajes += 1
      porMes.set(mes, a)
    }
    if (rows.length < PAGE) break
  }

  // Desde abril: el checklist de retorno, la misma fuente que el TLP.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("checklist_vehiculos")
      .select("fecha, tiempo_ruta_minutos")
      .eq("tipo", "retorno")
      .not("tiempo_ruta_minutos", "is", null)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{ fecha: string; tiempo_ruta_minutos: number | null }>
    for (const r of rows) {
      const min = Number(r.tiempo_ruta_minutos ?? 0)
      if (esDeCierre(r.fecha) || min <= 0) continue
      const mes = mesDe(r.fecha)
      const a = porMes.get(mes) ?? { min: 0, viajes: 0, fuente: "checklist" as FuenteTiempoRuta }
      a.min += min
      a.viajes += 1
      porMes.set(mes, a)
    }
    if (rows.length < PAGE) break
  }

  let min = 0
  let viajes = 0
  const meses: TiempoRutaMes[] = [...porMes.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([mes, a]) => {
      min += a.min
      viajes += a.viajes
      return {
        mes,
        horas: Math.round((a.min / a.viajes / 60) * 100) / 100,
        viajes: a.viajes,
        fuente: a.fuente,
      }
    })

  if (viajes === 0) return null

  return {
    anio,
    ytd: Math.round((min / viajes / 60) * 100) / 100,
    viajes,
    meses,
  }
}
