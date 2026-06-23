/**
 * Resolución de PATENTE (dominio) para rutas de Foxtrot en Pampeana.
 *
 * Foxtrot Pampeana NO expone vehículo ni patente: las rutas se nombran por
 * número ("10", "26") y solo traen el chofer (driver_name). La patente real del
 * día se obtiene cruzando ese chofer con el egreso de TML (registros_vehiculos,
 * tipo='egreso') por fecha — mismo criterio fecha-aware del RMD→chofer. Los
 * nombres de chofer de Foxtrot coinciden con los de TML (ej "SANDOVAL ANTONIO").
 */
import type { SupabaseClient } from "@supabase/supabase-js"

// Marcas diacríticas combinantes (para sacar acentos tras normalize NFD).
const COMBINING_MARKS = /[̀-ͯ]/g

/** Normaliza un nombre de chofer para matchear Foxtrot ↔ TML (sin acentos, mayúsculas, espacios colapsados). */
export function normChofer(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Mapa `${fecha}|${choferNorm}` → patente (dominio), tomado del egreso TML del
 * día. Si un chofer tiene más de un egreso en el día, se queda con el primero.
 */
export async function patentesPorChoferFecha(
  supabase: SupabaseClient,
  fechaDesde: string,
  fechaHasta: string,
): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  const { data } = await supabase
    .from("registros_vehiculos")
    .select("fecha, dominio, chofer")
    .eq("tipo", "egreso")
    .gte("fecha", fechaDesde)
    .lte("fecha", fechaHasta)
  for (const r of (data ?? []) as {
    fecha: string
    dominio: string | null
    chofer: string | null
  }[]) {
    if (!r.dominio || !r.chofer) continue
    const k = `${r.fecha}|${normChofer(r.chofer)}`
    if (!m.has(k)) m.set(k, r.dominio)
  }
  return m
}
