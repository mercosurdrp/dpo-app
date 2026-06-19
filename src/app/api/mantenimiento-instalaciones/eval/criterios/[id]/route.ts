import { NextResponse, type NextRequest } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"

export const dynamic = "force-dynamic"

// PUT — edita un criterio.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const { data, error } = await g.supabase
    .from("mant_eval_criterios")
    .update({
      texto: body.texto,
      descripcion: body.descripcion ?? null,
      orden: Number(body.orden ?? 0),
      activo: body.activo !== false,
    })
    .eq("id", id)
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — si el criterio ya tiene puntajes históricos, lo desactiva (soft);
// si no, lo borra definitivamente.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const sb = g.supabase

  const usados = await sb
    .from("mant_eval_puntajes")
    .select("id", { count: "exact", head: true })
    .eq("criterio_id", id)
  if ((usados.count ?? 0) > 0) {
    const { error } = await sb.from("mant_eval_criterios").update({ activo: false }).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, desactivado: true })
  }
  const { error } = await sb.from("mant_eval_criterios").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, desactivado: false })
}
