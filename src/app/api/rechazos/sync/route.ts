import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { calcularKpisConClient } from "@/lib/dpo-kpis-calc"
import https from "node:https"

const CHESS_BASE = process.env.CHESS_API_BASE_URL
const CHESS_USER = process.env.CHESS_API_USER
const CHESS_PASS = process.env.CHESS_API_PASS

const FOXTROT_KEY = process.env.FOXTROT_API_KEY
const FOXTROT_BASE = "https://apiv1.foxtrotsystems.com"
const FOXTROT_DCS =
  process.env.FOXTROT_DC_IDS?.split(",").map((s) => s.trim()).filter(Boolean) ??
  ["eldorado", "iguazu"]

const ALLOWED_ROLES = ["admin", "supervisor", "admin_rrhh"] as const

// Patente argentina: AAA 123 / AAA123 / AB 123 CD / AB123CD, con sufijo opcional .N
const PATENTE_REGEX =
  /^([A-Z]{3}\s?\d{3}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2})(\.\d+)?$/i

const MOTIVOS_EXCLUIDOS = new Set(["DEV X TRAMITES INTER"])

function isPatenteValida(s: string | null | undefined): boolean {
  if (!s) return false
  return PATENTE_REGEX.test(s.trim())
}

function normalizarPatente(s: string): string {
  return s.toUpperCase().trim()
}

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

interface FoxtrotDriver {
  id: string
  name: string
}

interface FoxtrotRoute {
  name: string | null
  assigned_driver_id: string | null
}

// Devuelve un mapa "<dc>:<driverId>" -> nombre del chofer.
async function fetchFoxtrotDrivers(): Promise<Map<string, string>> {
  const driversById = new Map<string, string>()
  if (!FOXTROT_KEY) return driversById

  await Promise.all(
    FOXTROT_DCS.map(async (dc) => {
      try {
        const resp = await fetch(`${FOXTROT_BASE}/dcs/${dc}/drivers`, {
          headers: {
            Authorization: `Bearer ${FOXTROT_KEY}`,
            Accept: "application/json",
          },
        })
        if (!resp.ok) {
          console.warn(`Foxtrot drivers ${dc}: HTTP ${resp.status}`)
          return
        }
        const data = await resp.json()
        const drivers: FoxtrotDriver[] = data?.data?.drivers ?? []
        for (const d of drivers) {
          driversById.set(`${dc}:${d.id}`, d.name)
        }
      } catch (e) {
        console.warn(`Foxtrot drivers ${dc} error: ${e}`)
      }
    })
  )

  return driversById
}

// Devuelve un mapa patente normalizada -> nombre del chofer para una fecha.
async function fetchPatenteChoferMap(
  fecha: string,
  driversById: Map<string, string>
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!FOXTROT_KEY) return map

  await Promise.all(
    FOXTROT_DCS.map(async (dc) => {
      try {
        const resp = await fetch(
          `${FOXTROT_BASE}/dcs/${dc}/routes/find_by_date/${fecha}`,
          {
            headers: {
              Authorization: `Bearer ${FOXTROT_KEY}`,
              Accept: "application/json",
            },
          }
        )
        if (!resp.ok) return
        const data = await resp.json()
        const routes: FoxtrotRoute[] = data?.data?.routes ?? []
        for (const r of routes) {
          if (!r.name || !r.assigned_driver_id) continue
          const chofer = driversById.get(`${dc}:${r.assigned_driver_id}`)
          if (!chofer) continue
          map.set(normalizarPatente(r.name), chofer)
        }
      } catch (e) {
        console.warn(`Foxtrot routes ${dc} ${fecha} error: ${e}`)
      }
    })
  )

  return map
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
  if (!CHESS_BASE || !CHESS_USER || !CHESS_PASS) {
    return NextResponse.json(
      {
        error:
          "Integración Chess no configurada en este deploy. Setear CHESS_API_BASE_URL, CHESS_API_USER y CHESS_API_PASS.",
      },
      { status: 503 }
    )
  }

  const sessionClient = await createClient()
  const {
    data: { user },
  } = await sessionClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const { data: profile } = await sessionClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
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

    // Foxtrot drivers (una sola vez para todo el sync)
    const foxtrotDrivers = await fetchFoxtrotDrivers()

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

      const [ventas, patenteChofer] = await Promise.all([
        fetchVentasDia(sessionId, fechaStr),
        fetchPatenteChoferMap(fechaStr, foxtrotDrivers),
      ])

      if (ventas.length === 0) {
        diasSinDatos++
        current.setDate(current.getDate() + 1)
        continue
      }

      // Calculate total bultos entregados per fletero for the day
      // (sólo patentes válidas; "TRANSPORTE ALTERNATIVO" y similares quedan fuera)
      const entregadosPorFletero = new Map<string, number>()
      for (const v of ventas) {
        if (v.anulado === "SI") continue
        if (!isPatenteValida(v.dsFleteroCarga)) continue
        const fletero = v.dsFleteroCarga
        const bultos = Math.abs(Number(v.unidadesSolicitadas) || 0)
        entregadosPorFletero.set(fletero, (entregadosPorFletero.get(fletero) ?? 0) + bultos)
      }

      // Filter rechazos: idRechazo > 0, no anulados, motivo no excluido, patente válida
      const rechazos = ventas.filter(
        (v) =>
          v.idRechazo > 0 &&
          v.anulado !== "SI" &&
          !MOTIVOS_EXCLUIDOS.has(v.dsRechazo) &&
          isPatenteValida(v.dsFleteroCarga)
      )

      for (const r of rechazos) {
        const fletero = r.dsFleteroCarga
        const bultosRechazados = Math.abs(Number(r.cantidadesRechazo) || 0)
        const bultosEntregados = entregadosPorFletero.get(fletero) ?? 0
        const chofer = patenteChofer.get(normalizarPatente(fletero)) ?? null

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
              chofer,
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

      // ---- Aggregate ventas_diarias per fletero (FCVTA only, patente válida) ----
      const ventasFCVTA = ventas.filter(
        (v) =>
          v.idDocumento === "FCVTA" &&
          v.anulado !== "SI" &&
          isPatenteValida(v.dsFleteroCarga)
      )

      const fleteroAgg = new Map<
        string,
        { bultos: number; unidades: number; hl: number; planillas: Set<string> }
      >()

      for (const v of ventasFCVTA) {
        const fletero = v.dsFleteroCarga
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

export const maxDuration = 300

export async function GET() {
  return NextResponse.json({ status: "ok", service: "rechazos-sync" })
}
