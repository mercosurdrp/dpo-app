import type { SupabaseClient } from "@supabase/supabase-js"
import {
  loadChecklistDominios,
  loadChoferesGescom,
  patenteDeChofer,
} from "@/lib/gescom/patente-chofer"

// CEq de GESCOM (Gestión, sede 2) imputadas al viaje del TLP.
//
// 🚨 El TLP se calculaba SOLO con Chess y por eso daba bajo: las "CEq
// distribuidas" del cuadro de Indicadores son **Chess + Gestión** (RPC
// `cuadro_ceq_mensual` sobre `ventas_diarias_sku`). En mayo 2026:
// Chess 65.381 + Gestión 27.707 = 93.087 — el TLP tiene que usar ese total.
//
// Fuente: `ventas_diarias_camion_sku` (origen='gestion'), que guarda el camión
// como `GESTION-<codigoChofer>` porque GESCOM no expone patente. El puente al
// viaje (patente + fecha) es `patenteDeChofer` (checklist del día → fallback
// `patente_default`), el mismo criterio que usa el sync de rechazos de Gestión.
//
// Los choferes marcados `venta_directa` (mayoreo / venta directa, no reparto)
// quedan afuera — igual que en el indicador de rechazos.

const PAGE = 1000
const PREFIJO = "GESTION-"

/** CEq de Gestión por viaje: clave `PATENTE|fecha`. */
export async function ceqGescomPorViaje(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<Map<string, number>> {
  const [factores, choferes, checklists] = await Promise.all([
    ceqFactores(supabase),
    loadChoferesGescom(supabase),
    loadChecklistDominios(supabase, desde, hasta),
  ])

  const out = new Map<string, number>()

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ventas_diarias_camion_sku")
      .select("fecha, ds_fletero_carga, id_articulo, bultos")
      .eq("origen", "gestion")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as {
      fecha: string
      ds_fletero_carga: string | null
      id_articulo: number
      bultos: number
    }[]

    for (const r of rows) {
      const fletero = (r.ds_fletero_carga ?? "").trim().toUpperCase()
      if (!fletero.startsWith(PREFIJO)) continue
      const codigo = fletero.slice(PREFIJO.length)

      const chofer = choferes.get(codigo)
      if (!chofer || chofer.ventaDirecta) continue // mayoreo / venta directa: no es reparto

      const factor = factores.get(Number(r.id_articulo))
      const bultos = Math.abs(Number(r.bultos) || 0)
      if (!factor || bultos === 0) continue

      const patente = patenteDeChofer(codigo, r.fecha, choferes, checklists)
      if (!patente) continue

      const key = `${patente}|${r.fecha}`
      out.set(key, (out.get(key) ?? 0) + bultos * factor)
    }

    if (rows.length < PAGE) break
  }

  return out
}

/** `chess_articulos.ceq_factor` (= 120 / bultos_pallet) por artículo. */
async function ceqFactores(supabase: SupabaseClient): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("chess_articulos")
      .select("id_articulo, ceq_factor")
      .not("ceq_factor", "is", null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { id_articulo: number; ceq_factor: number }[]
    for (const r of rows) out.set(Number(r.id_articulo), Number(r.ceq_factor))
    if (rows.length < PAGE) break
  }
  return out
}
