/**
 * Cron: abre un plan RMD PENDIENTE por cada cliente con una puntuación 1-4 que
 * no tiene plan que la cubra. Ver `@/lib/rmd/abrir-planes`.
 *
 * Corre todos los días 10:00 AR (las puntuaciones entran con el sync del lunes,
 * pero así también levanta las que se carguen a mano o con atraso).
 *
 * Auth (igual que /api/radar-rechazos/cron):
 *   cron          = Vercel cron (Bearer CRON_SECRET + UA vercel-cron)
 *   manual-bearer = curl con Bearer CRON_SECRET
 *   manual-session= sesión admin/supervisor
 *
 * ?dry=1 devuelve lo que abriría sin escribir. ?ping=1 health-check.
 */
import { NextRequest, NextResponse } from "next/server"
import { IS_MISIONES } from "@/lib/empresa"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { abrirPlanesRmdPendientes } from "@/lib/rmd/abrir-planes"

export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET?.trim()
const ALLOWED_ROLES = ["admin", "supervisor"] as const

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("ping") === "1") {
    return NextResponse.json({ status: "ok", service: "rmd-abrir-planes" })
  }
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}

async function run(request: NextRequest) {
  // Por ahora solo Pampeana: en Misiones los planes RMD no se trabajan desde la app.
  if (IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "not-pampeana" })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const userAgent = request.headers.get("user-agent") ?? ""
  const bearerMatch = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`

  if (!bearerMatch) {
    if (authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "CRON_SECRET inválido" }, { status: 401 })
    }
    const sessionClient = await createClient()
    const { data: claims } = await sessionClient.auth.getClaims()
    const userId = claims?.claims?.sub
    if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const { data: profile } = await sessionClient
      .from("profiles").select("role").eq("id", userId).single()
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }
  }

  const source = bearerMatch
    ? (/^vercel-cron/i.test(userAgent) ? "cron" : "manual-bearer")
    : "manual-session"
  const dryRun = request.nextUrl.searchParams.get("dry") === "1"

  try {
    const res = await abrirPlanesRmdPendientes(createAdminClient(), { dryRun })
    console.log(
      `[rmd-abrir-planes] source=${source} dry=${dryRun} casos=${res.casos} ` +
      `sin_cubrir=${res.casosSinCubrir} planes=${res.planes.length}`,
    )
    return NextResponse.json({ success: true, source, ...res })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error"
    console.error("[rmd-abrir-planes]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
