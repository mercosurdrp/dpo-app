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

// GET — matriz RACI de mantenimiento.
export async function GET() {
  const g = await guard()
  if (g.error) return g.error
  const { data, error } = await g.supabase
    .from("mant_raci")
    .select("*")
    .order("orden")
    .order("id")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — nueva fila de actividad.
export async function POST(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  if (!body.actividad) return NextResponse.json({ error: "Actividad obligatoria" }, { status: 400 })
  const { data, error } = await g.supabase.from("mant_raci").insert(pick(body)).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
