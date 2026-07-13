import type { createClient } from "@/lib/supabase/server"
import { normChofer, patentesPorChoferFecha } from "@/lib/foxtrot/patente-pampeana"
import { foxtrotDcIds } from "@/lib/foxtrot"
import { normPatente, type ViajeTlp } from "./calc"

// Tiempo en PDV por ciudad — el nodo que cuelga de "Tiempo en Ruta" en el árbol
// del TLP.
//
// 🚨 Foxtrot NO mide el tiempo de permanencia en el cliente. Las columnas que lo
// darían (`Total Stop Time Seconds`, `Total Authorized Stops Seconds`) salen del
// GPS del camión y llegan VACÍAS: de 253 rutas de jun–jul 2026, apenas 6 las
// traen. Lo mismo con los metros/segundos manejados REALES.
//
// Así que el tiempo en PDV se DESPEJA del tiempo en ruta, que sí está medido
// (checklist de retorno, el mismo denominador del TLP):
//
//   minutos en PDV de la ruta = tiempo en ruta − manejo planificado − stems
//   tiempo en PDV             = Σ minutos en PDV ÷ Σ clientes visitados
//
// El manejo es el PLANIFICADO por Foxtrot (`Planned Foxtrot Driving Seconds`,
// 96% de cobertura) porque el real no viene: si el chofer manejó más lento que
// lo planificado, ese exceso queda imputado al tiempo en PDV. Contraste: este
// método da 6,1 min/cliente y las 6 rutas que Foxtrot sí midió por GPS dan 6,2.
//
// El puente Foxtrot → ciudad: Foxtrot solo trae el chofer (ni vehículo ni
// patente), así que se resuelve la patente por chofer + fecha contra el egreso
// de TML y con esa patente se toma la ciudad del viaje del TLP.

type Supabase = Awaited<ReturnType<typeof createClient>>

const PAGE = 1000

export interface TiempoPdvCiudad {
  /** Minutos promedio por cliente visitado. */
  minPorPdv: number
  /** Clientes visitados en el período (denominador). */
  clientes: number
  /** Rutas de Foxtrot que se pudieron imputar a la ciudad. */
  rutas: number
  /** Clientes promedio por ruta. */
  clientesPorRuta: number
}

export interface TiempoPdvResultado {
  porCiudad: Map<string, TiempoPdvCiudad>
  /** Serie mensual (1..12) — la usa el detalle del Árbol del Sueño. */
  porMes: Map<number, TiempoPdvCiudad>
  total: TiempoPdvCiudad | null
  /** Rutas de Foxtrot del rango que no se pudieron imputar a ninguna ciudad. */
  rutasSinCiudad: number
}

interface RutaFoxtrot {
  fecha: string
  driver_name: string | null
  raw_data: {
    tml_visited_customers?: number | null
    fx_planned_driving_sec?: number | null
    fx_stem_start_sec?: number | null
    fx_stem_end_sec?: number | null
  } | null
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

/**
 * Tiempo en PDV por ciudad para el rango, imputando cada ruta de Foxtrot a la
 * ciudad del viaje del TLP (misma patente y fecha). Las rutas sin viaje TLP, sin
 * clientes visitados o sin manejo planificado quedan afuera.
 */
export async function tiempoPdvPorCiudad(
  supabase: Supabase,
  viajes: ViajeTlp[],
  desde: string,
  hasta: string,
): Promise<TiempoPdvResultado> {
  const rutas: RutaFoxtrot[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("foxtrot_routes")
      .select("fecha, driver_name, raw_data")
      .in("dc_id", foxtrotDcIds())
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as RutaFoxtrot[]
    rutas.push(...rows)
    if (rows.length < PAGE) break
  }

  const patentes = await patentesPorChoferFecha(supabase, desde, hasta)

  // Viaje del TLP por patente|fecha: de ahí salen la ciudad y el tiempo en ruta.
  const viajePorClave = new Map<string, ViajeTlp>()
  for (const v of viajes) viajePorClave.set(`${normPatente(v.patente)}|${v.fecha}`, v)

  type Acum = { minPdv: number; clientes: number; rutas: number }
  const nuevo = (): Acum => ({ minPdv: 0, clientes: 0, rutas: 0 })
  const porCiudad = new Map<string, Acum>()
  const porMes = new Map<number, Acum>()
  const total = nuevo()
  let rutasSinCiudad = 0

  for (const r of rutas) {
    const rd = r.raw_data ?? {}
    const clientes = num(rd.tml_visited_customers)
    const manejoSec = num(rd.fx_planned_driving_sec)
    if (!r.driver_name || clientes == null || clientes <= 0 || manejoSec == null) continue

    const patente = patentes.get(`${r.fecha}|${normChofer(r.driver_name)}`)
    const viaje = patente ? viajePorClave.get(`${normPatente(patente)}|${r.fecha}`) : undefined
    if (!viaje) {
      rutasSinCiudad++
      continue
    }

    const stemsSec = (num(rd.fx_stem_start_sec) ?? 0) + (num(rd.fx_stem_end_sec) ?? 0)
    const minPdv = viaje.horasRuta * 60 - (manejoSec + stemsSec) / 60
    // Si el manejo planificado se come todo el tiempo en ruta, el despeje no
    // dice nada (ruta cortísima, o planificación desalineada): se descarta.
    if (minPdv <= 0) continue

    const mes = Number(r.fecha.slice(5, 7))
    const a = porCiudad.get(viaje.ciudad) ?? nuevo()
    const m = porMes.get(mes) ?? nuevo()
    for (const acc of [a, m, total]) {
      acc.minPdv += minPdv
      acc.clientes += clientes
      acc.rutas += 1
    }
    porCiudad.set(viaje.ciudad, a)
    porMes.set(mes, m)
  }

  const cerrar = (a: Acum): TiempoPdvCiudad => ({
    minPorPdv: Math.round((a.minPdv / a.clientes) * 10) / 10,
    clientes: a.clientes,
    rutas: a.rutas,
    clientesPorRuta: Math.round((a.clientes / a.rutas) * 10) / 10,
  })

  const out = new Map<string, TiempoPdvCiudad>()
  for (const [ciudad, a] of porCiudad) if (a.clientes > 0) out.set(ciudad, cerrar(a))

  const meses = new Map<number, TiempoPdvCiudad>()
  for (const [mes, a] of [...porMes].sort((x, y) => x[0] - y[0])) {
    if (a.clientes > 0) meses.set(mes, cerrar(a))
  }

  return {
    porCiudad: out,
    porMes: meses,
    total: total.clientes > 0 ? cerrar(total) : null,
    rutasSinCiudad,
  }
}
