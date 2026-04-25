import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { invalidateZonasCache, loadZonas } from "@/lib/foxtrot-snapshot/zonas"
import type { ZonasConfig } from "@/lib/foxtrot-snapshot/types"

export const dynamic = "force-dynamic"

export async function GET() {
  await requireAuth()
  const zonas = await loadZonas()
  return NextResponse.json(zonas)
}

export async function POST(req: Request) {
  const profile = await requireAuth()
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Solo admins pueden editar zonas" }, { status: 403 })
  }

  let payload: ZonasConfig
  try {
    payload = (await req.json()) as ZonasConfig
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "payload vacío o inválido" }, { status: 400 })
  }
  for (const [name, z] of Object.entries(payload)) {
    if (!z || typeof z !== "object" || !Array.isArray(z.coords)) {
      return NextResponse.json({ error: `zona ${name} sin coords` }, { status: 400 })
    }
    if (z.coords.length < 3) {
      return NextResponse.json({ error: `zona ${name}: mínimo 3 vértices` }, { status: 400 })
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("foxtrot_zonas").upsert(
    {
      id: 1,
      zonas: payload,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: "id" },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  invalidateZonasCache()
  return NextResponse.json({ ok: true, saved_at: new Date().toISOString() })
}
