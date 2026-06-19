import { NextResponse, type NextRequest } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"

export const dynamic = "force-dynamic"

// GET — lista de revisiones (más recientes primero).
export async function GET() {
  const g = await guard()
  if (g.error) return g.error
  const { data, error } = await g.supabase
    .from("mant_revisiones")
    .select("*")
    .order("fecha", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — crea una revisión trimestral. Opcionalmente copia los puntajes de una
// revisión anterior (copiar_de) como punto de partida.
export async function POST(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  const sb = g.supabase

  let body: { periodo?: string; fecha?: string; copiar_de?: number | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const periodo = (body.periodo ?? "").trim()
  const fecha = (body.fecha ?? "").trim()
  if (!periodo || !fecha)
    return NextResponse.json({ error: "Período y fecha son obligatorios" }, { status: 400 })

  const existente = await sb.from("mant_revisiones").select("id").eq("periodo", periodo).maybeSingle()
  if (existente.data)
    return NextResponse.json({ error: `Ya existe una revisión con período "${periodo}"` }, { status: 400 })

  const ins = await sb
    .from("mant_revisiones")
    .insert({ periodo, fecha, cerrada: false })
    .select("*")
    .single()
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })
  const rev = ins.data

  if (body.copiar_de) {
    const prev = await sb
      .from("mant_puntajes")
      .select("pregunta_id, puntaje")
      .eq("revision_id", body.copiar_de)
    if (prev.data?.length) {
      const filas = prev.data.map((p) => ({
        revision_id: rev.id,
        pregunta_id: p.pregunta_id,
        puntaje: p.puntaje,
        comentario: null,
      }))
      await sb.from("mant_puntajes").insert(filas)
    }
  }

  return NextResponse.json(rev)
}
