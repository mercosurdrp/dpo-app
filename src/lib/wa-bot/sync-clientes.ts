/**
 * Sync de `bot_clientes_cache` desde Chess.
 *
 * Estrategia:
 *   rutasVenta → Map<idRuta, idPersonal>
 *   clientes   → para cada uno, pickear eClifuerza[primer no anulado].idRuta
 *                → idPersonal = id_promotor
 *
 * Hace upsert (PK = id_cliente). NO trunca para sobrevivir caídas parciales.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  fetchAllClientes,
  fetchRutasVenta,
  type ChessCliente,
  type ChessCredentials,
} from "./chess"

export interface SyncClientesResult {
  clientes_chess: number
  upserted: number
  con_promotor: number
  sin_promotor: number
  duration_ms: number
}

const BATCH_SIZE = 500

export async function syncClientesCache(
  supabase: SupabaseClient,
  creds: ChessCredentials,
  sessionId: string,
  empresa: "pampeana" | "misiones" = "pampeana",
): Promise<SyncClientesResult> {
  const t0 = Date.now()

  const [clientes, rutas] = await Promise.all([
    fetchAllClientes(creds, sessionId),
    fetchRutasVenta(creds, sessionId),
  ])

  const rutaToPromotor = new Map<number, number>()
  for (const r of rutas) rutaToPromotor.set(r.idRuta, r.idPersonal)

  let conPromotor = 0, sinPromotor = 0
  const rows = clientes.map((c) => {
    const idPromotor = pickPromotor(c, rutaToPromotor)
    if (idPromotor != null) conPromotor++; else sinPromotor++

    const nombre = c.eClialias?.find((a) => a.anulado !== "true")?.razonSocial
      ?? c.eClialias?.[0]?.razonSocial
      ?? null

    return {
      id_cliente: String(c.idCliente),
      id_promotor: idPromotor != null ? String(idPromotor) : null,
      nombre_cliente: nombre,
      telefono: c.telefono ?? null,
      localidad: c.desLocalidad ?? null,
      empresa,
      synced_at: new Date().toISOString(),
    }
  })

  // Upsert por chunks
  let upserted = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from("bot_clientes_cache")
      .upsert(chunk, { onConflict: "id_cliente" })
    if (error) throw new Error(`upsert bot_clientes_cache: ${error.message}`)
    upserted += chunk.length
  }

  return {
    clientes_chess: clientes.length,
    upserted,
    con_promotor: conPromotor,
    sin_promotor: sinPromotor,
    duration_ms: Date.now() - t0,
  }
}

function pickPromotor(c: ChessCliente, rutaToPromotor: Map<number, number>): number | null {
  const fuerzas = c.eClifuerza ?? []
  // Prefiero el primer registro no anulado; si todos están anulados, uso el primero.
  const candidata = fuerzas.find((f) => f.anulado !== "true") ?? fuerzas[0]
  if (!candidata) return null
  return rutaToPromotor.get(candidata.idRuta) ?? null
}
