import { NextResponse } from "next/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Origen del estándar de flota (herminio-web). Su endpoint /api/estandar
// devuelve la planilla digerida (datos.json) + el padrón patente→sucursal de
// Cloudfleet en una sola llamada. Proxeamos server-side para evitar CORS.
const HERMINIO_URL =
  process.env.HERMINIO_MANTENIMIENTO_URL ?? "https://herminio-web.vercel.app"

export async function GET() {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible en este tenant" }, { status: 404 })

  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })

  try {
    const r = await fetch(`${HERMINIO_URL}/api/estandar`, { cache: "no-store" })
    const j = await r.json()
    return NextResponse.json(j, { status: r.ok ? 200 : r.status })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String((e as Error)?.message || e) },
      { status: 502 }
    )
  }
}
