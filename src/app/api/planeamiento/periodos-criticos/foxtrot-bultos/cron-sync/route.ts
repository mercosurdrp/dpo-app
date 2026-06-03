// Cron diario: sincroniza los BULTOS DISTRIBUIDOS (Foxtrot) del día anterior a
// pc_volumen_diario.bultos_distribuidos. Es lo que mantiene el volumen de los
// Períodos Críticos al día (2026 se autocompleta solo); el backfill histórico
// se hizo una sola vez con scripts/sync_foxtrot_bultos.py.
//
// Volumen del día = Σ quantity de las entregas SUCCESSFUL de todas las rutas de
// Iguazú + Eldorado (juntos). Excluye domingos (no hay reparto).
//
// Auth: Bearer CRON_SECRET. Tenant: solo Misiones (noop en Pampeana).
// Por defecto procesa ayer + anteayer (cubre el lag de cierre de rutas).
// Backfill manual de tramos: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// Schedule en vercel.json.

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fxFetch, getRoutesForDc } from "@/lib/foxtrot-snapshot/client"
import { IS_MISIONES } from "@/lib/empresa"

const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 300

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const DCS = ["iguazu", "eldorado"]
const MAX_BACKFILL_DIAS = 90

type DeliveriesResp = {
  data?: { deliveries?: { quantity?: number; attempts?: { attempt_status?: string }[] }[] }
}
type WaypointsResp = { data?: { waypoints?: { waypoint_id?: string; customer_id?: string }[] } }

// Concurrencia acotada para no saturar Foxtrot (la API falla con cientos en
// paralelo). Procesa en lotes.
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))))
  }
  return out
}

// Volumen (bultos), clientes con entrega OK y OTIF (clientes OK / con intento),
// todo de la misma pasada por las paradas de Iguazú + Eldorado.
async function resumenDelDia(
  fecha: string,
): Promise<{ bultos: number; clientes: number; otif: number | null }> {
  let bultos = 0
  const cliOk = new Set<string>()
  const cliFail = new Set<string>()
  for (const dc of DCS) {
    const rutas = await getRoutesForDc(dc, [fecha])
    for (const r of rutas) {
      const wpRes = await fxFetch<WaypointsResp>(`/dcs/${dc}/routes/${r.id}/waypoints`)
      const wps = wpRes.data?.waypoints ?? []
      const resu = await mapLimit(wps, 8, async (wp) => {
        const dRes = await fxFetch<DeliveriesResp>(
          `/dcs/${dc}/routes/${r.id}/waypoints/${wp.waypoint_id}/deliveries`,
        )
        const dels = dRes.data?.deliveries ?? []
        let b = 0
        let ok = false
        let fail = false
        for (const it of dels) {
          const sts = (it.attempts ?? []).map((a) => a.attempt_status)
          if (sts.includes("SUCCESSFUL")) {
            b += it.quantity ?? 0
            ok = true
          } else if (sts.includes("FAILED")) {
            fail = true
          }
        }
        return { b, cid: wp.customer_id, estado: ok ? "ok" : fail ? "fail" : null }
      })
      for (const x of resu) {
        bultos += x.b
        if (x.estado === "ok" && x.cid) cliOk.add(x.cid)
        else if (x.estado === "fail" && x.cid) cliFail.add(x.cid)
      }
    }
  }
  for (const c of cliOk) cliFail.delete(c) // cliente con algún OK cuenta como OK
  const denom = cliOk.size + cliFail.size
  return { bultos, clientes: cliOk.size, otif: denom ? cliOk.size / denom : null }
}

function rango(desde: string, hasta: string): string[] {
  const out: string[] = []
  let d = new Date(desde + "T00:00:00Z")
  const end = new Date(hasta + "T00:00:00Z")
  while (d <= end && out.length < MAX_BACKFILL_DIAS) {
    out.push(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() + 86_400_000)
  }
  return out
}

async function handle(request: NextRequest) {
  if (!IS_MISIONES) return NextResponse.json({ ok: true, noop: "solo Misiones" })

  const auth = request.headers.get("authorization")
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const desde = sp.get("desde")
  const hasta = sp.get("hasta")
  let fechas: string[]
  if (desde && hasta && FECHA_RE.test(desde) && FECHA_RE.test(hasta)) {
    fechas = rango(desde, hasta)
  } else {
    // ayer + anteayer (margen por el lag de cierre de rutas y la TZ)
    const hoy = Date.now()
    fechas = [1, 2].map((n) => new Date(hoy - n * 86_400_000).toISOString().slice(0, 10))
  }

  const supabase = createAdminClient()
  const resultado: Record<string, { bultos: number; clientes: number; otif: number | null }> = {}
  for (const f of fechas) {
    if (new Date(f + "T00:00:00Z").getUTCDay() === 0) continue // domingo
    const { bultos, clientes, otif } = await resumenDelDia(f)
    const row: Record<string, unknown> = {
      fecha: f,
      bultos_distribuidos: Math.round(bultos * 100) / 100,
      clientes_distribuidos: clientes,
    }
    if (otif !== null) row.otif_distribuido = Math.round(otif * 10000) / 10000
    const { error } = await supabase
      .from("pc_volumen_diario")
      .upsert(row, { onConflict: "fecha" })
    if (error) return NextResponse.json({ error: error.message, hasta: f }, { status: 500 })
    resultado[f] = { bultos, clientes, otif }
  }
  return NextResponse.json({ ok: true, dias: resultado })
}

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}
