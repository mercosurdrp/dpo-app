import { NextResponse } from "next/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// Origen del backend de flota (herminio-web). Su endpoint /api/repuestos/catalogo
// guarda la lista editable de repuestos del taller en Vercel Blob (mismo patrón
// versionado que los movimientos). Proxeamos para usar el MISMO catálogo que
// herminio-web (mismo Blob), evitando el bloqueo CORS entre los dos dominios.
const HERMINIO_URL =
  process.env.HERMINIO_MANTENIMIENTO_URL ?? "https://herminio-web.vercel.app"

async function guard() {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })
  return null
}

// GET → lista el catálogo de repuestos.
export async function GET() {
  const blocked = await guard()
  if (blocked) return blocked

  try {
    const r = await fetch(`${HERMINIO_URL}/api/repuestos/catalogo`, { cache: "no-store" })
    const j = await r.json()
    return NextResponse.json(j, { status: r.ok ? 200 : r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 502 })
  }
}

// POST → crear/editar/borrar un repuesto del catálogo. Reenvía el body tal cual.
export async function POST(req: Request) {
  const blocked = await guard()
  if (blocked) return blocked

  try {
    const body = await req.json()
    const r = await fetch(`${HERMINIO_URL}/api/repuestos/catalogo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    })
    const j = await r.json()
    return NextResponse.json(j, { status: r.ok ? 200 : r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 502 })
  }
}
