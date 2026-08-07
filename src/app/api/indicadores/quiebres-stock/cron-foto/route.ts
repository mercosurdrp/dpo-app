// Foto de la MAÑANA del stock por artículo — insumo del indicador de Quiebres
// de Stock (Indicadores · Almacén).
//
// Corre antes de que empiece el picking: lo que interesa es con qué stock
// ABRIÓ el día, no el minuto a minuto. Un artículo que amanece en cero es un
// quiebre aunque a las 11 entre un camión de fábrica; si se mirara el cierre,
// ese día figuraría sano y el PDV que pidió a la mañana igual se quedó sin.
//
// Fuente: Chess `GET /stock/` (ver src/lib/chess/stock.ts). Usa las
// credenciales CHESS_API_* que ya tiene la app — no hace falta ninguna key
// nueva. Se eligió Chess y no el WMS a propósito: el WMS dice si el pallet
// está en el edificio, Chess dice si se puede facturar. Mercadería bloqueada
// por fecha corta está físicamente y el PDV igual se queda sin producto.
//
// 🚨 El endpoint ACEPTA FECHAS PASADAS, así que este mismo cron reconstruye
// meses anteriores: `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`. Con eso julio dejó
// de ser una inferencia por ausencia de venta y pasó a ser stock registrado.
//
// La foto es evidencia: se escribe con service role y la tabla no tiene policy
// de escritura, así que no se puede editar a mano desde la app.
//
// Auth: Bearer CRON_SECRET. Schedule en `vercel.json` (09:30 UTC = 06:30 ARG).
//
// Corridas manuales:
//   curl -H "Authorization: Bearer $CRON_SECRET" .../cron-foto
//   ...?fecha=2026-08-07                      una fecha puntual
//   ...?desde=2026-07-01&hasta=2026-07-31     reconstruir un mes

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPool } from "@/lib/mercosur-dashboard"
import { chessLogin } from "@/lib/wa-bot/chess"
import { credencialesChess, getStockChess, DEPOSITO_CD } from "@/lib/chess/stock"
import {
  construirResolverFamilias,
  type ArticuloMaestro,
} from "@/lib/quiebres-stock/calculo"
import { IS_MISIONES } from "@/lib/empresa"

const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 300

/** Tope de días por corrida: el backfill de un mes entra holgado. */
const MAX_DIAS = 45

/** Hoy en hora de Argentina (UTC-3) como YYYY-MM-DD. */
function hoyArg(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function rangoDeFechas(desde: string, hasta: string): string[] {
  const out: string[] = []
  const d = new Date(`${desde}T12:00:00Z`)
  const fin = new Date(`${hasta}T12:00:00Z`)
  while (d <= fin && out.length < MAX_DIAS) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

export async function GET(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "not-pampeana" })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "CRON_SECRET inválido o faltante" }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const desde = sp.get("desde")
  const hasta = sp.get("hasta")
  const fechas =
    desde && hasta ? rangoDeFechas(desde, hasta) : [sp.get("fecha") ?? hoyArg()]
  const idDeposito = Number(sp.get("deposito") ?? DEPOSITO_CD)

  try {
    // Maestro para resolver la familia (marca + calibre) de cada artículo.
    const pool = getPool()
    const client = await pool.connect()
    let maestro: Map<number, ArticuloMaestro>
    try {
      const m = await client.query<{
        id_articulo: number
        des_articulo: string | null
        marca: string | null
        calibre: string | null
        segmento: string | null
      }>("SELECT id_articulo, des_articulo, marca, calibre, segmento FROM articulos")
      maestro = new Map(
        m.rows.map((r) => [
          Number(r.id_articulo),
          {
            des_articulo: r.des_articulo ?? String(r.id_articulo),
            marca: r.marca,
            calibre: r.calibre,
            segmento: r.segmento,
            anulado: false,
          },
        ]),
      )
    } finally {
      client.release()
    }
    // Misma resolución de familia que el indicador, para que la foto y la
    // pantalla hablen de los mismos productos.
    const resolverFamilia = construirResolverFamilias(maestro)

    // Un solo login para todo el rango.
    const sessionId = await chessLogin(credencialesChess())
    const supabase = createAdminClient()
    const resumen: { fecha: string; skus: number; en_quiebre: number }[] = []

    for (const fecha of fechas) {
      const stock = await getStockChess(fecha, { idDeposito, sessionId })
      if (stock.length === 0) {
        // Sin filas no se escribe nada: una foto vacía después se leería como
        // "ese día no quebró nada", que es exactamente lo contrario del dato.
        resumen.push({ fecha, skus: 0, en_quiebre: 0 })
        continue
      }

      // Chess abre por almacén y lote: se suma a un total por artículo.
      const porArticulo = new Map<
        number,
        { ds: string; bultos: number; unidades: number }
      >()
      for (const f of stock) {
        const a = porArticulo.get(f.idArticulo) ?? {
          ds: f.dsArticulo,
          bultos: 0,
          unidades: 0,
        }
        a.bultos += Number(f.cantBultos) || 0
        a.unidades += Number(f.cantUnidades) || 0
        porArticulo.set(f.idArticulo, a)
      }

      const filas = [...porArticulo.entries()].map(([id, a]) => {
        return {
          fecha,
          id_articulo: id,
          ds_articulo: a.ds,
          familia: resolverFamilia(id, a.ds),
          bultos: a.bultos,
          dias_cobertura: null,
          vpd: null,
          // Exactamente cero, no "<= 0": un saldo NEGATIVO es kardex
          // desfasado (despacho imputado antes que la recepción), no falta de
          // producto. Se guarda tal cual viene de Chess y el indicador lo
          // trata como sin dato.
          en_quiebre: a.bultos === 0 && a.unidades === 0,
          origen: `chess-stock-dep${idDeposito}`,
        }
      })

      const { error } = await supabase
        .from("quiebres_stock_fotos")
        .upsert(filas, { onConflict: "fecha,id_articulo" })
      if (error) {
        return NextResponse.json(
          { error: `${fecha}: ${error.message}`, hechas: resumen },
          { status: 500 },
        )
      }
      resumen.push({
        fecha,
        skus: filas.length,
        en_quiebre: filas.filter((f) => f.en_quiebre).length,
      })
    }

    return NextResponse.json({
      success: true,
      deposito: idDeposito,
      dias: resumen.length,
      detalle: resumen,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error inesperado" },
      { status: 500 },
    )
  }
}
