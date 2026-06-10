// Cron diario (Pampeana): sincroniza el VOLUMEN DIARIO (HL) y los CLIENTES
// distribuidos a pc_volumen_diario, leyendo la base del dashboard Mercosur
// (Railway) donde viven las ventas reales Chess + GESCOM. Reemplaza al cron
// Foxtrot de Misiones — en Pampeana no hay Foxtrot.
//
// HL del día = venta real (mismos filtros que src/lib/mercosur-dashboard.ts):
//   Chess : region='pampeana', anulado='NO', excluir SEGUNDA VUELTA, excluir env%.
//   GESCOM: codigo_sede=2, estado='Finalizada', excluir env%. HL = cantidad·valor_unidad_medida.
//   Clientes = id_cliente distinto sobre la unión de ambas fuentes.
// El OTIF NO se persiste acá: la vista v_pc_calendario_dia_multianio lo deriva
// de la tabla `rechazos`.
//
// Auth: Bearer CRON_SECRET. Por defecto procesa ayer + anteayer (lag de cierre).
// Backfill manual de tramos: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Schedule en vercel.json.

import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { createAdminClient } from "@/lib/supabase/admin"

const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 300
export const dynamic = "force-dynamic"

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_BACKFILL_DIAS = 800

let _pool: Pool | null = null
function getPool(): Pool {
  if (!_pool) {
    const url = process.env.MERCOSUR_DB_URL
    if (!url) throw new Error("Falta MERCOSUR_DB_URL (base del dashboard Mercosur).")
    _pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 15_000 })
  }
  return _pool
}

// HL y clientes por día (venta real Chess + GESCOM) en [desde, hasta].
const SQL = `
WITH chess AS (
  SELECT c.fecha::date AS d, c.id_cliente, c.unimed_total AS hl
  FROM comprobantes c
  LEFT JOIN articulos a ON c.id_articulo = a.id_articulo
  WHERE c.region = 'pampeana' AND c.anulado = 'NO'
    AND COALESCE(c.ds_fletero_carga,'') NOT ILIKE '%SEGUNDA VUELTA%'
    AND COALESCE(a.segmento,'') NOT ILIKE 'env%'
    AND c.fecha BETWEEN $1 AND $2
),
gescom AS (
  SELECT g.fecha::date AS d, g.id_cliente, g.cantidad * COALESCE(a.valor_unidad_medida,0) AS hl
  FROM comprobantes_gescom g
  LEFT JOIN articulos a ON g.id_articulo = a.id_articulo
  WHERE g.codigo_sede = 2 AND COALESCE(g.estado,'') = 'Finalizada'
    AND COALESCE(a.segmento,'') NOT ILIKE 'env%'
    AND g.fecha BETWEEN $1 AND $2
),
u AS (SELECT d, id_cliente, hl FROM chess UNION ALL SELECT d, id_cliente, hl FROM gescom)
SELECT to_char(d, 'YYYY-MM-DD') AS fecha,
       ROUND(SUM(hl)::numeric, 2) AS hl,
       COUNT(DISTINCT id_cliente) AS clientes
FROM u GROUP BY d ORDER BY d
`

async function handle(request: NextRequest) {
  const auth = request.headers.get("authorization")
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const desde = sp.get("desde")
  const hasta = sp.get("hasta")
  let d1: string
  let d2: string
  if (desde && hasta && FECHA_RE.test(desde) && FECHA_RE.test(hasta)) {
    d1 = desde
    d2 = hasta
  } else {
    // ayer .. anteayer (margen por el lag de cierre de comprobantes y la TZ)
    const hoy = Date.now()
    d2 = new Date(hoy - 1 * 86_400_000).toISOString().slice(0, 10)
    d1 = new Date(hoy - 2 * 86_400_000).toISOString().slice(0, 10)
  }

  const pool = getPool()
  const client = await pool.connect()
  let filas: { fecha: string; hl: number; clientes: number }[]
  try {
    const res = await client.query(SQL, [d1, d2])
    filas = res.rows
      .slice(0, MAX_BACKFILL_DIAS)
      .map((r) => ({
        fecha: String(r.fecha).slice(0, 10),
        hl: Number(r.hl) || 0,
        clientes: Number(r.clientes) || 0,
      }))
      // domingo no tiene reparto en Pampeana
      .filter((r) => new Date(r.fecha + "T00:00:00Z").getUTCDay() !== 0)
  } finally {
    client.release()
  }

  const supabase = createAdminClient()
  for (const f of filas) {
    const { error } = await supabase
      .from("pc_volumen_diario")
      .upsert(
        { fecha: f.fecha, bultos_distribuidos: f.hl, clientes_distribuidos: f.clientes },
        { onConflict: "fecha" },
      )
    if (error) return NextResponse.json({ error: error.message, hasta: f.fecha }, { status: 500 })
  }
  return NextResponse.json({ ok: true, dias: filas.length, desde: d1, hasta: d2 })
}

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}
