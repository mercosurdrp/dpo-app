import { NextResponse, type NextRequest } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"

export const dynamic = "force-dynamic"

// GET — puntajes cargados en esta revisión.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const { data, error } = await g.supabase
    .from("mant_puntajes")
    .select("pregunta_id, puntaje, comentario")
    .eq("revision_id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PUT — upsert del puntaje/comentario de una pregunta en la revisión.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const sb = g.supabase

  let body: { pregunta_id?: number; puntaje?: string | null; comentario?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  if (!body.pregunta_id)
    return NextResponse.json({ error: "pregunta_id requerido" }, { status: 400 })

  const rev = await sb.from("mant_revisiones").select("cerrada").eq("id", id).maybeSingle()
  if (!rev.data) return NextResponse.json({ error: "Revisión inexistente" }, { status: 404 })
  if (rev.data.cerrada)
    return NextResponse.json({ error: "Revisión cerrada, no se pueden modificar puntajes" }, { status: 400 })

  const { error } = await sb.from("mant_puntajes").upsert(
    {
      revision_id: Number(id),
      pregunta_id: body.pregunta_id,
      puntaje: body.puntaje ?? null,
      comentario: body.comentario ?? null,
    },
    { onConflict: "revision_id,pregunta_id" },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
