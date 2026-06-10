import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

const BUCKET = "reuniones"
const cleanFileName = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)

// POST /registro/[id]/foto (FormData: foto) → sube/actualiza la foto del ganador
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { id } = await ctx.params
  const fd = await req.formData()
  const file = fd.get("foto")
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Adjuntá una imagen" }, { status: 400 })
  }

  const supabase = await createClient()
  const path = `incentivos-pc/ganadores/${id}-${Date.now()}-${cleanFileName(file.name)}`
  const buf = await file.arrayBuffer()
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type || "image/jpeg", upsert: false,
  })
  if (upErr) return NextResponse.json({ error: `Subiendo foto: ${upErr.message}` }, { status: 500 })

  const { data, error } = await supabase
    .from("pc_incentivos_registro")
    .update({ foto_path: path, foto_nombre: file.name })
    .eq("id", id).select("*").single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7)
  return NextResponse.json({ registro: { ...data, foto_url: signed?.signedUrl ?? null } })
}
