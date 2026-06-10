import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

// PATCH /api/planeamiento/periodos-criticos/config
//
// Actualiza pesos / umbrales / año vigente. Sólo admin/admin_rrhh/supervisor.
// Valida que los pesos sumen ~1 antes de mandarlo: el CHECK del schema da
// error genérico y queremos un mensaje claro para la UI.
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

  const patch: Record<string, number> = {}
  for (const k of ["w_vol", "w_otif", "w_aus", "umbral_alto", "umbral_medio", "anio_vigente", "hl_p90_2025"]) {
    if (body[k] != null) patch[k] = Number(body[k])
  }

  if (patch.w_vol != null || patch.w_otif != null || patch.w_aus != null) {
    const supabase = await createClient()
    const { data: actual } = await supabase.from("pc_config").select("*").eq("id", 1).single()
    const w_vol = patch.w_vol ?? Number(actual?.w_vol)
    const w_otif = patch.w_otif ?? Number(actual?.w_otif)
    const w_aus = patch.w_aus ?? Number(actual?.w_aus)
    if (Math.abs(w_vol + w_otif + w_aus - 1) > 0.001) {
      return NextResponse.json(
        { error: `Los 3 pesos deben sumar 1 exacto (suma actual: ${(w_vol + w_otif + w_aus).toFixed(3)})` },
        { status: 400 },
      )
    }
  }

  if (patch.umbral_alto != null && patch.umbral_medio != null && patch.umbral_alto <= patch.umbral_medio) {
    return NextResponse.json({ error: "umbral_alto debe ser > umbral_medio" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_config")
    .update({ ...patch, updated_by: profile.id })
    .eq("id", 1)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
