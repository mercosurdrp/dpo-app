/**
 * Meta y gatillo de un nodo del Árbol del Sueño, para que otros tableros
 * (hoy la grilla de indicadores de reuniones) semaforicen contra el MISMO
 * target y no contra una copia que se desincroniza.
 *
 * Lee `sueno_kpi_valores` (meta/gatillo/mejor_si por kpi_key + año) con
 * fallback al `metaDefault` de la topología. Es la versión liviana de lo que
 * hace `getSuenoArbol`: una sola query, sin recalcular los valores vivos —
 * ahí está el costo, y para leer una meta no hace falta.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { ARBOL_SUENO, type MejorSi } from "./arbol-config"

export interface MetaSueno {
  meta: number | null
  gatillo: number | null
  mejorSi: MejorSi | undefined
}

export async function getMetaSueno(
  supabase: SupabaseClient,
  kpiKey: string,
  anio: number,
): Promise<MetaSueno> {
  const cfg = ARBOL_SUENO.find((n) => n.key === kpiKey)
  // Sin Árbol del Sueño (Misiones no tiene la tabla) el indicador queda SIN
  // meta, que es lo honesto: heredar el target de otra empresa sería peor,
  // sobre todo cuando el mismo KPI se calcula distinto en cada una.
  const sinArbol: MetaSueno = {
    meta: null,
    gatillo: null,
    mejorSi: cfg?.mejorSi,
  }
  // La topología sí sirve cuando el árbol existe pero al año le falta la fila.
  const sinFila: MetaSueno = {
    meta: cfg?.metaDefault ?? null,
    gatillo: null,
    mejorSi: cfg?.mejorSi,
  }
  try {
    const { data, error } = await supabase
      .from("sueno_kpi_valores")
      .select("meta, gatillo, mejor_si")
      .eq("kpi_key", kpiKey)
      .eq("anio", anio)
      .maybeSingle()
    if (error) return sinArbol
    if (!data) return sinFila
    const row = data as {
      meta: number | null
      gatillo: number | null
      mejor_si: string | null
    }
    return {
      // La meta cargada manda; si la fila existe pero sin meta, el default de
      // la topología evita que el indicador quede sin semáforo.
      meta: row.meta ?? sinFila.meta,
      gatillo: row.gatillo ?? null,
      mejorSi:
        row.mejor_si === "mayor" || row.mejor_si === "menor"
          ? row.mejor_si
          : cfg?.mejorSi,
    }
  } catch {
    return sinArbol
  }
}
