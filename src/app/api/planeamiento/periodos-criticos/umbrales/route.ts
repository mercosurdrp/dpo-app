import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

// PATCH /api/planeamiento/periodos-criticos/umbrales
//
// Actualiza los 6 umbrales del modelo Mercosur (volumen PICO/ALTO/MEDIO,
// clientes, OTIF mínimo, ausentismo máximo) y el min_triggers que define
// cuántas "A" hacen CRITICO. Solo admin/admin_rrhh/supervisor.
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
  for (const k of ["vol_pico", "vol_alto", "vol_medio", "clientes", "otif_min", "ausentismo_max", "min_triggers"]) {
    if (body[k] != null) patch[k] = Number(body[k])
  }

  // Validar coherencia de volumen antes de mandarlo (el CHECK del schema da
  // error genérico)
  if (patch.vol_pico != null || patch.vol_alto != null || patch.vol_medio != null) {
    const supabase = await createClient()
    const { data: actual } = await supabase.from("pc_umbrales").select("*").eq("id", 1).single()
    const vp = patch.vol_pico ?? Number(actual?.vol_pico)
    const va = patch.vol_alto ?? Number(actual?.vol_alto)
    const vm = patch.vol_medio ?? Number(actual?.vol_medio)
    if (!(vp >= va && va >= vm)) {
      return NextResponse.json(
        { error: `Los umbrales de volumen deben cumplir PICO ≥ ALTO ≥ MEDIO (actual: ${vp}/${va}/${vm})` },
        { status: 400 },
      )
    }
  }

  if (patch.min_triggers != null && (patch.min_triggers < 1 || patch.min_triggers > 4)) {
    return NextResponse.json({ error: "min_triggers debe estar entre 1 y 4" }, { status: 400 })
  }
  if (patch.otif_min != null && (patch.otif_min < 0 || patch.otif_min > 1)) {
    return NextResponse.json({ error: "otif_min debe estar entre 0 y 1" }, { status: 400 })
  }
  if (patch.ausentismo_max != null && (patch.ausentismo_max < 0 || patch.ausentismo_max > 1)) {
    return NextResponse.json({ error: "ausentismo_max debe estar entre 0 y 1" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_umbrales")
    .update({ ...patch, updated_by: profile.id })
    .eq("id", 1)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ umbrales: data })
}
