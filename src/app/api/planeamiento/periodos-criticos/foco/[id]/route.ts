import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

const PRIORIDADES = ["alta", "media", "baja"] as const
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

// PUT /foco/[id] → edita un período de foco. Solo admin/supervisor.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { id } = await ctx.params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim()
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 })
    patch.nombre = nombre
  }
  if (body.fecha_inicio !== undefined) {
    if (!FECHA_RE.test(String(body.fecha_inicio)))
      return NextResponse.json({ error: "fecha_inicio inválida" }, { status: 400 })
    patch.fecha_inicio = body.fecha_inicio
  }
  if (body.fecha_fin !== undefined) {
    if (!FECHA_RE.test(String(body.fecha_fin)))
      return NextResponse.json({ error: "fecha_fin inválida" }, { status: 400 })
    patch.fecha_fin = body.fecha_fin
  }
  if (
    patch.fecha_inicio !== undefined &&
    patch.fecha_fin !== undefined &&
    String(patch.fecha_fin) < String(patch.fecha_inicio)
  ) {
    return NextResponse.json({ error: "La fecha fin no puede ser anterior al inicio" }, { status: 400 })
  }
  if (body.foco !== undefined) patch.foco = String(body.foco)
  if (body.prioridad !== undefined) {
    if (!PRIORIDADES.includes(body.prioridad as (typeof PRIORIDADES)[number]))
      return NextResponse.json({ error: "prioridad inválida" }, { status: 400 })
    patch.prioridad = body.prioridad
  }
  if (body.anio !== undefined) {
    const anio = Number(body.anio)
    if (!Number.isFinite(anio) || anio <= 0)
      return NextResponse.json({ error: "anio inválido" }, { status: 400 })
    patch.anio = anio
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_periodos_foco")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ periodo: data })
}

// DELETE /foco/[id] → elimina un período de foco. Solo admin/supervisor.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { id } = await ctx.params
  const supabase = await createClient()
  const { error } = await supabase.from("pc_periodos_foco").delete().eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
