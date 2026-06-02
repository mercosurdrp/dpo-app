import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

const CATEGORIAS = ["F", "O", "D", "A"] as const
const IMPACTOS = ["alto", "medio", "bajo"] as const

// GET /api/planeamiento/periodos-criticos/swot
//
// Lista todos los items FODA activos (documento continuo). El FODA es
// transversal a los años — el tag de período es informativo, no filtra.
export async function GET() {
  if (!IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_swot_items")
    .select("*")
    .eq("activo", true)
    .order("categoria", { ascending: true })
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

// POST /api/planeamiento/periodos-criticos/swot
//
// Crea un item FODA. Solo admin/admin_rrhh/supervisor.
export async function POST(req: NextRequest) {
  if (!IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: {
    categoria?: string
    texto?: string
    impacto?: string
    accion_recomendada?: string
    periodo_nombre?: string | null
    periodo_anio?: number | null
    periodo_fecha_inicio?: string | null
    periodo_fecha_fin?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const categoria = String(body.categoria ?? "")
  const texto = (body.texto ?? "").trim()
  const impacto = String(body.impacto ?? "medio")
  if (!CATEGORIAS.includes(categoria as (typeof CATEGORIAS)[number])) {
    return NextResponse.json({ error: "categoria inválida" }, { status: 400 })
  }
  if (!texto) {
    return NextResponse.json({ error: "El texto es obligatorio" }, { status: 400 })
  }
  if (!IMPACTOS.includes(impacto as (typeof IMPACTOS)[number])) {
    return NextResponse.json({ error: "impacto inválido" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_swot_items")
    .insert({
      categoria,
      texto,
      impacto,
      accion_recomendada: (body.accion_recomendada ?? "").trim(),
      periodo_nombre: body.periodo_nombre || null,
      periodo_anio: body.periodo_anio || null,
      periodo_fecha_inicio: body.periodo_fecha_inicio || null,
      periodo_fecha_fin: body.periodo_fecha_fin || null,
      created_by: profile.id,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
