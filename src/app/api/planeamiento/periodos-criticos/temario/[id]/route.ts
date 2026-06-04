import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// PUT → edita un ítem del temario (sobre todo el `url`). Solo admin/supervisor.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!IS_MISIONES) return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { id } = await ctx.params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (body.url !== undefined) patch.url = body.url ? String(body.url).trim() : null
  if (body.titulo !== undefined) {
    const t = String(body.titulo).trim()
    if (!t) return NextResponse.json({ error: "El título no puede estar vacío" }, { status: 400 })
    patch.titulo = t
  }
  if (body.bloque !== undefined) patch.bloque = String(body.bloque).trim()
  if (body.orden !== undefined) patch.orden = Number(body.orden)
  if (body.activo !== undefined) patch.activo = Boolean(body.activo)
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.from("pc_temario_items").update(patch).eq("id", id).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE → soft delete (activo=false). Solo admin/supervisor.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!IS_MISIONES) return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }
  const { id } = await ctx.params
  const supabase = await createClient()
  const { error } = await supabase.from("pc_temario_items").update({ activo: false }).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
