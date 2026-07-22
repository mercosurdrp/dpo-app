"use server"

import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"

/**
 * KPI físico de las iniciativas de ahorro de combustible: km recorridos por
 * litro cargado, mes a mes, para el grupo de camiones al que apunta la
 * iniciativa.
 *
 * Es el equivalente de `presupuesto-perdidas-kpi` pero para flota: mismo
 * contrato (Record indexado + serie mensual + acumulado) para que la tarjeta
 * de la iniciativa lo dibuje con el mismo bloque de gráfico.
 *
 * 🚨 El rendimiento se calcula como razón de sumas (Σkm / Σlitros del mes), NO
 * como promedio de los rendimientos de cada carga: una carga corta con el
 * tanque a medio llenar pesaría igual que un viaje largo y distorsiona.
 *
 * 🚨 Se descartan las cargas con rendimiento fuera de [2, 6] km/l. En estos
 * camiones no son valores posibles: son cargas con el odómetro salteado (falta
 * registrar la carga anterior, da 10 km/l), cargas duplicadas el mismo día o
 * cargas a tanque no lleno (dan 0,06 km/l). Es el mismo criterio con el que se
 * calculó la línea base cargada en el seguimiento Q2-2026 de la iniciativa.
 */

type Result<T> = { data: T } | { error: string }

/** Dominios que mide cada iniciativa, por nombre de su KPI (en mayúsculas). */
const DOMINIOS_POR_KPI: Record<string, string[]> = {
  "RENDIMIENTO COMBUSTIBLE LARGA DISTANCIA": [
    "AE908DH",
    "AE591EI",
    "OJA403",
    "AF664NY",
  ],
}

/**
 * Subconjunto que YA tiene la mejora instalada, para poder separarlo del resto
 * y usar los camiones sin intervenir como grupo de control. Si la lista está
 * vacía (o es igual al grupo), la tarjeta dibuja una sola serie.
 */
const DOMINIOS_INTERVENIDOS_POR_KPI: Record<string, string[]> = {
  // Limitadores colocados el 06-jul-2026 sólo en estos dos (ver seguimiento Q3).
  "RENDIMIENTO COMBUSTIBLE LARGA DISTANCIA": ["OJA403", "AE591EI"],
}

/** Rango de rendimiento plausible para un camión de reparto/larga distancia. */
const REND_MIN = 2
const REND_MAX = 6

export interface KpiCombustibleMes {
  mes: number
  /** km/l del grupo completo. null si el mes no tuvo cargas válidas. */
  real: number | null
  /** km/l de los camiones ya intervenidos. null si no hay dato ese mes. */
  intervenidos: number | null
  /** km/l de los camiones sin intervenir (grupo de control). */
  control: number | null
  km: number
  litros: number
  cargas: number
}

export interface KpiCombustible {
  meses: KpiCombustibleMes[]
  /** Acumulado del año: razón de sumas, no promedio de los meses. */
  realAcum: number | null
  intervenidosAcum: number | null
  controlAcum: number | null
  dominios: string[]
  dominiosIntervenidos: string[]
  /** Cargas descartadas por rendimiento implausible (para auditar el dato). */
  cargasDescartadas: number
}

interface FilaCarga {
  fecha: string
  dominio: string
  km_recorridos: number | null
  litros: number | null
  rendimiento: number | null
}

function ratio(km: number, litros: number): number | null {
  if (litros <= 0) return null
  return Math.round((km / litros) * 100) / 100
}

export async function getKpiCombustible(
  anio: number,
): Promise<Result<Record<string, KpiCombustible>>> {
  await requireAuth()

  const kpis = Object.keys(DOMINIOS_POR_KPI)
  const todosLosDominios = [
    ...new Set(Object.values(DOMINIOS_POR_KPI).flat()),
  ]
  if (todosLosDominios.length === 0) return { data: {} }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("registro_combustible")
    .select("fecha, dominio, km_recorridos, litros, rendimiento")
    .in("dominio", todosLosDominios)
    .gte("fecha", `${anio}-01-01`)
    .lte("fecha", `${anio}-12-31`)
    .order("fecha", { ascending: true })

  if (error) {
    return { error: `No se pudo leer el registro de combustible: ${error.message}` }
  }

  const filas = (data ?? []) as FilaCarga[]
  const out: Record<string, KpiCombustible> = {}

  for (const kpi of kpis) {
    const dominios = DOMINIOS_POR_KPI[kpi]
    const intervenidos = DOMINIOS_INTERVENIDOS_POR_KPI[kpi] ?? []
    const delGrupo = filas.filter((f) => dominios.includes(f.dominio))

    // Acumuladores por mes (1-12) y por sub-grupo.
    const acum = new Map<
      number,
      {
        km: number
        litros: number
        cargas: number
        kmInt: number
        litrosInt: number
        kmCtl: number
        litrosCtl: number
      }
    >()
    let cargasDescartadas = 0

    for (const f of delGrupo) {
      const km = f.km_recorridos
      const litros = f.litros
      const rend = f.rendimiento
      // Sin delta de odómetro o sin litros no hay rendimiento que calcular.
      if (km === null || litros === null || litros <= 0) continue
      if (rend === null || rend < REND_MIN || rend > REND_MAX) {
        cargasDescartadas++
        continue
      }

      const mes = Number(f.fecha.slice(5, 7))
      if (!Number.isFinite(mes) || mes < 1 || mes > 12) continue

      const a =
        acum.get(mes) ??
        {
          km: 0,
          litros: 0,
          cargas: 0,
          kmInt: 0,
          litrosInt: 0,
          kmCtl: 0,
          litrosCtl: 0,
        }
      a.km += km
      a.litros += litros
      a.cargas++
      if (intervenidos.includes(f.dominio)) {
        a.kmInt += km
        a.litrosInt += litros
      } else {
        a.kmCtl += km
        a.litrosCtl += litros
      }
      acum.set(mes, a)
    }

    if (acum.size === 0) continue

    const meses: KpiCombustibleMes[] = [...acum.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([mes, a]) => ({
        mes,
        real: ratio(a.km, a.litros),
        intervenidos: ratio(a.kmInt, a.litrosInt),
        control: ratio(a.kmCtl, a.litrosCtl),
        km: a.km,
        litros: Math.round(a.litros),
        cargas: a.cargas,
      }))

    const tot = [...acum.values()].reduce(
      (s, a) => ({
        km: s.km + a.km,
        litros: s.litros + a.litros,
        kmInt: s.kmInt + a.kmInt,
        litrosInt: s.litrosInt + a.litrosInt,
        kmCtl: s.kmCtl + a.kmCtl,
        litrosCtl: s.litrosCtl + a.litrosCtl,
      }),
      { km: 0, litros: 0, kmInt: 0, litrosInt: 0, kmCtl: 0, litrosCtl: 0 },
    )

    out[kpi] = {
      meses,
      realAcum: ratio(tot.km, tot.litros),
      intervenidosAcum: ratio(tot.kmInt, tot.litrosInt),
      controlAcum: ratio(tot.kmCtl, tot.litrosCtl),
      dominios,
      dominiosIntervenidos: intervenidos,
      cargasDescartadas,
    }
  }

  return { data: out }
}
