import { NextResponse, type NextRequest } from "next/server"
import { guard, BUCKET } from "@/lib/mantenimiento/guard"
import { createAdminClient } from "@/lib/supabase/admin"

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

// PUT — edita un plan. Para pasar a "ejecutado"/"cerrado" exige al menos una evidencia.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const sb = g.supabase

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  if (body.estado === "ejecutado" || body.estado === "cerrado") {
    const ev = await sb.from("mant_evidencias").select("id", { count: "exact", head: true }).eq("pda_id", id)
    if ((ev.count ?? 0) === 0)
      return NextResponse.json(
        { error: `Para marcar como "${body.estado}" debés subir al menos una evidencia` },
        { status: 400 },
      )
  }

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
    actualizado_en: new Date().toISOString(),
  }
  const { data, error } = await sb.from("mant_pdas").update(fila).eq("id", id).select(SELECT).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toOut(data))
}

// DELETE — borra el plan y sus evidencias (filas cascade + archivos en Storage).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const sb = g.supabase

  const evs = await sb.from("mant_evidencias").select("storage_path").eq("pda_id", id)
  const paths = (evs.data ?? []).map((e) => e.storage_path)
  if (paths.length) await createAdminClient().storage.from(BUCKET).remove(paths)

  const { error } = await sb.from("mant_pdas").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
