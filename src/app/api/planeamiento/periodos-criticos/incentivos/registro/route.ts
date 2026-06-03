import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

const AMBITOS = ["Choferes", "Ayudantes", "Warehouse"] as const

// GET /registro?anio=2026 → seguimiento de participación/ganadores
export async function GET(req: NextRequest) {
  if (!IS_MISIONES) return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const anio = Number(req.nextUrl.searchParams.get("anio"))
  const supabase = await createClient()
  let q = supabase.from("pc_incentivos_registro").select("*").order("mes", { ascending: true })
  if (Number.isFinite(anio) && anio > 0) q = q.eq("anio", anio)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ registros: data ?? [] })
}

// POST /registro → agrega un registro mensual
export async function POST(req: NextRequest) {
  if (!IS_MISIONES) return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const anio = Number(body.anio)
  const mes = Number(body.mes)
  if (!Number.isFinite(anio) || anio <= 0) return NextResponse.json({ error: "anio inválido" }, { status: 400 })
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) return NextResponse.json({ error: "mes inválido (1-12)" }, { status: 400 })
  const ambito = AMBITOS.includes(body.ambito as (typeof AMBITOS)[number]) ? String(body.ambito) : "Choferes"

  const supabase = await createClient()
  const { data, error } = await supabase.from("pc_incentivos_registro").insert({
    anio, mes, ambito,
    equipo: body.equipo ? String(body.equipo) : null,
    cumplio: typeof body.cumplio === "boolean" ? body.cumplio : null,
    posicion: body.posicion ? String(body.posicion) : null,
    premio: body.premio ? String(body.premio) : null,
    nota: body.nota ? String(body.nota) : null,
    created_by: profile.id,
  }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ registro: data })
}
