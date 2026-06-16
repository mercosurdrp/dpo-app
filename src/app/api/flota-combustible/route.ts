import { NextResponse } from "next/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"
// Margen para los reintentos de Cloudfleet del lado de herminio-web (la primera
// carga arma el histórico de combustible en varias páginas).
export const maxDuration = 300

// Origen del dashboard de flota (herminio-web). Su endpoint /api/combustible es
// público y saca las cargas de Cloudfleet (cacheadas en Blob).
const HERMINIO_URL =
  process.env.HERMINIO_MANTENIMIENTO_URL ?? "https://herminio-web.vercel.app"

// GET → proxea el dashboard de combustible de herminio-web. Server-side para
// evitar el bloqueo CORS entre los dos dominios: el front de dpo-distribuciones
// le pega a este endpoint (mismo origen) y reenviamos a herminio-web. Sólo
// Misiones (la flota es de Misiones). El endpoint origen es incremental: puede
// devolver `parcial: true` y el cliente vuelve a pedir con `seguir=1` hasta
// completar; `rebuild=1` fuerza re-armar el histórico.
export async function GET(req: Request) {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible en este tenant" }, { status: 404 })

  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rebuild = searchParams.get("rebuild") === "1"
  const seguir = searchParams.get("seguir") === "1"

  const qs = new URLSearchParams()
  if (rebuild) qs.set("rebuild", "1")
  if (seguir) qs.set("seguir", "1")

  try {
    const r = await fetch(`${HERMINIO_URL}/api/combustible?${qs.toString()}`, {
      cache: "no-store",
    })
    const j = await r.json()
    return NextResponse.json(j, { status: r.ok ? 200 : r.status })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String((e as Error)?.message || e) },
      { status: 502 }
    )
  }
}
