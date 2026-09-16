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
 *
 * Si el dominio del checklist difiere en 1 carácter del default, gana el default
 * (forma canónica Chess; los checklists tienen typos persistentes) — PERO sólo
 * cuando ese dominio no es un camión real.
 *
 * `patentesValidas` son los dominios activos de `catalogo_vehiculos`. Sin ese
 * freno, la heurística de typos se comía los cambios legítimos de unidad: la
 * flota tiene tres camiones que difieren en una sola letra —AE908DF (Accelo),
 * AE908DG y AE908DH (los dos Atego)— y son justo las patentes por defecto de
 * RIVERO FEDERICO, RIVERO EZEQUIEL y SANDOVAL. Cuando uno de ellos se subía a
 * otra unidad, el checklist decía la patente correcta y esta función la
 * revertía a la default, así que las ventas y los rechazos de ese día se le
 * imputaban a la persona equivocada (16/09/2026: 1.201 bultos mal asignados,
 * 605 de ellos de un solo ayudante).
 *
 * El checklist del día es evidencia de qué camión manejó esa persona; la
 * `patente_default` es apenas una suposición. Ante un dominio que existe y está
 * activo en el catálogo, gana la evidencia.
 */
export function patenteDeChofer(
  codigo: string,
  fecha: string,
  choferes: Map<string, ChoferGescom>,
  checklists: Map<string, string>,
  patentesValidas?: Set<string>,
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
  if (
    delDia &&
    ch.patenteDefault &&
    !patentesValidas?.has(delDia) &&
    casiIguales(delDia, ch.patenteDefault)
  ) {
    return ch.patenteDefault
  }
  return delDia ?? ch.patenteDefault
}

/** Dominios activos de `catalogo_vehiculos`, para distinguir un typo de un camión real. */
export async function loadPatentesValidas(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from("catalogo_vehiculos")
    .select("dominio")
    .eq("active", true)
  return new Set(
    ((data ?? []) as { dominio: string | null }[])
      .map((v) => normTexto(v.dominio ?? ""))
      .filter(Boolean),
  )
}
