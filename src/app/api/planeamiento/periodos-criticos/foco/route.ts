import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

const PRIORIDADES = ["alta", "media", "baja"] as const
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

// GET  /foco?anio=2026  → períodos de foco del año (los que define el equipo)
// POST /foco            → crea un período de foco
export async function GET(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const anio = Number(req.nextUrl.searchParams.get("anio"))
  const supabase = await createClient()
  let q = supabase
    .from("pc_periodos_foco")
    .select("*")
    .order("fecha_inicio", { ascending: true })
  if (Number.isFinite(anio) && anio > 0) q = q.eq("anio", anio)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ periodos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const nombre = String(body.nombre ?? "").trim()
  const anio = Number(body.anio)
  const fecha_inicio = String(body.fecha_inicio ?? "").trim()
  const fecha_fin = String(body.fecha_fin ?? "").trim()
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 })
  if (!Number.isFinite(anio) || anio <= 0)
    return NextResponse.json({ error: "anio inválido" }, { status: 400 })
  if (!FECHA_RE.test(fecha_inicio) || !FECHA_RE.test(fecha_fin))
    return NextResponse.json({ error: "fechas inválidas (YYYY-MM-DD)" }, { status: 400 })
  if (fecha_fin < fecha_inicio)
    return NextResponse.json({ error: "La fecha fin no puede ser anterior al inicio" }, { status: 400 })

  const prioridad = PRIORIDADES.includes(body.prioridad as (typeof PRIORIDADES)[number])
    ? (body.prioridad as string)
    : "media"

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_periodos_foco")
    .insert({
      anio,
      nombre,
      fecha_inicio,
      fecha_fin,
      foco: body.foco ? String(body.foco) : "",
      prioridad,
      origen: body.origen ? String(body.origen) : null,
      created_by: profile.id,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ periodo: data })
}
