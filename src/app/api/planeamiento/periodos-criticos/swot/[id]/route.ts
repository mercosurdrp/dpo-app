import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

const CATEGORIAS = ["F", "O", "D", "A"] as const
const IMPACTOS = ["alto", "medio", "bajo"] as const

// PUT /api/planeamiento/periodos-criticos/swot/[id]
//
// Edita un item FODA. Cambiar `categoria` = "mover" el item entre cuadrantes
// (el espíritu del documento continuo del manual). Solo admin/supervisor.
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { id } = await ctx.params

  let body: {
    categoria?: string
    texto?: string
    impacto?: string
    accion_recomendada?: string
    periodo_nombre?: string | null
    periodo_anio?: number | null
    periodo_fecha_inicio?: string | null
    periodo_fecha_fin?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.categoria !== undefined) {
    if (!CATEGORIAS.includes(body.categoria as (typeof CATEGORIAS)[number])) {
      return NextResponse.json({ error: "categoria inválida" }, { status: 400 })
    }
    patch.categoria = body.categoria
  }
  if (body.texto !== undefined) {
    const texto = body.texto.trim()
    if (!texto) return NextResponse.json({ error: "El texto es obligatorio" }, { status: 400 })
    patch.texto = texto
  }
  if (body.impacto !== undefined) {
    if (!IMPACTOS.includes(body.impacto as (typeof IMPACTOS)[number])) {
      return NextResponse.json({ error: "impacto inválido" }, { status: 400 })
    }
    patch.impacto = body.impacto
  }
  if (body.accion_recomendada !== undefined) {
    patch.accion_recomendada = body.accion_recomendada.trim()
  }
  if (body.periodo_nombre !== undefined) patch.periodo_nombre = body.periodo_nombre || null
  if (body.periodo_anio !== undefined) patch.periodo_anio = body.periodo_anio || null
  if (body.periodo_fecha_inicio !== undefined)
    patch.periodo_fecha_inicio = body.periodo_fecha_inicio || null
  if (body.periodo_fecha_fin !== undefined)
    patch.periodo_fecha_fin = body.periodo_fecha_fin || null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_swot_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE /api/planeamiento/periodos-criticos/swot/[id]
//
// Soft delete (activo = false). Solo admin/supervisor.
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { id } = await ctx.params
  const supabase = await createClient()
  const { error } = await supabase
    .from("pc_swot_items")
    .update({ activo: false })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
