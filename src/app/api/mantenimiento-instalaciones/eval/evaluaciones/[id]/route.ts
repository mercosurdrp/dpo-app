import { NextResponse, type NextRequest } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"
import { EVAL_SELECT, evaluacionToOut } from "@/lib/mantenimiento/eval"

export const dynamic = "force-dynamic"

// GET — una evaluación con sus puntajes.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const { data, error } = await g.supabase.from("mant_eval_evaluaciones").select(EVAL_SELECT).eq("id", id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "No encontrada" }, { status: 404 })
  return NextResponse.json(evaluacionToOut(data))
}

// PUT — edita la evaluación y reemplaza sus puntajes.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const sb = g.supabase
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const upd = await sb
    .from("mant_eval_evaluaciones")
    .update({
      proveedor_id: body.proveedor_id,
      fecha: body.fecha,
      evaluador: body.evaluador ?? null,
      observaciones: body.observaciones ?? null,
    })
    .eq("id", id)
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 })

  await sb.from("mant_eval_puntajes").delete().eq("evaluacion_id", id)
  const puntajes = (body.puntajes ?? [])
    .filter((p: any) => p.criterio_id)
    .map((p: any) => ({
      evaluacion_id: Number(id),
      criterio_id: p.criterio_id,
      puntaje: p.puntaje ?? null,
      comentario: p.comentario ?? null,
    }))
  if (puntajes.length) await sb.from("mant_eval_puntajes").insert(puntajes)

  const out = await sb.from("mant_eval_evaluaciones").select(EVAL_SELECT).eq("id", id).single()
  return NextResponse.json(evaluacionToOut(out.data))
}

// DELETE — borra la evaluación (puntajes cascade).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const { error } = await g.supabase.from("mant_eval_evaluaciones").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
