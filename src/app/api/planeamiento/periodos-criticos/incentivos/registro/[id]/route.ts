import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

const AMBITOS = ["Choferes", "Ayudantes", "Warehouse"] as const

// PUT /registro/[id] → edita un registro de participación
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { id } = await ctx.params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (body.ambito !== undefined) {
    if (!AMBITOS.includes(body.ambito as (typeof AMBITOS)[number])) return NextResponse.json({ error: "ámbito inválido" }, { status: 400 })
    patch.ambito = body.ambito
  }
  if (body.mes !== undefined) {
    const mes = Number(body.mes)
    if (!Number.isFinite(mes) || mes < 1 || mes > 12) return NextResponse.json({ error: "mes inválido" }, { status: 400 })
    patch.mes = mes
  }
  if (body.anio !== undefined) patch.anio = Number(body.anio)
  if (body.equipo !== undefined) patch.equipo = body.equipo ? String(body.equipo) : null
  if (body.cumplio !== undefined) patch.cumplio = typeof body.cumplio === "boolean" ? body.cumplio : null
  if (body.posicion !== undefined) patch.posicion = body.posicion ? String(body.posicion) : null
  if (body.premio !== undefined) patch.premio = body.premio ? String(body.premio) : null
  if (body.nota !== undefined) patch.nota = body.nota ? String(body.nota) : null

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.from("pc_incentivos_registro").update(patch).eq("id", id).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ registro: data })
}

// DELETE /registro/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }
  const { id } = await ctx.params
  const supabase = await createClient()
  const { error } = await supabase.from("pc_incentivos_registro").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
