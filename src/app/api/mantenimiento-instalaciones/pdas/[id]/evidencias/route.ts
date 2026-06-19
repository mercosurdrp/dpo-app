import { NextResponse, type NextRequest } from "next/server"
import { guard, BUCKET } from "@/lib/mantenimiento/guard"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

const SIGNED_TTL = 60 * 60 * 24 * 7 // 7 días

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120)
}

// GET — evidencias del plan, con URL firmada para verlas/descargarlas.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const { data, error } = await g.supabase
    .from("mant_evidencias")
    .select("*")
    .eq("pda_id", id)
    .order("subida_en", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const admin = createAdminClient()
  const out = await Promise.all(
    (data ?? []).map(async (e) => {
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(e.storage_path, SIGNED_TTL)
      return {
        id: e.id,
        nombre_original: e.nombre_original,
        descripcion: e.descripcion,
        subida_en: e.subida_en,
        url: signed?.signedUrl ?? null,
      }
    }),
  )
  return NextResponse.json(out)
}

// POST — sube un archivo de evidencia (multipart) al bucket privado.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await ctx.params
  const sb = g.supabase

  const form = await req.formData()
  const archivo = form.get("archivo")
  const descripcion = (form.get("descripcion") as string) || null
  if (!(archivo instanceof File))
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 })

  const path = `${id}/${crypto.randomUUID()}-${sanitize(archivo.name || "evidencia")}`
  const admin = createAdminClient()
  const up = await admin.storage.from(BUCKET).upload(path, archivo, {
    contentType: archivo.type || "application/octet-stream",
    upsert: false,
  })
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })

  const ins = await sb
    .from("mant_evidencias")
    .insert({
      pda_id: Number(id),
      storage_path: path,
      nombre_original: archivo.name || "evidencia",
      descripcion,
    })
    .select("id")
    .single()
  if (ins.error) {
    await admin.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: ins.error.message }, { status: 500 })
  }
  return NextResponse.json({ id: ins.data.id })
}
