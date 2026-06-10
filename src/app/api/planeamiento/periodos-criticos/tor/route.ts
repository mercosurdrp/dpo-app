import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

const SECCIONES = ["participante", "regla", "entrada", "salida", "kpi", "temario"] as const
const TIPO_DEFAULT = "logistica-ventas"

// GET /api/planeamiento/periodos-criticos/tor?tipo=logistica-ventas
//
// Devuelve el Book de Actas (TOR) de la reunión + sus items por sección.
export async function GET(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const tipo = req.nextUrl.searchParams.get("tipo") ?? TIPO_DEFAULT
  const supabase = await createClient()

  const [{ data: tor }, { data: items, error }] = await Promise.all([
    supabase.from("reuniones_tor").select("*").eq("tipo", tipo).maybeSingle(),
    supabase
      .from("reuniones_tor_items")
      .select("*")
      .eq("tipo", tipo)
      .order("seccion", { ascending: true })
      .order("orden", { ascending: true }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tor: tor ?? null, items: items ?? [] })
}

// PUT /api/planeamiento/periodos-criticos/tor
//
// Upsert de la cabecera del TOR + reemplazo completo de items.
// Solo admin/admin_rrhh/supervisor.
export async function PUT(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: {
    tipo?: string
    objetivos?: string
    dueno?: string
    ubicacion?: string
    dia_horario?: string
    frecuencia?: string
    items?: Array<{ seccion: string; orden: number; texto: string; responsable?: string | null }>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const tipo = body.tipo ?? TIPO_DEFAULT
  const supabase = await createClient()

  // 1) Upsert cabecera
  const { error: torErr } = await supabase.from("reuniones_tor").upsert(
    {
      tipo,
      objetivos: body.objetivos ?? "",
      dueno: body.dueno ?? "",
      ubicacion: body.ubicacion ?? "",
      dia_horario: body.dia_horario ?? "",
      frecuencia: body.frecuencia ?? "",
      updated_by: profile.id,
    },
    { onConflict: "tipo" },
  )
  if (torErr) return NextResponse.json({ error: torErr.message }, { status: 500 })

  // 2) Reemplazo de items (si vienen en el body)
  if (Array.isArray(body.items)) {
    const limpios = body.items
      .filter((it) => SECCIONES.includes(it.seccion as (typeof SECCIONES)[number]))
      .filter((it) => (it.texto ?? "").trim() !== "")
      .map((it, i) => ({
        tipo,
        seccion: it.seccion,
        orden: Number.isFinite(it.orden) ? it.orden : i,
        texto: it.texto.trim(),
        responsable:
          it.seccion === "temario" && it.responsable ? it.responsable.trim() : null,
      }))

    const { error: delErr } = await supabase
      .from("reuniones_tor_items")
      .delete()
      .eq("tipo", tipo)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    if (limpios.length > 0) {
      const { error: insErr } = await supabase.from("reuniones_tor_items").insert(limpios)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  // 3) Devolver estado actualizado
  const [{ data: tor }, { data: items }] = await Promise.all([
    supabase.from("reuniones_tor").select("*").eq("tipo", tipo).maybeSingle(),
    supabase
      .from("reuniones_tor_items")
      .select("*")
      .eq("tipo", tipo)
      .order("seccion", { ascending: true })
      .order("orden", { ascending: true }),
  ])

  return NextResponse.json({ tor: tor ?? null, items: items ?? [] })
}
