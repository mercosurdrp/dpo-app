// Sincronización manual de Cloudfleet disparada desde la UI (botón "Sync hoy"
// en la reunión de logística de Misiones). A diferencia de
// /api/cloudfleet/cron-sync (auth por CRON_SECRET, lo dispara Vercel), este
// endpoint se autentica con la sesión del usuario y exige rol editor.
// Sincroniza SOLO el día de hoy (hora ARG) — pensado para refrescar las
// liberaciones recién cargadas durante la matinal.
//
// Solo Misiones. Usa el service role (admin client) para los upserts.

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { syncCloudfleetChecklists } from "@/lib/cloudfleet/sync"
import { IS_MISIONES } from "@/lib/empresa"

export const maxDuration = 120

function hoyARG(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

export async function POST() {
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

  const hoy = hoyARG()
  try {
    const supabase = createAdminClient()
    const result = await syncCloudfleetChecklists(supabase, hoy, hoy)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json({ success: true, fecha: hoy, total: result.total })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error sincronizando Cloudfleet"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
