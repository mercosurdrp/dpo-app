import type { SupabaseClient } from "@supabase/supabase-js"
import { cargaGescomPorViaje } from "@/lib/gescom/carga-viaje"

// CEq de GESCOM (Gestión, sede 2) imputadas al viaje del TLP.
//
// 🚨 El TLP se calculaba SOLO con Chess y por eso daba bajo: las "CEq
// distribuidas" del cuadro de Indicadores son **Chess + Gestión** (RPC
// `cuadro_ceq_mensual` sobre `ventas_diarias_sku`). En mayo 2026:
// Chess 65.381 + Gestión 27.707 = 93.087 — el TLP tiene que usar ese total.
//
// La resolución código→patente y la suma por viaje viven en
// `lib/gescom/carga-viaje.ts`, compartidas con la Ocupación de Bodega (que
// arrastró este mismo bug hasta agosto 2026 por tener su copia sin el fix).

/** CEq de Gestión por viaje: clave `PATENTE|fecha`. */
export async function ceqGescomPorViaje(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<Map<string, number>> {
  const carga = await cargaGescomPorViaje(supabase, desde, hasta)
  const out = new Map<string, number>()
  for (const [key, c] of carga) {
    if (c.ceq > 0) out.set(key, c.ceq)
  }
  return out
}
