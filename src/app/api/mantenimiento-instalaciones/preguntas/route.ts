import { NextResponse } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"

export const dynamic = "force-dynamic"

// GET /api/mantenimiento-instalaciones/preguntas — banco de 36 preguntas del checklist.
export async function GET() {
  const g = await guard()
  if (g.error) return g.error
  const { data, error } = await g.supabase
    .from("mant_preguntas")
    .select("*")
    .order("orden", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
