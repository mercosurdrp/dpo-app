import { NextResponse, type NextRequest } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"

export const dynamic = "force-dynamic"

const CAMPOS = ["actividad", "grupo", "contratista", "coord_hsma", "analista_hsma", "analista_mantenimiento", "jefe_cd"] as const

/* eslint-disable @typescript-eslint/no-explicit-any */
function pick(body: any) {
  const out: Record<string, any> = {}
  for (const c of CAMPOS) out[c] = body[c] ?? (c === "grupo" ? "mantenimiento" : null)
  out.orden = Number(body.orden ?? 0)
  return out
}

// PUT — edita una fila RACI.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const { data, error } = await g.supabase.from("mant_raci").update(pick(body)).eq("id", id).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — borra una fila RACI.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const { error } = await g.supabase.from("mant_raci").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
