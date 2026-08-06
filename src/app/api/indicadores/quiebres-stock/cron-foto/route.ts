// Foto de la MAÑANA del stock por SKU — insumo del indicador de Quiebres de
// Stock (Indicadores · Almacén).
//
// Corre antes de que empiece el picking: lo que interesa es con qué stock
// ABRIÓ el día, no el minuto a minuto. Un SKU que amanece en cero es un
// quiebre aunque a las 11 entre un camión de fábrica; si se mirara el cierre,
// ese día figuraría sano y el PDV que pidió a la mañana igual se quedó sin.
//
// Fuente: chess-dashboard /api/inventario-cobertura (stock kardex + VPD 15d),
// la misma que usa la rutina de Pronóstico (src/actions/pronostico.ts).
// Requiere PLANIFICADOR_API_KEY. Sin esa env el cron no inventa nada: devuelve
// 503 y el indicador sigue cayendo al proxy de venta, avisándolo en pantalla.
//
// La foto es evidencia: se escribe con service role y la tabla no tiene policy
// de escritura, así que no se puede editar a mano desde la app.
//
// Auth: Bearer CRON_SECRET. Schedule en `vercel.json` (09:30 UTC = 06:30 ARG).
//
// Corrida manual:
//   curl -H "Authorization: Bearer $CRON_SECRET" .../api/indicadores/quiebres-stock/cron-foto
//   ?fecha=2026-08-07  fuerza la fecha de la foto (por defecto, hoy en ARG)

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPool } from "@/lib/mercosur-dashboard"
import { claveFamilia } from "@/lib/quiebres-stock/calculo"
import { IS_MISIONES } from "@/lib/empresa"

const CHESS_DASHBOARD_BASE = "https://chess-dashboard-mercosurdrps-projects.vercel.app"
const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 300

interface CoberturaApiResponse {
  kardexMes: string
  generado: string
  items: Array<{
    articulo: string
    descripcion: string
    division: string
    segmento: string
    stockBultos: number
    stockHl: number
    vpdBultos: number
    vpdHl: number
    coberturaDias: number | null
  }>
}

/** Hoy en hora de Argentina (UTC-3) como YYYY-MM-DD. */
function hoyArg(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "not-pampeana" })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { error: "CRON_SECRET inválido o faltante" },
      { status: 401 },
    )
  }

  const key = process.env.PLANIFICADOR_API_KEY
  if (!key) {
    return NextResponse.json(
      {
        error:
          "Falta PLANIFICADOR_API_KEY: sin ella no hay stock por SKU y la foto no se puede tomar.",
      },
      { status: 503 },
    )
  }

  const fecha = request.nextUrl.searchParams.get("fecha") ?? hoyArg()

  try {
    const res = await fetch(
      `${CHESS_DASHBOARD_BASE}/api/inventario-cobertura?empresa=pampeana`,
      { headers: { "x-api-key": key }, cache: "no-store" },
    )
    if (!res.ok) {
      return NextResponse.json(
        { error: `chess-dashboard respondió ${res.status}` },
        { status: 502 },
      )
    }
    const cobertura = (await res.json()) as CoberturaApiResponse
    const items = cobertura.items ?? []
    if (items.length === 0) {
      return NextResponse.json(
        { error: "chess-dashboard devolvió 0 items; no se escribe una foto vacía" },
        { status: 502 },
      )
    }

    // Maestro para resolver la familia (marca + calibre) de cada SKU.
    const pool = getPool()
    const client = await pool.connect()
    let maestro: Map<number, { marca: string | null; calibre: string | null; des: string }>
    try {
      const m = await client.query<{
        id_articulo: number
        des_articulo: string | null
        marca: string | null
        calibre: string | null
      }>("SELECT id_articulo, des_articulo, marca, calibre FROM articulos")
      maestro = new Map(
        m.rows.map((r) => [
          Number(r.id_articulo),
          { marca: r.marca, calibre: r.calibre, des: r.des_articulo ?? "" },
        ]),
      )
    } finally {
      client.release()
    }

    const filas = items
      .map((it) => {
        const id = Number(it.articulo)
        if (!Number.isFinite(id)) return null
        const a = maestro.get(id)
        const bultos = Number(it.stockBultos) || 0
        return {
          fecha,
          id_articulo: id,
          ds_articulo: it.descripcion ?? a?.des ?? String(id),
          familia: claveFamilia(a?.marca, a?.calibre, it.descripcion ?? String(id)),
          bultos,
          dias_cobertura: it.coberturaDias,
          vpd: Number(it.vpdBultos) || 0,
          en_quiebre: bultos <= 0,
          origen: "cobertura-live",
        }
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)

    const supabase = createAdminClient()
    // Upsert por (fecha, id_articulo): si el cron corre dos veces el mismo día,
    // la última foto pisa a la anterior en vez de duplicar la fila.
    const { error } = await supabase
      .from("quiebres_stock_fotos")
      .upsert(filas, { onConflict: "fecha,id_articulo" })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      fecha,
      skus: filas.length,
      en_quiebre: filas.filter((f) => f.en_quiebre).length,
      kardex_mes: cobertura.kardexMes,
      generado: cobertura.generado,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error inesperado" },
      { status: 500 },
    )
  }
}
