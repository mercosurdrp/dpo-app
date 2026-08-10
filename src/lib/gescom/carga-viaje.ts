import type { SupabaseClient } from "@supabase/supabase-js"
import {
  loadChecklistDominios,
  loadChoferesGescom,
  patenteDeChofer,
} from "./patente-chofer"

// Carga de GESCOM (Gestión, sede 2) imputada al viaje (patente + fecha).
//
// Fuente: `ventas_diarias_camion_sku` (origen='gestion'), que guarda el camión
// como `GESTION-<codigoChofer>` porque GESCOM no expone patente. El puente al
// viaje es `patenteDeChofer` (checklist del día → fallback `patente_default`),
// el mismo criterio que usa el sync de rechazos de Gestión.
//
// Consumidores: el TLP (`lib/tlp/ceq-gescom.ts`) y la Ocupación de Bodega
// (`lib/sync/ocupacion-bodega.ts`). El TLP ya sumaba Gestión desde junio 2026;
// la OB arrastró el mismo bug (solo Chess) hasta agosto — por eso esta lógica
// vive acá y NO se duplica por indicador.
//
// Los choferes marcados `venta_directa` (mayoreo, no reparto) quedan afuera —
// igual que en el indicador de rechazos.

const PAGE = 1000
const PREFIJO = "GESTION-"

export interface CargaGescomViaje {
  /** CEq = bultos × (120 / bultos_pallet). Solo SKUs con factor conocido. */
  ceq: number
  bultos: number
  hl: number
}

/** Carga de Gestión por viaje: clave `PATENTE|fecha`. */
export async function cargaGescomPorViaje(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<Map<string, CargaGescomViaje>> {
  const [factores, choferes, checklists] = await Promise.all([
    ceqFactores(supabase),
    loadChoferesGescom(supabase),
    loadChecklistDominios(supabase, desde, hasta),
  ])

  const out = new Map<string, CargaGescomViaje>()

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ventas_diarias_camion_sku")
      .select("fecha, ds_fletero_carga, id_articulo, bultos, hl")
      .eq("origen", "gestion")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("id")
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as {
      fecha: string
      ds_fletero_carga: string | null
      id_articulo: number
      bultos: number
      hl: number | null
    }[]

    for (const r of rows) {
      const fletero = (r.ds_fletero_carga ?? "").trim().toUpperCase()
      if (!fletero.startsWith(PREFIJO)) continue
      const codigo = fletero.slice(PREFIJO.length)

      const chofer = choferes.get(codigo)
      if (!chofer || chofer.ventaDirecta) continue // mayoreo / venta directa: no es reparto

      const bultos = Math.abs(Number(r.bultos) || 0)
      if (bultos === 0) continue

      const patente = patenteDeChofer(codigo, r.fecha, choferes, checklists)
      if (!patente) continue

      const key = `${patente}|${r.fecha}`
      const slot = out.get(key) ?? { ceq: 0, bultos: 0, hl: 0 }
      const factor = factores.get(Number(r.id_articulo))
      if (factor) slot.ceq += bultos * factor
      slot.bultos += bultos
      slot.hl += Math.abs(Number(r.hl) || 0)
      out.set(key, slot)
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
      .order("id_articulo")
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { id_articulo: number; ceq_factor: number }[]
    for (const r of rows) out.set(Number(r.id_articulo), Number(r.ceq_factor))
    if (rows.length < PAGE) break
  }
  return out
}
