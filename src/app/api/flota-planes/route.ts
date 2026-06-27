import { NextResponse } from "next/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// Origen del backend de flota (herminio-web). Su endpoint /api/pda guarda los
// planes de acción en Vercel Blob, separados por "ámbito" (una bolsa por
// sección). Proxeamos para que dpo-distribuciones use los MISMOS planes que
// herminio-web/flota (mismo Blob), evitando además el bloqueo CORS.
const HERMINIO_URL =
  process.env.HERMINIO_MANTENIMIENTO_URL ?? "https://herminio-web.vercel.app"

// Ámbitos válidos (uno por sección del pilar Flota). Deben existir como
// prefijo en el route /api/pda de herminio-web.
const AMBITOS = new Set([
  "checklist",
  "estandar",
  "combustible",
  "mantenimiento",
  "repuestos",
  "fallas",
])
function ambitoValido(a: string | null): string {
  return a && AMBITOS.has(a) ? a : "checklist"
}

async function guard() {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })
  return null
}

// GET → lista los planes de un ámbito.
export async function GET(req: Request) {
  const blocked = await guard()
  if (blocked) return blocked

  const ambito = ambitoValido(new URL(req.url).searchParams.get("ambito"))
  try {
    const r = await fetch(`${HERMINIO_URL}/api/pda?ambito=${ambito}`, { cache: "no-store" })
    const j = await r.json()
    return NextResponse.json(j, { status: r.ok ? 200 : r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 502 })
  }
}

// POST → crear/editar/borrar un plan en un ámbito.
export async function POST(req: Request) {
  const blocked = await guard()
  if (blocked) return blocked

  try {
    const body = await req.json()
    const payload = { ...body, ambito: ambitoValido(body?.ambito ?? null) }
    const r = await fetch(`${HERMINIO_URL}/api/pda`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    })
    const j = await r.json()
    return NextResponse.json(j, { status: r.ok ? 200 : r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 502 })
  }
}
