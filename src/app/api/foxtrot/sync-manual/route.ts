// Sincronización manual de Foxtrot disparada desde la UI (botón en la reunión
// de logística de Misiones). A diferencia de /api/foxtrot/cron-sync (auth por
// CRON_SECRET, lo dispara Vercel), este endpoint se autentica con la sesión del
// usuario y exige rol editor. Sincroniza los últimos N días (default 4).
//
// Solo Misiones. Usa el service role (admin client) para los upserts.

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { syncFoxtrotDay } from "@/lib/foxtrot-sync"
import { syncFoxtrotRouteAnalytics } from "@/lib/foxtrot-analytics"
import { IS_MISIONES } from "@/lib/empresa"

export const maxDuration = 300

const MAX_DIAS = 7
const DEFAULT_DIAS = 4

function hoyARG(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  if (!IS_MISIONES) {
    return NextResponse.json(
      { error: "Solo disponible en Misiones" },
      { status: 400 },
    )
  }

  let profile
  try {
    profile = await requireAuth()
  } catch {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
  }

  const url = new URL(request.url)
  const diasRaw = parseInt(url.searchParams.get("dias") ?? "", 10)
  const dias = Number.isFinite(diasRaw)
    ? Math.min(Math.max(1, diasRaw), MAX_DIAS)
    : DEFAULT_DIAS

  // Últimos `dias` días incluyendo hoy (zona ARG).
  const fechas: string[] = []
  const hoy = new Date(`${hoyARG()}T12:00:00.000Z`)
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy)
    d.setUTCDate(hoy.getUTCDate() - i)
    fechas.push(d.toISOString().slice(0, 10))
  }

  try {
    const supabase = createAdminClient()
    const resultados: {
      fecha: string
      ok: boolean
      rutas: number
      errores: number
    }[] = []
    let rutas = 0
    let errores = 0
    for (const f of fechas) {
      const log = await syncFoxtrotDay(supabase, f)
      rutas += log.rutas_sincronizadas
      errores += log.errores
      resultados.push({
        fecha: f,
        ok: log.ok,
        rutas: log.rutas_sincronizadas,
        errores: log.errores,
      })
    }

    // Departure real (ROUTE_ANALYTICS) para los días del rango — se genera con
    // lag, así que cubrimos una ventana hacia atrás.
    const analyticsDesde = new Date(`${fechas[0]}T12:00:00.000Z`)
    analyticsDesde.setUTCDate(analyticsDesde.getUTCDate() - 4)
    const analytics = await syncFoxtrotRouteAnalytics(
      supabase,
      analyticsDesde.toISOString().slice(0, 10),
      fechas[fechas.length - 1],
    )

    return NextResponse.json({
      success: true,
      dias: fechas.length,
      rutas,
      errores,
      resultados,
      analytics_departures: analytics.rutas_actualizadas,
      duration_ms: Date.now() - startedAt,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error sincronizando Foxtrot"
    return NextResponse.json(
      { error: message, duration_ms: Date.now() - startedAt },
      { status: 500 },
    )
  }
}
