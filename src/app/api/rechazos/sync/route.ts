import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { calcularKpisConClient } from "@/lib/dpo-kpis-calc"
import https from "node:https"

const API_KEY = process.env.ASISTENCIA_API_KEY ?? "mercosur-dpo-sync-2026"

const CHESS_BASE = "https://mercosurpampeana.chesserp.com/AR910/web/api/chess/v1"
const CHESS_USER = process.env.CHESS_API_USER ?? "dcepeda1"
const CHESS_PASS = process.env.CHESS_API_PASS ?? "1234"

// Agent that accepts self-signed certificates
const insecureAgent = new https.Agent({ rejectUnauthorized: false })

function chessFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    // @ts-expect-error Node fetch supports agent option
    agent: insecureAgent,
  })
}

async function chessLogin(): Promise<string> {
  const resp = await chessFetch(`${CHESS_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: CHESS_USER, password: CHESS_PASS }),
  })

  if (!resp.ok) throw new Error(`Chess login failed: ${resp.status}`)

  const data = await resp.json()
  if (!data.sessionId) throw new Error("No sessionId from Chess")
  return data.sessionId
}

interface ChessVenta {
  idDocumento: string
  serie: number
  nrodoc: number
  idRechazo: number
  dsRechazo: string
  idArticulo: number
  dsArticulo: string
  idFleteroCarga: number
  dsFleteroCarga: string
  cantidadesRechazo: number
  cantidadesTotal: number
  unidadesSolicitadas: number
  idCliente: number
  nombreCliente: string
  idVendedor: number
  dsVendedor: string
  planillaCarga: string
  fechaComprobate: string
  anulado: string
  unimedtotal: number
}

async function fetchVentasDia(sessionId: string, fecha: string): Promise<ChessVenta[]> {
  const url = `${CHESS_BASE}/ventas/?fechaDesde=${fecha}&fechaHasta=${fecha}&detallado=true`

  const resp = await chessFetch(url, {
    headers: {
      Accept: "application/json",
      Cookie: sessionId,
    },
  })

  if (!resp.ok) {
    console.warn(`Chess ventas ${fecha}: HTTP ${resp.status} — skipping`)
    return []
  }

  let data
  try {
    data = await resp.json()
  } catch {
    console.warn(`Chess ventas ${fecha}: invalid JSON — skipping`)
    return []
  }

  const resumen = data?.dsReporteComprobantesApi?.VentasResumen

  if (!Array.isArray(resumen)) return []
  return resumen as ChessVenta[]
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("x-api-key")
  if (authHeader !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { fechaDesde, fechaHasta } = body as { fechaDesde?: string; fechaHasta?: string }

    if (!fechaDesde) {
      return NextResponse.json({ error: "fechaDesde is required" }, { status: 400 })
    }

    const desde = new Date(fechaDesde)
    const hasta = fechaHasta ? new Date(fechaHasta) : new Date(fechaDesde)

    // Login to Chess
    const sessionId = await chessLogin()

    const supabase = createAdminClient()
    let totalInsertadas = 0
    let totalRepetidas = 0
    let totalDias = 0
    let diasSinDatos = 0

    // Loop through each day
    const current = new Date(desde)
    while (current <= hasta) {
      const fechaStr = current.toISOString().slice(0, 10)
      totalDias++

      const ventas = await fetchVentasDia(sessionId, fechaStr)

      if (ventas.length === 0) {
        diasSinDatos++
        current.setDate(current.getDate() + 1)
        continue
      }

      // Calculate total bultos entregados per fletero for the day
      const entregadosPorFletero = new Map<string, number>()
      for (const v of ventas) {
        if (v.anulado === "SI") continue
        const fletero = v.dsFleteroCarga ?? "SIN ASIGNAR"
        const bultos = Math.abs(Number(v.unidadesSolicitadas) || 0)
        entregadosPorFletero.set(fletero, (entregadosPorFletero.get(fletero) ?? 0) + bultos)
      }

      // Filter only rechazos (idRechazo > 0)
      const rechazos = ventas.filter(
        (v) => v.idRechazo > 0 && v.anulado !== "SI"
      )

      for (const r of rechazos) {
        const fletero = r.dsFleteroCarga ?? "SIN ASIGNAR"
        const bultosRechazados = Math.abs(Number(r.cantidadesRechazo) || 0)
        const bultosEntregados = entregadosPorFletero.get(fletero) ?? 0

        const { error } = await supabase
          .from("rechazos")
          .upsert(
            {
              fecha: fechaStr,
              serie: r.serie,
              nrodoc: r.nrodoc,
              id_articulo: r.idArticulo,
              ds_articulo: r.dsArticulo,
              id_fletero_carga: r.idFleteroCarga,
              ds_fletero_carga: fletero,
              id_rechazo: r.idRechazo,
              ds_rechazo: r.dsRechazo,
              bultos_rechazados: bultosRechazados,
              bultos_entregados: bultosEntregados,
              id_cliente: r.idCliente,
              nombre_cliente: r.nombreCliente,
              id_vendedor: r.idVendedor,
              ds_vendedor: r.dsVendedor,
              planilla_carga: r.planillaCarga,
            },
            { onConflict: "serie,nrodoc,id_articulo" }
          )

        if (error) {
          if (error.code === "23505") totalRepetidas++
          else console.error(`Error upserting rechazo: ${error.message}`)
        } else {
          totalInsertadas++
        }
      }

      // ---- Aggregate ventas_diarias per fletero (FCVTA only) ----
      const ventasFCVTA = ventas.filter(
        (v) => v.idDocumento === "FCVTA" && v.anulado !== "SI"
      )

      const fleteroAgg = new Map<
        string,
        { bultos: number; unidades: number; hl: number; planillas: Set<string> }
      >()

      for (const v of ventasFCVTA) {
        const fletero = v.dsFleteroCarga ?? "SIN ASIGNAR"
        const agg = fleteroAgg.get(fletero) ?? {
          bultos: 0,
          unidades: 0,
          hl: 0,
          planillas: new Set<string>(),
        }
        agg.bultos += Math.abs(Number(v.unidadesSolicitadas) || 0)
        agg.unidades += Math.abs(Number(v.cantidadesTotal) || 0)
        agg.hl += Math.abs(Number(v.unimedtotal) || 0)
        if (v.planillaCarga) agg.planillas.add(v.planillaCarga)
        fleteroAgg.set(fletero, agg)
      }

      for (const [fletero, agg] of fleteroAgg) {
        const { error: vdErr } = await supabase
          .from("ventas_diarias")
          .upsert(
            {
              fecha: fechaStr,
              ds_fletero_carga: fletero,
              total_bultos: Math.round(agg.bultos * 100) / 100,
              total_unidades: Math.round(agg.unidades * 10000) / 10000,
              total_hl: Math.round(agg.hl * 10000) / 10000,
              viajes: agg.planillas.size,
            },
            { onConflict: "fecha,ds_fletero_carga" }
          )

        if (vdErr) {
          console.error(`Error upserting ventas_diarias: ${vdErr.message}`)
        }
      }

      current.setDate(current.getDate() + 1)
    }

    // ---- Calculate auto KPIs for the month(s) covered ----
    const mesesProcesados = new Set<string>()
    const loopDate = new Date(desde)
    while (loopDate <= hasta) {
      const m = loopDate.getMonth() + 1
      const a = loopDate.getFullYear()
      mesesProcesados.add(`${a}-${m}`)
      loopDate.setDate(loopDate.getDate() + 1)
    }

    let kpisCalculados = 0
    for (const key of mesesProcesados) {
      const [anioStr, mesStr] = key.split("-")
      const result = await calcularKpisConClient(
        supabase,
        Number(mesStr),
        Number(anioStr)
      )
      if ("data" in result) kpisCalculados += result.data.calculados
    }

    return NextResponse.json({
      success: true,
      dias_procesados: totalDias,
      rechazos_insertados: totalInsertadas,
      rechazos_repetidos: totalRepetidas,
      dias_sin_datos: diasSinDatos,
      kpis_calculados: kpisCalculados,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error syncing rechazos" },
      { status: 500 }
    )
  }
}

export const maxDuration = 60

export async function GET() {
  return NextResponse.json({ status: "ok", service: "rechazos-sync" })
}
