import { NextResponse, type NextRequest } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"

export const dynamic = "force-dynamic"

const SELECT =
  "*, pregunta:mant_preguntas(codigo, pregunta, seccion_num, seccion_titulo), proveedor:mant_proveedores(nombre), evidencias:mant_evidencias(id)"

/* eslint-disable @typescript-eslint/no-explicit-any */
function toOut(p: any) {
  const { pregunta, proveedor, evidencias, ...rest } = p
  return {
    ...rest,
    pregunta_codigo: pregunta?.codigo ?? null,
    pregunta_texto: pregunta?.pregunta ?? null,
    seccion_num: pregunta?.seccion_num ?? null,
    seccion_titulo: pregunta?.seccion_titulo ?? null,
    proveedor_nombre: proveedor?.nombre ?? null,
    cantidad_evidencias: evidencias?.length ?? 0,
  }
}

// GET — lista de planes de acción con filtros (estado, pregunta_id, seccion_num).
export async function GET(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  const sp = req.nextUrl.searchParams

  let q = g.supabase
    .from("mant_pdas")
    .select(SELECT)
    .order("fecha_probable", { ascending: true, nullsFirst: false })
    .order("creado_en", { ascending: false })
  const estado = sp.get("estado")
  const preguntaId = sp.get("pregunta_id")
  if (estado) q = q.eq("estado", estado)
  if (preguntaId) q = q.eq("pregunta_id", preguntaId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let filas = (data ?? []).map(toOut)
  const seccion = sp.get("seccion_num")
  if (seccion != null && seccion !== "")
    filas = filas.filter((f) => f.seccion_num === Number(seccion))
  return NextResponse.json(filas)
}

// POST — crea un plan de acción.
export async function POST(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  if (!body.pregunta_id || !body.titulo)
    return NextResponse.json({ error: "Pregunta y título son obligatorios" }, { status: 400 })

  const fila = {
    pregunta_id: body.pregunta_id,
    revision_id: body.revision_id ?? null,
    proveedor_id: body.proveedor_id ?? null,
    titulo: String(body.titulo),
    descripcion: body.descripcion ?? null,
    tipo: body.tipo ?? "reparacion",
    responsable: body.responsable ?? null,
    fecha_probable: body.fecha_probable ?? null,
    avance_pct: Number(body.avance_pct ?? 0),
    estado: body.estado ?? "planificado",
    costo_estimado: body.costo_estimado ?? null,
    costo_ejecutado: body.costo_ejecutado ?? null,
    fecha_ejecucion: body.fecha_ejecucion ?? null,
    rubro: body.rubro ?? null,
  }
  const { data, error } = await g.supabase.from("mant_pdas").insert(fila).select(SELECT).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toOut(data))
}
