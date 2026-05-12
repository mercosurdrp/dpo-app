// Cron diario que sincroniza orden_salida_camion_diario + orden_salida_personal_no_sale
// desde la hoja FORMACIÓN / NO SALEN del Sheet de Misiones. Schedule en `vercel.json`.
//
// Auth: Bearer CRON_SECRET (Vercel lo inyecta automáticamente en sus crons).
// Tenant: solo corre en Misiones; en Pampeana sale en 200 con noop.

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { runOrdenSalidaSync } from "@/lib/orden-salida-sync-core"
import { IS_MISIONES } from "@/lib/empresa"

const CRON_SECRET = process.env.CRON_SECRET
// Días hacia atrás que el cron resincroniza cada noche. Cubre re-cargas tardías
// y correcciones de la planilla sin perforar histórico viejo.
const SYNC_WINDOW_DAYS = 14

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

  try {
    const supabase = createAdminClient()
    const res = await runOrdenSalidaSync(SYNC_WINDOW_DAYS, supabase)
    const durationMs = Date.now() - startedAt

    if ("error" in res) {
      console.error(`[orden-salida-cron-sync] fail duration_ms=${durationMs}: ${res.error}`)
      return NextResponse.json({ error: res.error, duration_ms: durationMs }, { status: 500 })
    }

    console.log(
      `[orden-salida-cron-sync] ok dias=${SYNC_WINDOW_DAYS} ` +
      `fechas=${res.data.fechasProcesadas} asig=${res.data.asignacionesInsertadas} ` +
      `noSale=${res.data.noSaleInsertadas} sinCarga=${res.data.camionesSinCarga} ` +
      `advertencias=${res.data.advertencias.length} duration_ms=${durationMs}`
    )

    return NextResponse.json({
      success: true,
      duration_ms: durationMs,
      ...res.data,
    })
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const message = err instanceof Error ? err.message : "Error inesperado"
    console.error(`[orden-salida-cron-sync] fatal duration_ms=${durationMs}: ${message}`)
    return NextResponse.json({ error: message, duration_ms: durationMs }, { status: 500 })
  }
}
