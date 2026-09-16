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
// El PESO llegó tarde (septiembre 2026): la partición en `*_chess` / `*_gescom`
// de agosto se olvidó de los kg, así que el 17% de bultos que reparte Gestión
// pesaba 0 y la columna "Peso (kg)" del detalle de la matinal mostraba camiones
// livianísimos. Se calcula igual que el CEq, con `chess_articulos.peso_bulto`.
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
  /** kg = bultos × peso_bulto. Solo SKUs con peso conocido. */
  peso: number
}

/** Carga de Gestión por viaje: clave `PATENTE|fecha`. */
export async function cargaGescomPorViaje(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<Map<string, CargaGescomViaje>> {
  const [factores, choferes, checklists] = await Promise.all([
    factoresArticulo(supabase),
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
      .order("fecha", { ascending: true })
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
      const slot = out.get(key) ?? { ceq: 0, bultos: 0, hl: 0, peso: 0 }
      const art = factores.get(Number(r.id_articulo))
      if (art?.ceq) slot.ceq += bultos * art.ceq
      if (art?.pesoBulto) slot.peso += bultos * art.pesoBulto
      slot.bultos += bultos
      slot.hl += Math.abs(Number(r.hl) || 0)
      out.set(key, slot)
    }

    if (rows.length < PAGE) break
  }

  return out
}

/**
 * Maestro por artículo: `ceq_factor` (= 120 / bultos_pallet) y `peso_bulto` (kg).
 * Se traen juntos porque es el mismo barrido de `chess_articulos`; un artículo
 * puede tener uno y no el otro, así que el filtro pide cualquiera de los dos.
 */
async function factoresArticulo(
  supabase: SupabaseClient,
): Promise<Map<number, { ceq: number | null; pesoBulto: number | null }>> {
  const out = new Map<number, { ceq: number | null; pesoBulto: number | null }>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("chess_articulos")
      .select("id_articulo, ceq_factor, peso_bulto")
      .or("ceq_factor.not.is.null,peso_bulto.not.is.null")
      .order("id_articulo")
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as {
      id_articulo: number
      ceq_factor: number | null
      peso_bulto: number | null
    }[]
    for (const r of rows) {
      const ceq = Number(r.ceq_factor)
      const peso = Number(r.peso_bulto)
      out.set(Number(r.id_articulo), {
        ceq: r.ceq_factor != null && ceq > 0 ? ceq : null,
        pesoBulto: r.peso_bulto != null && peso > 0 ? peso : null,
      })
    }
    if (rows.length < PAGE) break
  }
  return out
}
