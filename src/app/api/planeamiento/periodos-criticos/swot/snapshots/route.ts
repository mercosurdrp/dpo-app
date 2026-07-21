import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

const MOMENTOS = ["previo", "posterior"] as const

/** Copia embebida de un ítem del FODA vivo. */
interface SnapshotItem {
  categoria: string
  texto: string
  impacto: string
  accion_recomendada: string
}

// GET /api/planeamiento/periodos-criticos/swot/snapshots[?anio=2026]
//
// Lista las fotos congeladas del FODA. Sin ?anio devuelve todas: el selector
// de versión las agrupa por período en el cliente.
export async function GET(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const anioRaw = req.nextUrl.searchParams.get("anio")
  const supabase = await createClient()

  let q = supabase
    .from("pc_swot_snapshots")
    .select("*")
    .order("periodo_anio", { ascending: false })
    .order("fecha_corte", { ascending: true })

  if (anioRaw) {
    const anio = Number(anioRaw)
    if (!Number.isInteger(anio)) {
      return NextResponse.json({ error: "anio inválido" }, { status: 400 })
    }
    q = q.eq("periodo_anio", anio)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshots: data ?? [] })
}

// POST /api/planeamiento/periodos-criticos/swot/snapshots
//
// Congela el FODA vivo COMPLETO como evidencia de un período (R3.4.3). No
// recibe los ítems del cliente: los lee de `pc_swot_items` en el server, así la
// foto es del estado real de la base y no de lo que el navegador tenía en
// pantalla.
//
// Re-congelar el mismo (período, momento) PISA la foto anterior: es corregir
// una evidencia mal tomada, no acumular versiones. Por eso el upsert sobre la
// unique de (periodo_anio, periodo_nombre, momento).
export async function POST(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  let body: {
    periodo_nombre?: string
    periodo_anio?: number
    periodo_fecha_inicio?: string | null
    periodo_fecha_fin?: string | null
    momento?: string
    fecha_corte?: string | null
    nota?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const periodoNombre = (body.periodo_nombre ?? "").trim()
  const periodoAnio = Number(body.periodo_anio)
  const momento = String(body.momento ?? "posterior")

  if (!periodoNombre) {
    return NextResponse.json({ error: "El período es obligatorio" }, { status: 400 })
  }
  if (!Number.isInteger(periodoAnio)) {
    return NextResponse.json({ error: "periodo_anio inválido" }, { status: 400 })
  }
  if (!MOMENTOS.includes(momento as (typeof MOMENTOS)[number])) {
    return NextResponse.json({ error: "momento inválido" }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: vivos, error: errLeer } = await supabase
    .from("pc_swot_items")
    .select("categoria,texto,impacto,accion_recomendada")
    .eq("activo", true)
    .order("categoria", { ascending: true })
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true })

  if (errLeer) {
    return NextResponse.json({ error: errLeer.message }, { status: 500 })
  }

  const items = (vivos ?? []) as SnapshotItem[]
  // Congelar un FODA vacío produciría evidencia que dice "no analizamos nada".
  // Mejor fallar y que el usuario cargue los ítems antes de cerrar el período.
  if (items.length === 0) {
    return NextResponse.json(
      { error: "El FODA está vacío: cargá los ítems antes de congelar el período." },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from("pc_swot_snapshots")
    .upsert(
      {
        periodo_nombre: periodoNombre,
        periodo_anio: periodoAnio,
        periodo_fecha_inicio: body.periodo_fecha_inicio || null,
        periodo_fecha_fin: body.periodo_fecha_fin || null,
        momento,
        fecha_corte: body.fecha_corte || new Date().toISOString().slice(0, 10),
        items,
        nota: (body.nota ?? "").trim(),
        created_by: profile.id,
      },
      { onConflict: "periodo_anio,periodo_nombre,momento" },
    )
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshot: data })
}
