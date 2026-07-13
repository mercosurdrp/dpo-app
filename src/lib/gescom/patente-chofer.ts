import type { SupabaseClient } from "@supabase/supabase-js"

// Patente del chofer de GESCOM (Gestión) para una fecha.
//
// GESCOM no expone patente por ningún endpoint (auditado 2026-06-12): identifica
// el reparto por `codigoChofer`. El puente es `mapeo_chofer_gescom`
// (codigo → nombre + patente_default + venta_directa) más el checklist del día.
//
// Extraído de `lib/sync/gescom-rechazos-sync.ts` para compartirlo con el TLP,
// que necesita imputar las CEq de Gestión al viaje (patente + fecha).

export interface ChoferGescom {
  nombre: string
  patenteDefault: string | null
  /** Venta directa / mayoreo: NO es reparto, se excluye de los indicadores. */
  ventaDirecta: boolean
}

export function normTexto(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim()
}

/** Mismo largo y a lo sumo 1 carácter distinto (typos de carga tipo AF908DF vs AE908DF). */
function casiIguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dif++
  return dif <= 1
}

/** `mapeo_chofer_gescom` activo: codigo → nombre + patente_default + venta_directa. */
export async function loadChoferesGescom(
  supabase: SupabaseClient,
): Promise<Map<string, ChoferGescom>> {
  const out = new Map<string, ChoferGescom>()
  const { data, error } = await supabase
    .from("mapeo_chofer_gescom")
    .select("codigo, nombre, patente_default, venta_directa")
    .eq("activo", true)
  if (error) return out
  for (const r of (data ?? []) as Array<{
    codigo: string
    nombre: string
    patente_default: string | null
    venta_directa: boolean | null
  }>) {
    out.set(r.codigo.trim(), {
      nombre: r.nombre,
      patenteDefault: r.patente_default?.trim().toUpperCase() ?? null,
      ventaDirecta: r.venta_directa === true,
    })
  }
  return out
}

/** Checklists del rango → `<fecha>|<chofer normalizado>` → dominio. */
export async function loadChecklistDominios(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("checklist_vehiculos")
      .select("fecha, dominio, chofer")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .range(from, from + PAGE - 1)
    if (error) break
    const rows = (data ?? []) as { fecha: string; dominio: string | null; chofer: string | null }[]
    for (const r of rows) {
      if (!r.dominio || !r.chofer) continue
      out.set(`${r.fecha}|${normTexto(r.chofer)}`, r.dominio.trim().toUpperCase())
    }
    if (rows.length < PAGE) break
  }
  return out
}

/**
 * Patente del chofer GESCOM para una fecha: checklist del día (match por nombre,
 * tolera sufijos tipo "FRIAS ANGEL ERMINDO") → fallback `patente_default`.
 * Si el dominio del checklist difiere en 1 carácter del default, gana el default
 * (forma canónica Chess; los checklists tienen typos persistentes).
 */
export function patenteDeChofer(
  codigo: string,
  fecha: string,
  choferes: Map<string, ChoferGescom>,
  checklists: Map<string, string>,
): string | null {
  const ch = choferes.get(codigo)
  if (!ch) return null
  const nombreNorm = normTexto(ch.nombre)
  let delDia: string | null = checklists.get(`${fecha}|${nombreNorm}`) ?? null
  if (!delDia) {
    for (const [key, dominio] of checklists) {
      const [f, nombre] = key.split("|")
      if (f === fecha && (nombre.startsWith(nombreNorm) || nombreNorm.startsWith(nombre))) {
        delDia = dominio
        break
      }
    }
  }
  if (delDia && ch.patenteDefault && casiIguales(delDia, ch.patenteDefault)) return ch.patenteDefault
  return delDia ?? ch.patenteDefault
}
