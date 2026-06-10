import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

// DELETE /api/planeamiento/periodos-criticos/escenarios/[id]
//
// Borra un escenario guardado del Simulador. La tabla pc_escenarios no tiene
// columna `activo` → delete real. RLS write = FOR ALL TO authenticated, mismo
// criterio que el POST (cualquier usuario autenticado puede gestionarlos).
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { id } = await ctx.params
  const supabase = await createClient()
  const { error } = await supabase.from("pc_escenarios").delete().eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
