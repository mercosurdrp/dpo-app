import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

// GET → próximos períodos de FOCO (los que el equipo definió en Períodos
// Críticos) que aún no terminaron, para el alerta en la reunión logística-ventas.
// Devuelve también `hoy` (fecha ARG) para que el front calcule "en X días".
export async function GET() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  // hoy en horario Argentina (UTC-3)
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_periodos_foco")
    .select("id, anio, nombre, fecha_inicio, fecha_fin, prioridad, foco")
    .gte("fecha_fin", hoy)
    .order("fecha_inicio", { ascending: true })
    .limit(8)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ hoy, periodos: data ?? [] })
}
