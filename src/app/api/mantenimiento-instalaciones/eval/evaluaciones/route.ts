import { NextResponse, type NextRequest } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"
import { EVAL_SELECT, evaluacionToOut } from "@/lib/mantenimiento/eval"

export const dynamic = "force-dynamic"

// GET — evaluaciones (opcionalmente filtradas por proveedor).
export async function GET(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  const proveedorId = req.nextUrl.searchParams.get("proveedor_id")
  let q = g.supabase
    .from("mant_eval_evaluaciones")
    .select(EVAL_SELECT)
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
  if (proveedorId) q = q.eq("proveedor_id", proveedorId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(evaluacionToOut))
}

// POST — crea una evaluación con sus puntajes por criterio.
export async function POST(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  const sb = g.supabase
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  if (!body.proveedor_id || !body.fecha)
    return NextResponse.json({ error: "Proveedor y fecha son obligatorios" }, { status: 400 })

  const ins = await sb
    .from("mant_eval_evaluaciones")
    .insert({
      proveedor_id: body.proveedor_id,
      fecha: body.fecha,
      evaluador: body.evaluador ?? null,
      observaciones: body.observaciones ?? null,
    })
    .select("id")
    .single()
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })

  const puntajes = (body.puntajes ?? [])
    .filter((p: any) => p.criterio_id)
    .map((p: any) => ({
      evaluacion_id: ins.data.id,
      criterio_id: p.criterio_id,
      puntaje: p.puntaje ?? null,
      comentario: p.comentario ?? null,
    }))
  if (puntajes.length) {
    const e = await sb.from("mant_eval_puntajes").insert(puntajes)
    if (e.error) return NextResponse.json({ error: e.error.message }, { status: 500 })
  }

  const out = await sb.from("mant_eval_evaluaciones").select(EVAL_SELECT).eq("id", ins.data.id).single()
  return NextResponse.json(evaluacionToOut(out.data))
}
