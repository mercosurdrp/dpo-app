import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

// PATCH /api/planeamiento/periodos-criticos/config
//
// Actualiza el año vigente del calendario. Es lo único que queda en pc_config:
// el criterio de día crítico es uno solo (volumen sobre la capacidad de
// distribución, en pc_umbrales) y ya no hay pesos ni score que configurar.
// Sólo admin/admin_rrhh/supervisor.
export async function PATCH(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const anio = Number(body.anio_vigente)
  if (!Number.isInteger(anio) || anio < 2024 || anio > 2030) {
    return NextResponse.json({ error: "anio_vigente debe ser un año entre 2024 y 2030" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_config")
    .update({ anio_vigente: anio, updated_by: profile.id })
    .eq("id", 1)
    .select("id, anio_vigente")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
