// Sincronización manual de Cloudfleet disparada desde la UI (botón "Sincronizar
// checks" en la reunión de logística de Misiones). A diferencia de
// /api/cloudfleet/cron-sync (auth por CRON_SECRET, lo dispara Vercel), este
// endpoint se autentica con la sesión del usuario y exige rol editor.
//
// Sin parámetros sincroniza SOLO el día de hoy (hora ARG) — refresco rápido de
// las liberaciones de la matinal. Con `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
// resincroniza todo ese rango (lo usa el botón para refrescar el mes completo).
//
// Solo Misiones. Usa el service role (admin client) para los upserts.

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { syncCloudfleetChecklists } from "@/lib/cloudfleet/sync"
import { IS_MISIONES } from "@/lib/empresa"

export const maxDuration = 120

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
// Tope de seguridad para el rango manual (evita barridos enormes accidentales).
const MAX_DIAS = 62

function hoyARG(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00Z`).getTime()
  const b = new Date(`${hasta}T00:00:00Z`).getTime()
  return Math.floor((b - a) / 86_400_000)
}

export async function POST(request: NextRequest) {
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
  const qDesde = url.searchParams.get("desde")
  const qHasta = url.searchParams.get("hasta")
  const hoy = hoyARG()

  let desde = hoy
  let hasta = hoy
  if (qDesde || qHasta) {
    if (
      !qDesde ||
      !qHasta ||
      !FECHA_RE.test(qDesde) ||
      !FECHA_RE.test(qHasta)
    ) {
      return NextResponse.json(
        { error: "desde/hasta deben tener formato YYYY-MM-DD" },
        { status: 400 },
      )
    }
    if (qDesde > qHasta) {
      return NextResponse.json(
        { error: "desde debe ser <= hasta" },
        { status: 400 },
      )
    }
    if (diasEntre(qDesde, qHasta) > MAX_DIAS) {
      return NextResponse.json(
        { error: `El rango no puede superar ${MAX_DIAS} días` },
        { status: 400 },
      )
    }
    desde = qDesde
    hasta = qHasta
  }

  try {
    const supabase = createAdminClient()
    const result = await syncCloudfleetChecklists(supabase, desde, hasta)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      desde,
      hasta,
      total: result.total,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error sincronizando Cloudfleet"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
