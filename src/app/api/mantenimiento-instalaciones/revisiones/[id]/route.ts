import { NextResponse, type NextRequest } from "next/server"
import { guard, BUCKET } from "@/lib/mantenimiento/guard"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// PATCH — cerrar / reabrir la revisión.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  let body: { accion?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  if (body.accion !== "cerrar" && body.accion !== "reabrir")
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 })

  const { error } = await g.supabase
    .from("mant_revisiones")
    .update({ cerrada: body.accion === "cerrar" })
    .eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — borra la revisión, sus puntajes (cascade) y los PDAs creados desde
// ella junto con sus evidencias (filas cascade + archivos en Storage).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const sb = g.supabase

  const pdas = await sb.from("mant_pdas").select("id").eq("revision_id", id)
  const pdaIds = (pdas.data ?? []).map((p) => p.id)
  if (pdaIds.length) {
    const evs = await sb.from("mant_evidencias").select("storage_path").in("pda_id", pdaIds)
    const paths = (evs.data ?? []).map((e) => e.storage_path)
    if (paths.length) await createAdminClient().storage.from(BUCKET).remove(paths)
    await sb.from("mant_pdas").delete().in("id", pdaIds)
  }

  const { error } = await sb.from("mant_revisiones").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
