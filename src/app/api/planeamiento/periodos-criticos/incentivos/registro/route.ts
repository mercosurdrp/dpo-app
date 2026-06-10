import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

const AMBITOS = ["Choferes", "Ayudantes", "Warehouse"] as const

// GET /registro?anio=2026 → seguimiento de participación/ganadores
export async function GET(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const anio = Number(req.nextUrl.searchParams.get("anio"))
  const supabase = await createClient()
  let q = supabase.from("pc_incentivos_registro").select("*").order("mes", { ascending: true })
  if (Number.isFinite(anio) && anio > 0) q = q.eq("anio", anio)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Bucket privado → URLs firmadas (una sola llamada para todas las fotos)
  const paths = (data ?? []).map((r) => r.foto_path).filter(Boolean) as string[]
  const urlByPath: Record<string, string> = {}
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("reuniones").createSignedUrls(paths, 60 * 60 * 24 * 7)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath[s.path] = s.signedUrl
  }
  const registros = (data ?? []).map((r) => ({
    ...r,
    foto_url: r.foto_path ? urlByPath[r.foto_path] ?? null : null,
  }))
  return NextResponse.json({ registros })
}

// POST /registro → agrega un registro mensual
export async function POST(req: NextRequest) {
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
