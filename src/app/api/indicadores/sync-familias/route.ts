// Vuelca la clasificación de producto (uneg/segmento) desde el pool gerencial
// Mercosur (tabla `articulos`) al maestro `chess_articulos` (columnas agregadas
// en la mig 137). La usa el desglose por familia del modal de "Bultos vendidos"
// del cuadro mensual. Esos campos NO vienen en la API REST /articulos, por eso
// se traen del pool.
//
// Auth: Bearer CRON_SECRET. Solo Pampeana. Idempotente (upsert por id_articulo).
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/indicadores/sync-familias

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPool } from "@/lib/mercosur-dashboard"
import { IS_MISIONES } from "@/lib/empresa"

const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 120

export async function POST(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ error: "Solo Pampeana" }, { status: 400 })
  }
  const auth = request.headers.get("authorization")
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // 1. Clasificación desde el pool Mercosur.
  let rows: Array<{ id_articulo: number; uneg: string | null; segmento: string | null }>
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{
      id_articulo: number
      uneg: string | null
      segmento: string | null
    }>(
      "SELECT id_articulo, uneg, segmento FROM articulos WHERE uneg IS NOT NULL",
    )
    rows = res.rows
  } catch (e) {
    return NextResponse.json(
      { error: `Pool: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  } finally {
    client.release()
  }

  // 2. Upsert a chess_articulos (solo uneg/segmento; el resto de columnas no se toca).
  const supabase = createAdminClient()
  let upserted = 0
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH).map((r) => ({
      id_articulo: r.id_articulo,
      uneg: r.uneg,
      segmento: r.segmento,
    }))
    const { error } = await supabase
      .from("chess_articulos")
      .upsert(slice, { onConflict: "id_articulo" })
    if (error) {
      return NextResponse.json({ error: error.message, upserted }, { status: 500 })
    }
    upserted += slice.length
  }

  return NextResponse.json({ ok: true, articulos_pool: rows.length, upserted })
}
