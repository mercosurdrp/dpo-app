import type { createClient } from "@/lib/supabase/server"

// Núcleo del cálculo del TLP (Transport Labor Productivity), compartido entre
// la página /indicadores/tlp y el Árbol del Sueño.
//
// TLP = CEq entregadas ÷ horas-hombre (horas en ruta × FTE del camión).
// Viaje = patente + fecha, imputado a su ciudad PREDOMINANTE (más CEq).
//
// Todas las lecturas paginan de a 1000 filas: PostgREST trunca en 1000 y un
// rango anual (Sueño YTD) supera ese límite con comodidad.

export const FTE_FALLBACK = 2

const PAGE = 1000

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface ViajeTlp {
  patente: string
  fecha: string
  ciudad: string // predominante
  ceq: number
  horasRuta: number
  fte: number
  fteFallback: boolean
}

export interface ViajesTlpResultado {
  viajes: ViajeTlp[]
  /** Viajes con CEq pero sin checklist de retorno (excluidos, sin denominador). */
  viajesSinTiempo: number
  /** Total de viajes con CEq (incluidos + excluidos). */
  viajesConCeq: number
}

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/** Carga el mapeo localidad → ciudad. Localidades sin match → "Otras". */
export async function mapaCiudades(supabase: Supabase): Promise<Map<string, string>> {
  const { data } = await supabase.from("dim_localidad_ciudad").select("localidad, ciudad")
  const m = new Map<string, string>()
  for (const r of (data ?? []) as { localidad: string; ciudad: string }[]) {
    m.set(r.localidad.trim().toUpperCase(), r.ciudad)
  }
  return m
}

export function normPatente(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase()
}

export function fteDeAyudantes(ayudante1: string | null, ayudante2: string | null): number {
  return (
    1 +
    ((ayudante1 ?? "").trim() !== "" ? 1 : 0) +
    ((ayudante2 ?? "").trim() !== "" ? 1 : 0)
  )
}

/**
 * Resuelve los viajes del rango con su CEq, ciudad predominante, horas en
 * ruta (checklist retorno) y FTE (registro de egreso; fallback 2).
 */
export async function fetchViajesTlp(
  supabase: Supabase,
  desde: string,
  hasta: string,
): Promise<ViajesTlpResultado> {
  const [locRows, retRows, egrRows, ciudades] = await Promise.all([
    fetchAll<{ patente: string; fecha: string; localidad: string; ceq_total: number }>(
      (from, to) =>
        supabase
          .from("ocupacion_bodega_localidad_diaria")
          .select("patente, fecha, localidad, ceq_total")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha")
          .range(from, to),
    ),
    fetchAll<{ dominio: string; fecha: string; tiempo_ruta_minutos: number }>(
      (from, to) =>
        supabase
          .from("checklist_vehiculos")
          .select("dominio, fecha, tiempo_ruta_minutos")
          .eq("tipo", "retorno")
          .not("tiempo_ruta_minutos", "is", null)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha")
          .range(from, to),
    ),
    fetchAll<{ dominio: string; fecha: string; ayudante1: string | null; ayudante2: string | null }>(
      (from, to) =>
        supabase
          .from("registros_vehiculos")
          .select("dominio, fecha, ayudante1, ayudante2")
          .eq("tipo", "egreso")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha")
          .range(from, to),
    ),
    mapaCiudades(supabase),
  ])

  // Viaje = patente|fecha. CEq total + CEq por ciudad.
  const acum = new Map<string, { ceqTotal: number; porCiudad: Map<string, number> }>()
  for (const r of locRows) {
    const ceq = Number(r.ceq_total) || 0
    if (ceq <= 0) continue
    const key = `${normPatente(r.patente)}|${r.fecha}`
    const ciudad = ciudades.get((r.localidad ?? "").trim().toUpperCase()) ?? "Otras"
    const v = acum.get(key) ?? { ceqTotal: 0, porCiudad: new Map<string, number>() }
    v.ceqTotal += ceq
    v.porCiudad.set(ciudad, (v.porCiudad.get(ciudad) ?? 0) + ceq)
    acum.set(key, v)
  }

  // Tiempo en ruta (minutos) por viaje — el mayor del día si hubiera varios.
  const tiempo = new Map<string, number>()
  for (const r of retRows) {
    const key = `${normPatente(r.dominio)}|${r.fecha}`
    const min = Number(r.tiempo_ruta_minutos) || 0
    if (min <= 0) continue
    tiempo.set(key, Math.max(tiempo.get(key) ?? 0, min))
  }

  // FTE por viaje — el mayor del día si hubiera varios egresos.
  const fte = new Map<string, number>()
  for (const r of egrRows) {
    const key = `${normPatente(r.dominio)}|${r.fecha}`
    fte.set(key, Math.max(fte.get(key) ?? 0, fteDeAyudantes(r.ayudante1, r.ayudante2)))
  }

  const viajes: ViajeTlp[] = []
  let viajesSinTiempo = 0
  for (const [key, v] of acum) {
    const [patente, fecha] = key.split("|")
    const min = tiempo.get(key)
    if (!min) {
      viajesSinTiempo++
      continue // sin tiempo en ruta no hay denominador
    }
    let ciudadPred = "Otras"
    let maxCeq = -1
    for (const [c, ceq] of v.porCiudad) {
      if (ceq > maxCeq) {
        maxCeq = ceq
        ciudadPred = c
      }
    }
    const fteReal = fte.get(key)
    viajes.push({
      patente,
      fecha,
      ciudad: ciudadPred,
      ceq: v.ceqTotal,
      horasRuta: min / 60,
      fte: fteReal ?? FTE_FALLBACK,
      fteFallback: fteReal == null,
    })
  }

  return { viajes, viajesSinTiempo, viajesConCeq: acum.size }
}

export interface TlpMensual {
  mes: number // 1..12
  tlp: number
  viajes: number
}

/**
 * TLP anual para el Árbol del Sueño: YTD (CEq acumuladas ÷ horas-hombre
 * acumuladas del año) + apertura mensual. Devuelve null si no hay viajes.
 */
export async function tlpAnual(
  supabase: Supabase,
  anio: number,
): Promise<{ ytd: number; meses: TlpMensual[] } | null> {
  const hoy = new Date().toISOString().slice(0, 10)
  const hasta = hoy < `${anio}-12-31` ? hoy : `${anio}-12-31`
  const { viajes } = await fetchViajesTlp(supabase, `${anio}-01-01`, hasta)
  if (viajes.length === 0) return null

  let ceq = 0
  let hh = 0
  const porMes = new Map<number, { ceq: number; hh: number; viajes: number }>()
  for (const v of viajes) {
    const horasHombre = v.horasRuta * v.fte
    ceq += v.ceq
    hh += horasHombre
    const mes = Number(v.fecha.slice(5, 7))
    const m = porMes.get(mes) ?? { ceq: 0, hh: 0, viajes: 0 }
    m.ceq += v.ceq
    m.hh += horasHombre
    m.viajes += 1
    porMes.set(mes, m)
  }
  if (hh <= 0) return null

  const meses: TlpMensual[] = [...porMes.entries()]
    .filter(([, m]) => m.hh > 0)
    .map(([mes, m]) => ({
      mes,
      tlp: Math.round((m.ceq / m.hh) * 100) / 100,
      viajes: m.viajes,
    }))
    .sort((a, b) => a.mes - b.mes)

  return { ytd: Math.round((ceq / hh) * 100) / 100, meses }
}
