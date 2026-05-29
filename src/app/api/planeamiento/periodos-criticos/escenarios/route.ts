import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// GET  → lista escenarios (últimos 50)
// POST → guarda escenario simulado del tab Simulador
export async function GET() {
  if (!IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_escenarios")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ escenarios: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const nombre = String(body.nombre ?? "").trim()
  const fecha_base = String(body.fecha_base ?? "").trim()
  if (!nombre || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_base)) {
    return NextResponse.json({ error: "nombre y fecha_base son requeridos" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_escenarios")
    .insert({
      nombre,
      descripcion: body.descripcion ? String(body.descripcion) : null,
      fecha_base,
      delta_volumen: Number(body.delta_volumen ?? 0),
      delta_otif: Number(body.delta_otif ?? 0),
      delta_ausentismo: Number(body.delta_ausentismo ?? 0),
      resultado_score: body.resultado_score != null ? Number(body.resultado_score) : null,
      resultado_nivel: body.resultado_nivel ? String(body.resultado_nivel) : null,
      created_by: profile.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ escenario: data })
}
