"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

export interface CombustibleCamion {
  dominio: string
  descripcion: string | null
  modelo: string | null
  cargas: number
  litros: number // suma de TODAS las cargas del mes
  km: number // suma de km_recorridos (solo cargas con medición)
  litros_con_km: number // litros de las cargas que tienen km (para el rendimiento)
  rendimiento: number | null // km / litros_con_km (km por litro)
  l_100km: number | null
  desvio_pct: number | null // % de rendimiento vs el promedio de la flota
}

export interface AnalisisCombustible {
  mes: string // "YYYY-MM"
  meses_disponibles: string[]
  total_cargas: number
  total_camiones: number
  total_litros: number
  total_km: number
  rendimiento_flota: number | null
  l_100km_flota: number | null
  camiones: CombustibleCamion[]
}

/** "YYYY-MM" del mes en curso en horario Argentina. */
function mesActualAR(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date())
  const y = p.find((x) => x.type === "year")!.value
  const m = p.find((x) => x.type === "month")!.value
  return `${y}-${m}`
}

/** Primer día del mes siguiente a "YYYY-MM" → "YYYY-MM-01". */
function primerDiaMesSiguiente(mes: string): string {
  const [y, m] = mes.split("-").map((s) => parseInt(s, 10))
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, "0")}-01`
}

function round(n: number, dec = 2): number {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

interface CargaRow {
  dominio: string | null
  litros: number | null
  km_recorridos: number | null
}

/**
 * Análisis de combustible del mes: consumo, km y rendimiento (km/l) por camión,
 * comparado contra el promedio de la flota. Pensado para detectar los camiones
 * de peor rendimiento y armar el plan de acción. Sin valorización ($).
 *
 * El rendimiento del mes se calcula como Σ km_recorridos / Σ litros de las
 * cargas que tienen medición de km (la 1ª carga de un vehículo no tiene km).
 */
export async function getAnalisisCombustible(
  mes?: string,
): Promise<{ data: AnalisisCombustible } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()

    const mesSel = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : mesActualAR()
    const desde = `${mesSel}-01`
    const hasta = primerDiaMesSiguiente(mesSel)

    const { data: cargas, error } = await supa
      .from("registro_combustible")
      .select("dominio, litros, km_recorridos")
      .gte("fecha", desde)
      .lt("fecha", hasta)
    if (error) return { error: error.message }

    // Meses con datos (para el selector)
    const { data: todas, error: mErr } = await supa
      .from("registro_combustible")
      .select("fecha")
    if (mErr) return { error: mErr.message }
    const meses_disponibles = [
      ...new Set((todas ?? []).map((t) => String(t.fecha).slice(0, 7))),
    ].sort().reverse()

    // Catálogo para enriquecer
    const { data: cat } = await supa
      .from("catalogo_vehiculos")
      .select("dominio, descripcion, modelo")
    const catMap = new Map<string, { descripcion: string | null; modelo: string | null }>()
    for (const c of cat ?? []) {
      catMap.set(c.dominio, { descripcion: c.descripcion ?? null, modelo: c.modelo ?? null })
    }

    // Agregación por dominio
    const agg = new Map<
      string,
      { cargas: number; litros: number; km: number; litros_con_km: number }
    >()
    for (const r of (cargas ?? []) as CargaRow[]) {
      if (!r.dominio) continue
      const a = agg.get(r.dominio) ?? { cargas: 0, litros: 0, km: 0, litros_con_km: 0 }
      const litros = Number(r.litros ?? 0)
      const km = Number(r.km_recorridos ?? 0)
      a.cargas += 1
      a.litros += litros
      if (km > 0) {
        a.km += km
        a.litros_con_km += litros
      }
      agg.set(r.dominio, a)
    }

    // Totales de flota (rendimiento ponderado por litros con medición)
    let totLitros = 0,
      totKm = 0,
      totLitrosConKm = 0,
      totCargas = 0
    for (const a of agg.values()) {
      totLitros += a.litros
      totKm += a.km
      totLitrosConKm += a.litros_con_km
      totCargas += a.cargas
    }
    const rendimiento_flota = totLitrosConKm > 0 ? round(totKm / totLitrosConKm) : null
    const l_100km_flota = totKm > 0 ? round((totLitrosConKm / totKm) * 100) : null

    const camiones: CombustibleCamion[] = [...agg.entries()].map(([dominio, a]) => {
      const rendimiento = a.litros_con_km > 0 ? round(a.km / a.litros_con_km) : null
      const l_100km = a.km > 0 ? round((a.litros_con_km / a.km) * 100) : null
      const desvio_pct =
        rendimiento != null && rendimiento_flota
          ? round(((rendimiento - rendimiento_flota) / rendimiento_flota) * 100, 1)
          : null
      const info = catMap.get(dominio)
      return {
        dominio,
        descripcion: info?.descripcion ?? null,
        modelo: info?.modelo ?? null,
        cargas: a.cargas,
        litros: round(a.litros, 0),
        km: a.km,
        litros_con_km: round(a.litros_con_km, 0),
        rendimiento,
        l_100km,
        desvio_pct,
      }
    })

    // Peor rendimiento primero (foco del plan de acción); sin dato al final
    camiones.sort((x, y) => {
      if (x.rendimiento == null) return 1
      if (y.rendimiento == null) return -1
      return x.rendimiento - y.rendimiento
    })

    return {
      data: {
        mes: mesSel,
        meses_disponibles: meses_disponibles.length ? meses_disponibles : [mesSel],
        total_cargas: totCargas,
        total_camiones: agg.size,
        total_litros: round(totLitros, 0),
        total_km: totKm,
        rendimiento_flota,
        l_100km_flota,
        camiones,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando análisis" }
  }
}
