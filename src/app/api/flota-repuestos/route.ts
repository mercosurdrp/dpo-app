import { NextResponse } from "next/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// Origen del backend de flota (herminio-web). Su endpoint /api/repuestos guarda
// los MOVIMIENTOS de stock del taller (ingresos/salidas) en Vercel Blob.
// Proxeamos para que dpo-distribuciones use el MISMO stock que herminio-web
// (mismo Blob), evitando además el bloqueo CORS entre los dos dominios.
const HERMINIO_URL =
  process.env.HERMINIO_MANTENIMIENTO_URL ?? "https://herminio-web.vercel.app"

async function guard() {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })
  return null
}

// GET → lista los movimientos de stock.
export async function GET() {
  const blocked = await guard()
  if (blocked) return blocked

  try {
    const r = await fetch(`${HERMINIO_URL}/api/repuestos`, { cache: "no-store" })
    const j = await r.json()
    return NextResponse.json(j, { status: r.ok ? 200 : r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 502 })
  }
}

// POST → crear/editar/borrar un movimiento. Reenvía el body tal cual.
export async function POST(req: Request) {
  const blocked = await guard()
  if (blocked) return blocked

  try {
    const body = await req.json()
    const r = await fetch(`${HERMINIO_URL}/api/repuestos`, {
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
