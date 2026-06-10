import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

// GET /api/planeamiento/periodos-criticos/revision-mensual?anio=2026
//
// Devuelve las revisiones mensuales del año + las reuniones logística-ventas
// disponibles para asociar (selector del dialog).
export async function GET(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const anio = Number(req.nextUrl.searchParams.get("anio")) || new Date().getFullYear()
  const supabase = await createClient()

  const [{ data: revisiones, error }, { data: reuniones }] = await Promise.all([
    supabase
      .from("pc_revisiones_mensuales")
      .select(
        "id, anio, mes, reunion_id, conclusiones, periodos_revisados, estado, realizada_at, realizada_por, reuniones(fecha)",
      )
      .eq("anio", anio)
      .order("mes", { ascending: true }),
    supabase
      .from("reuniones")
      .select("id, fecha")
      .eq("tipo", "logistica-ventas")
      .gte("fecha", `${anio}-01-01`)
      .lte("fecha", `${anio}-12-31`)
      .order("fecha", { ascending: false }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ anio, revisiones: revisiones ?? [], reuniones: reuniones ?? [] })
}

// POST /api/planeamiento/periodos-criticos/revision-mensual
//
// Registra (o actualiza) la revisión del plan de períodos críticos de un mes.
// Upsert por (anio, mes). Solo admin/admin_rrhh/supervisor.
export async function POST(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: {
    anio?: number
    mes?: number
    reunion_id?: string | null
    conclusiones?: string
    periodos_revisados?: unknown[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const anio = Number(body.anio)
  const mes = Number(body.mes)
  if (!anio || !mes || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "anio/mes inválidos" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_revisiones_mensuales")
    .upsert(
      {
        anio,
        mes,
        reunion_id: body.reunion_id || null,
        conclusiones: (body.conclusiones ?? "").trim(),
        periodos_revisados: Array.isArray(body.periodos_revisados)
          ? body.periodos_revisados
          : [],
        estado: "realizada",
        realizada_por: profile.id,
        realizada_at: new Date().toISOString(),
      },
      { onConflict: "anio,mes" },
    )
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ revision: data })
}
