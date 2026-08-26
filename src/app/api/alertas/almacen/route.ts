import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { IS_MISIONES } from "@/lib/empresa"
import { correrChequeos } from "@/lib/warehouse/alertas-almacen"

export const dynamic = "force-dynamic"

// Endpoint máquina-a-máquina: pendientes y alertas del pilar ALMACÉN.
// Lo consume el backend Python de deposito-esteban, que lo proxea y valida
// el PIN del lado del servidor. El JS del SPA nunca ve este token ni el PIN.
//
// Vive acá y no en deposito-esteban porque las tablas que mira están detrás
// de RLS y la anon key devuelve [] en todas: hace falta service role.
//
// Las notificaciones NO salen de acá y no salen de ningún lado: el 26-08-2026
// se descartaron el mail y el WhatsApp. La pestaña es el único canal.

export async function GET(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }

  const expected = process.env.ALERTAS_ALMACEN_TOKEN
  const auth = request.headers.get("authorization")
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  try {
    const resultado = await correrChequeos(supabase)
    return NextResponse.json(resultado, {
      // Sin cache: el tablero tiene que mostrar el estado de ahora, y los
      // chequeos son baratos comparados con mostrar un pendiente ya resuelto.
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 },
    )
  }
}
