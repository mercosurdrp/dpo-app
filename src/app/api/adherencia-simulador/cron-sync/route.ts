// Cron que autocompleta los KPIs de Adherencia al Simulador en el punto 2.3
// del manual DPO ("Recurso del dimensionamiento"). Consume el endpoint
// /api/adherencia del Simulador de Dimensionamiento y upserta 3 indicadores
// (Dotación, Volumen HL, HE) con el último mes cerrado + historial en notas.
//
// Auth: Bearer CRON_SECRET (Vercel lo inyecta en sus crons).
// Tenant: solo Misiones; en Pampeana sale 200 noop. Schedule en `vercel.json`.
//
// Backfill / re-sync de otro año:
//   curl -H "Authorization: Bearer $CRON_SECRET" ".../api/adherencia-simulador/cron-sync?anio=2026"

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { syncAdherenciaSimulador } from "@/lib/sync/adherencia-simulador"
import { IS_MISIONES } from "@/lib/empresa"

const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 120

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const startedAt = Date.now()

  if (!IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "not-misiones" })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const isAuthorized = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  if (!isAuthorized) {
    return NextResponse.json({ error: "CRON_SECRET inválido o faltante" }, { status: 401 })
  }

  const url = new URL(request.url)
  const anioParam = url.searchParams.get("anio")
  const anio = anioParam && /^\d{4}$/.test(anioParam) ? Number(anioParam) : undefined

  try {
    const supabase = createAdminClient()
    const result = await syncAdherenciaSimulador(supabase, anio)
    const durationMs = Date.now() - startedAt
    console.log(
      `[adherencia-simulador-cron] ok=${result.ok} actualizados=${result.actualizados} ` +
        `anio=${result.anio} duration_ms=${durationMs}`,
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error, duration_ms: durationMs }, { status: 502 })
    }
    return NextResponse.json({ success: true, ...result, duration_ms: durationMs })
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const message = err instanceof Error ? err.message : "Error sincronizando adherencia"
    console.error(`[adherencia-simulador-cron] fatal duration_ms=${durationMs}: ${message}`)
    return NextResponse.json({ error: message, duration_ms: durationMs }, { status: 500 })
  }
}
