import { NextResponse } from "next/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createClient } from "@/lib/supabase/server"

// Bucket privado de evidencias de planes de acción (DPO Planeamiento 2.4).
export const BUCKET = "mantenimiento-instalaciones"

type GuardOk = { error: null; supabase: Awaited<ReturnType<typeof createClient>> }
type GuardErr = { error: NextResponse; supabase: null }

// Gate común de las rutas de Mantenimiento de Instalaciones:
// solo Misiones (IS_MISIONES) + usuario autenticado. Devuelve el cliente
// Supabase server-side ya listo, o una respuesta de error.
export async function guard(): Promise<GuardOk | GuardErr> {
  if (!IS_MISIONES)
    return {
      error: NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 }),
      supabase: null,
    }
  const profile = await getProfile()
  if (!profile)
    return {
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
      supabase: null,
    }
  return { error: null, supabase: await createClient() }
}
