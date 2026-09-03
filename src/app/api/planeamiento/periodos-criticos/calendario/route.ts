import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

// GET /api/planeamiento/periodos-criticos/calendario?anio=2026
//
// Devuelve el calendario anual día a día (CRITICO cuando el volumen supera la
// capacidad de distribución, más las variables de contexto) y el año vigente.
// Lo consume la página /planeamiento/periodos-criticos (R3.4.1).
//
// La vista v_pc_calendario_dia siempre devuelve el año configurado en
// pc_config.anio_vigente. Si el caller pide otro, se actualiza pc_config y se
// vuelve a consultar — esto es seguro porque la app sólo se usa por un equipo
// chico (Planeamiento Misiones) y permite cambiar de año sin recrear la vista.
export async function GET(req: NextRequest) {

  const profile = await getProfile()
  if (!profile) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const supabase = await createClient()

  const anioParam = req.nextUrl.searchParams.get("anio")
  const anio = anioParam && /^\d{4}$/.test(anioParam) ? Number(anioParam) : null

  // Leer config; si el año pedido difiere y el usuario tiene permiso, actualizarlo
  const { data: cfg, error: cfgErr } = await supabase
    .from("pc_config")
    .select("*")
    .eq("id", 1)
    .single()

  if (cfgErr || !cfg) {
    return NextResponse.json({ error: "Configuración no inicializada" }, { status: 500 })
  }

  if (anio && anio !== cfg.anio_vigente) {
    const puedeEscribir = ["admin", "admin_rrhh", "supervisor"].includes(profile.role)
    if (!puedeEscribir) {
      return NextResponse.json(
        { error: `Solo admin/supervisor puede cambiar el año vigente (${cfg.anio_vigente})` },
        { status: 403 },
      )
    }
    const { error: upErr } = await supabase
      .from("pc_config")
      .update({ anio_vigente: anio })
      .eq("id", 1)
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }
    cfg.anio_vigente = anio
  }

  const { data: dias, error: diasErr } = await supabase
    .from("v_pc_calendario_dia")
    .select("*")
    .order("fecha", { ascending: true })

  if (diasErr) {
    return NextResponse.json({ error: diasErr.message }, { status: 500 })
  }

  return NextResponse.json({
    config: { anio: cfg.anio_vigente },
    dias: dias ?? [],
  })
}
