// Cron diario que persiste la foto de los KPIs de flota sin histórico
// (cumplimiento del plan preventivo, services vencidos) en
// `flota_kpi_snapshots`, pisando el mes ARG en curso: al cerrar el mes queda
// la última foto y el tablero de Indicadores gana tendencia de 3 meses.
//
// Auth: Bearer CRON_SECRET (Vercel lo inyecta en sus crons).
// Tenant: solo Pampeana; en Misiones sale 200 noop. Schedule en `vercel.json`.
//
// Corrida manual:
//   curl -H "Authorization: Bearer $CRON_SECRET" .../api/vehiculos/flota-kpi-cron

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { capturarFlotaKpiSnapshots } from "@/lib/vehiculos/flota-kpis"
import { IS_MISIONES } from "@/lib/empresa"

const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "not-pampeana" })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const isAuthorized = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "CRON_SECRET inválido o faltante" },
      { status: 401 }
    )
  }

  try {
    const res = await capturarFlotaKpiSnapshots(createAdminClient())
    return NextResponse.json({ success: true, ...res })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 }
    )
  }
}
