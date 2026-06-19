import { NextResponse, type NextRequest } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"

export const dynamic = "force-dynamic"

const CAMPOS = ["nombre", "tipo_servicio", "alcance", "direccion", "telefono", "email", "contacto", "notas"] as const

/* eslint-disable @typescript-eslint/no-explicit-any */
function pick(body: any) {
  const out: Record<string, any> = {}
  for (const c of CAMPOS) out[c] = body[c] ?? null
  return out
}

// GET — base de datos de proveedores (orden alfabético).
export async function GET() {
  const g = await guard()
  if (g.error) return g.error
  const { data, error } = await g.supabase
    .from("mant_proveedores")
    .select("*")
    .order("nombre", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — alta de proveedor.
export async function POST(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  if (!body.nombre) return NextResponse.json({ error: "Nombre obligatorio" }, { status: 400 })
  const { data, error } = await g.supabase.from("mant_proveedores").insert(pick(body)).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
