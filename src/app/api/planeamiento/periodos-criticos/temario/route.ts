import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// GET → ítems del temario de la reunión logística-ventas
export async function GET() {
  if (!IS_MISIONES) return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_temario_items").select("*").eq("activo", true).order("orden", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

// POST → agrega un ítem (bloque, titulo, url?). Solo admin/supervisor.
export async function POST(req: NextRequest) {
  if (!IS_MISIONES) return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }
  const bloque = String(body.bloque ?? "").trim()
  const titulo = String(body.titulo ?? "").trim()
  if (!bloque || !titulo) return NextResponse.json({ error: "bloque y titulo son obligatorios" }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.from("pc_temario_items").insert({
    bloque, titulo,
    url: body.url ? String(body.url).trim() : null,
    orden: Number.isFinite(Number(body.orden)) ? Number(body.orden) : 900,
  }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
