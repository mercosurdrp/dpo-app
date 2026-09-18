/**
 * Sync diaria: CERRADO vs. horario relevado del PDV (solo Pampeana).
 *
 * Dos pasos, en orden: primero replica el relevamiento de horarios desde la
 * base del dashboard Mercosur, despues reclasifica los rechazos del rango.
 * Si el relevamiento falla, no se reclasifica: clasificar con horarios viejos
 * daria un numero peor que no dar ninguno.
 *
 * Auth — 3 caminos (mismo patron que /api/wa-bot/sync-clientes):
 *   - cron           (Bearer CRON_SECRET + UA vercel-cron)
 *   - manual-bearer  (Bearer CRON_SECRET sin UA cron)
 *   - manual-session (admin/supervisor logueado)
 *
 * Body opcional:
 *   { desde?: 'YYYY-MM-DD', hasta?: 'YYYY-MM-DD', margen_min?: number,
 *     solo_horarios?: boolean }
 * Sin fechas recalcula los ultimos 60 dias. Para el backfill del año se pasa
 * desde: '2026-01-01'.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { syncPdvHorarios } from "@/lib/cerrado-horarios/sync-horarios"
import { recalcularCerradoHorarios } from "@/lib/cerrado-horarios/analisis"
import { MARGEN_MIN_DEFAULT } from "@/lib/cerrado-horarios/clasificar"
import { invalidarArbolSueno } from "@/lib/sueno/arbol-cache"

export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const ALLOWED_ROLES = ["admin", "supervisor"] as const
const DIAS_POR_DEFECTO = 60

const esFecha = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)

export async function GET() {
  return NextResponse.json({ status: "ok", service: "cerrado-horarios-sync" })
}

export async function POST(request: NextRequest) {
  const t0 = Date.now()
  if (!process.env.MERCOSUR_DB_URL) {
    return NextResponse.json(
      { error: "Falta MERCOSUR_DB_URL (la base del dashboard Mercosur)." },
      { status: 503 },
    )
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const userAgent = request.headers.get("user-agent") ?? ""
  const bearerOk = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  const isCron = bearerOk && /^vercel-cron/i.test(userAgent)

  let source: "cron" | "manual-bearer" | "manual-session"
  if (isCron) source = "cron"
  else if (bearerOk) source = "manual-bearer"
  else {
    source = "manual-session"
    if (authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "CRON_SECRET inválido" }, { status: 401 })
    }
    const sessionClient = await createClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const { data: profile } = await sessionClient
      .from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      desde?: string
      hasta?: string
      margen_min?: number
      solo_horarios?: boolean
    }

    const hoy = new Date()
    const hasta = esFecha(body.hasta)
      ? body.hasta
      : hoy.toISOString().slice(0, 10)
    const desde = esFecha(body.desde)
      ? body.desde
      : new Date(hoy.getTime() - DIAS_POR_DEFECTO * 86_400_000)
          .toISOString()
          .slice(0, 10)
    const margen =
      typeof body.margen_min === "number" && body.margen_min >= 0
        ? Math.round(body.margen_min)
        : MARGEN_MIN_DEFAULT

    const supabase = createAdminClient()

    const horarios = await syncPdvHorarios(supabase)
    console.log(
      `[cerrado-horarios] horarios leidos=${horarios.leidos} ` +
      `upserted=${horarios.upserted} ciclos=${horarios.ciclos.join(",")}`,
    )

    if (body.solo_horarios) {
      return NextResponse.json({ success: true, source, horarios })
    }

    const analisis = await recalcularCerradoHorarios(supabase, desde, hasta, margen)

    // Los dos nodos del arbol leen esta tabla en vivo, pero el arbol entero
    // esta cacheado 10 minutos: sin esto el numero nuevo tarda en aparecer.
    invalidarArbolSueno()

    console.log(
      `[cerrado-horarios] source=${source} ${desde}..${hasta} ` +
      `casos=${analisis.casos} dentro=${analisis.dentro} fuera=${analisis.fuera} ` +
      `tasa=${analisis.tasa?.toFixed(1) ?? "n/d"}% ` +
      `cobertura=${analisis.cobertura?.toFixed(1) ?? "n/d"}% ` +
      `duration=${analisis.duration_ms}ms`,
    )

    return NextResponse.json({ success: true, source, horarios, analisis })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error cerrado-horarios"
    console.error(`[cerrado-horarios] fatal: ${msg}`)
    return NextResponse.json(
      { error: msg, duration_ms: Date.now() - t0 },
      { status: 500 },
    )
  }
}
