import { NextResponse, type NextRequest } from "next/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// VLC/HL (DPO Planeamiento 5.1): costo logístico variable por hectolitro.
// VLC = Entrega + Flota + Acarreo (PxQ) ; HL = HL distribuido (ventas_diarias).
// Editable porque el costo del PxQ requiere validación humana.

interface MesVlc {
  mes: string
  vlc_total: number
  hl: number
  nota: string | null
}

export async function GET() {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })

  const supabase = await createClient()
  const [{ data: meses, error: e1 }, { data: meta, error: e2 }] = await Promise.all([
    supabase
      .from("vlc_hl_misiones")
      .select("mes,vlc_total,hl,nota")
      .order("mes", { ascending: true }),
    supabase.from("vlc_hl_meta_misiones").select("objetivo_vlc_hl").eq("id", 1).maybeSingle(),
  ])
  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 })
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    meses: meses ?? [],
    objetivo: meta?.objetivo_vlc_hl ?? 0,
  })
}

export async function POST(req: NextRequest) {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })

  let body: { meses?: MesVlc[]; objetivo?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const supabase = await createClient()
  if (Array.isArray(body.meses) && body.meses.length > 0) {
    const filas = body.meses.map((m) => ({
      mes: m.mes,
      vlc_total: Number(m.vlc_total) || 0,
      hl: Number(m.hl) || 0,
      nota: m.nota ?? null,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from("vlc_hl_misiones").upsert(filas, { onConflict: "mes" })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (body.objetivo != null) {
    const { error } = await supabase
      .from("vlc_hl_meta_misiones")
      .upsert({ id: 1, objetivo_vlc_hl: Number(body.objetivo) || 0, updated_at: new Date().toISOString() }, { onConflict: "id" })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
