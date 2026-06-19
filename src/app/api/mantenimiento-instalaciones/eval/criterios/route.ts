import { NextResponse, type NextRequest } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"

export const dynamic = "force-dynamic"

// GET — criterios de evaluación de proveedores (por defecto solo activos).
export async function GET(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  const incluirInactivos = req.nextUrl.searchParams.get("incluir_inactivos") === "true"
  let q = g.supabase.from("mant_eval_criterios").select("*").order("orden").order("id")
  if (!incluirInactivos) q = q.eq("activo", true)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — alta de criterio. Si no se pasa orden, lo coloca al final.
export async function POST(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  const sb = g.supabase
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  if (!body.texto) return NextResponse.json({ error: "Texto obligatorio" }, { status: 400 })

  let orden = Number(body.orden ?? 0)
  if (!orden) {
    const max = await sb.from("mant_eval_criterios").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle()
    orden = (max.data?.orden ?? 0) + 1
  }
  const { data, error } = await sb
    .from("mant_eval_criterios")
    .insert({ texto: body.texto, descripcion: body.descripcion ?? null, orden, activo: body.activo !== false })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
