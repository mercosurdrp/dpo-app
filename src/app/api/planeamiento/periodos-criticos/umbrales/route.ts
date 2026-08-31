import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

// PATCH /api/planeamiento/periodos-criticos/umbrales
//
// Actualiza los targets del calendario. El de volumen no se carga a mano: sale
// de la flota (camiones × HL por camión × % ocupación de bodega) y la base lo
// recalcula sola en `vol_pico`, que es columna generada. Los otros tres
// (clientes, rechazo, ausentismo) sólo agravan la severidad del día crítico.
// Solo admin/admin_rrhh/supervisor.
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
  for (const k of ["camiones", "hl_por_camion", "pct_ocupacion", "clientes", "otif_min", "ausentismo_max"]) {
    if (body[k] != null) patch[k] = Number(body[k])
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
  }
  for (const [k, v] of Object.entries(patch)) {
    if (!Number.isFinite(v)) return NextResponse.json({ error: `${k} no es un número` }, { status: 400 })
  }

  // Rangos: los mismos CHECK del schema, pero con mensaje entendible.
  if (patch.camiones != null && (patch.camiones < 1 || patch.camiones > 200)) {
    return NextResponse.json({ error: "Los camiones deben estar entre 1 y 200" }, { status: 400 })
  }
  if (patch.hl_por_camion != null && (patch.hl_por_camion <= 0 || patch.hl_por_camion > 1000)) {
    return NextResponse.json({ error: "Los HL por camión deben estar entre 1 y 1000" }, { status: 400 })
  }
  if (patch.pct_ocupacion != null && (patch.pct_ocupacion <= 0 || patch.pct_ocupacion > 3)) {
    return NextResponse.json({ error: "La ocupación de bodega debe estar entre 0 y 3 (300%)" }, { status: 400 })
  }
  if (patch.otif_min != null && (patch.otif_min < 0 || patch.otif_min > 1)) {
    return NextResponse.json({ error: "El rechazo máximo debe estar entre 0 y 1" }, { status: 400 })
  }
  if (patch.ausentismo_max != null && (patch.ausentismo_max < 0 || patch.ausentismo_max > 1)) {
    return NextResponse.json({ error: "El ausentismo máximo debe estar entre 0 y 1" }, { status: 400 })
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
