// Refresh manual de los KPIs de Adherencia al Simulador (punto 2.3), disparado
// desde la UI por un admin/supervisor. A diferencia del cron (auth por
// CRON_SECRET), se autentica con la sesión del usuario. Solo Misiones.

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { syncAdherenciaSimulador } from "@/lib/sync/adherencia-simulador"
import { IS_MISIONES } from "@/lib/empresa"

export const maxDuration = 120

export async function POST(request: NextRequest) {
  if (!IS_MISIONES) {
    return NextResponse.json({ error: "Solo disponible en Misiones" }, { status: 400 })
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
  const anioParam = url.searchParams.get("anio")
  const anio = anioParam && /^\d{4}$/.test(anioParam) ? Number(anioParam) : undefined

  try {
    const supabase = createAdminClient()
    const result = await syncAdherenciaSimulador(supabase, anio)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error sincronizando adherencia"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
