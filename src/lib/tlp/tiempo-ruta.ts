import type { createClient } from "@/lib/supabase/server"
import { tiempoRutaLimpias } from "@/lib/foxtrot/tiempo-ruta-limpias"
import { fetchViajesTlp } from "./calc"

// Tiempo promedio en ruta: el KPI del cuadro mensual (pilar Flota) y el nodo
// "Tiempo en Ruta" del Árbol del Sueño.
//
// 🚨 Es EL MISMO tiempo que usa el TLP como denominador — está todo relacionado,
// así que no puede medirse distinto en un lado y en el otro:
//
//   - desde ABRIL: el CHECKLIST de retorno (retorno − liberación del camión),
//     que es el que multiplica por la dotación en el TLP. Arrancó el 9-abr;
//   - antes de abril: FOXTROT, rutas limpias (las cerradas el mismo día que
//     arrancaron), porque el checklist todavía no existía. Es la misma fuente con
//     la que se cerraron el TLP de enero, febrero y marzo.
//
// Las dos fuentes ya midiendo lo mismo dan casi igual: en junio, sobre las 104
// rutas que parean, Foxtrot da 6,78 hs y el checklist 6,79 (mediana de la
// diferencia: 0). En mayo el checklist todavía corría 24 min más largo.
//
// El promedio es PONDERADO (Σ horas ÷ Σ viajes): una salida pesa igual venga de
// donde venga, en vez de que una ciudad chica pese como una grande.

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Primer mes con checklist de retorno (arrancó el 9-abr-2026). */
export const TIEMPO_RUTA_CHECKLIST_DESDE = "2026-04"

/** Meta del KPI (horas por salida) y su gatillo. */
export const TIEMPO_RUTA_META = 8
export const TIEMPO_RUTA_GATILLO = 8.5

export type FuenteTiempoRuta = "checklist" | "foxtrot"

export interface TiempoRutaMes {
  mes: number
  horas: number
  /** Viajes (checklist) o rutas limpias (Foxtrot) que promediaron. */
  viajes: number
  fuente: FuenteTiempoRuta
}

export interface TiempoRutaResumen {
  anio: number
  /** Promedio ponderado del año: Σ horas ÷ Σ viajes. */
  ytd: number
  viajes: number
  meses: TiempoRutaMes[]
}

const mesClave = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`

export async function tiempoRutaAnual(
  supabase: Supabase,
  anio: number,
): Promise<TiempoRutaResumen | null> {
  const hoy = new Date().toISOString().slice(0, 10)
  const hasta = hoy < `${anio}-12-31` ? hoy : `${anio}-12-31`
  const desde = `${anio}-01-01`

  const [{ viajes }, fox] = await Promise.all([
    fetchViajesTlp(supabase, desde, hasta),
    tiempoRutaLimpias(supabase, desde, hasta),
  ])

  const acum = new Map<number, { horas: number; viajes: number; fuente: FuenteTiempoRuta }>()

  // Meses previos al checklist: Foxtrot.
  for (const [mes, a] of fox.porMes) {
    if (mesClave(anio, mes) >= TIEMPO_RUTA_CHECKLIST_DESDE) continue
    acum.set(mes, { horas: a.horas * a.rutas, viajes: a.rutas, fuente: "foxtrot" })
  }

  // Desde abril: el checklist, o sea los mismos viajes del TLP.
  for (const v of viajes) {
    const mes = Number(v.fecha.slice(5, 7))
    if (mesClave(anio, mes) < TIEMPO_RUTA_CHECKLIST_DESDE) continue
    const a = acum.get(mes) ?? { horas: 0, viajes: 0, fuente: "checklist" as FuenteTiempoRuta }
    a.horas += v.horasRuta
    a.viajes += 1
    acum.set(mes, a)
  }

  let horas = 0
  let total = 0
  const meses: TiempoRutaMes[] = [...acum.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([mes, a]) => {
      horas += a.horas
      total += a.viajes
      return {
        mes,
        horas: Math.round((a.horas / a.viajes) * 100) / 100,
        viajes: a.viajes,
        fuente: a.fuente,
      }
    })

  if (total === 0) return null

  return {
    anio,
    ytd: Math.round((horas / total) * 100) / 100,
    viajes: total,
    meses,
  }
}
