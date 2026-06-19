import { NextResponse, type NextRequest } from "next/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// Plan de servicios logísticos por clúster (DPO Planeamiento 4.2 · R4.2.3).
// Reglas de inventario / ruteo / frecuencia editables y persistidas por clúster.

interface PlanFila {
  cluster: string
  prioridad_inventario: string
  prioridad_ruteo: string
  frecuencia: string | null
  drop_size_min: string | null
  ventana_entrega: string | null
  foco_servicio: string | null
  orden: number
}

const COLS =
  "cluster, prioridad_inventario, prioridad_ruteo, frecuencia, drop_size_min, ventana_entrega, foco_servicio, orden"

export async function GET() {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("cluster_plan_logistico_misiones")
    .select(COLS)
    .order("orden", { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, plan: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })

  let body: { plan?: PlanFila[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const plan = body.plan
  if (!Array.isArray(plan) || plan.length === 0)
    return NextResponse.json({ ok: false, error: "Plan vacío" }, { status: 400 })

  const filas = plan.map((p) => ({
    cluster: String(p.cluster),
    prioridad_inventario: String(p.prioridad_inventario ?? "Media"),
    prioridad_ruteo: String(p.prioridad_ruteo ?? "Media"),
    frecuencia: p.frecuencia ?? null,
    drop_size_min: p.drop_size_min ?? null,
    ventana_entrega: p.ventana_entrega ?? null,
    foco_servicio: p.foco_servicio ?? null,
    orden: Number(p.orden ?? 0),
    updated_at: new Date().toISOString(),
  }))

  const supabase = await createClient()
  const { error } = await supabase
    .from("cluster_plan_logistico_misiones")
    .upsert(filas, { onConflict: "cluster" })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
