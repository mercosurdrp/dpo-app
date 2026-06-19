import { NextResponse, type NextRequest } from "next/server"
import { guard, BUCKET } from "@/lib/mantenimiento/guard"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// DELETE — borra una evidencia (fila + archivo en Storage).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const sb = g.supabase

  const ev = await sb.from("mant_evidencias").select("storage_path").eq("id", id).maybeSingle()
  if (ev.data?.storage_path)
    await createAdminClient().storage.from(BUCKET).remove([ev.data.storage_path])

  const { error } = await sb.from("mant_evidencias").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
