import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// PUT /api/planeamiento/periodos-criticos/planes-accion
// Body: { codigo: string, descripcion: string, plan_texto: string }
//
// Upsert por código. Permite editar el texto del plan de acción asociado a
// cada combinación de triggers ("AAAA", "AAA", "AA", "A", "").
export async function PUT(req: NextRequest) {
  if (!IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: { codigo?: string; descripcion?: string; plan_texto?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const codigo = (body.codigo ?? "").trim()
  const descripcion = (body.descripcion ?? "").trim()
  const plan_texto = (body.plan_texto ?? "").trim()
  if (codigo.length > 4 || !plan_texto) {
    return NextResponse.json({ error: "codigo (≤4 chars) y plan_texto requeridos" }, { status: 400 })
  }
  // Solo aceptamos códigos del set válido para evitar polución
  if (!/^A{0,4}$/.test(codigo)) {
    return NextResponse.json({ error: 'codigo debe ser "", "A", "AA", "AAA" o "AAAA"' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_planes_accion")
    .upsert({ codigo, descripcion, plan_texto, updated_by: profile.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data })
}
