import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

const BUCKET = "reuniones"

function cleanFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

// GET /api/planeamiento/periodos-criticos/revision-mensual/[id]/evidencia
//
// Historial de avances/evidencias de una revisión mensual.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pc_revision_evidencias")
    .select("*, autor:profiles(id, nombre)")
    .eq("revision_id", id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resolver la URL pública del archivo (bucket 'reuniones' es público) y
  // aplanar el nombre del autor para el front.
  const evidencias = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const archivo_url = r.archivo_path
      ? supabase.storage.from(BUCKET).getPublicUrl(r.archivo_path).data.publicUrl
      : null
    return {
      id: r.id,
      comentario: r.comentario ?? null,
      archivo_path: r.archivo_path ?? null,
      archivo_url,
      archivo_nombre: r.archivo_nombre ?? null,
      autor_nombre: r.autor?.nombre ?? null,
      created_at: r.created_at,
    }
  })

  return NextResponse.json({ evidencias })
}

// POST /api/planeamiento/periodos-criticos/revision-mensual/[id]/evidencia
//
// Agrega un avance (comentario y/o archivo) al action log de la revisión.
// Archivo al bucket 'reuniones', prefijo 'revisiones-pc/{id}/'.
// Solo admin/admin_rrhh/supervisor.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { id } = await ctx.params
  const formData = await req.formData()
  const comentarioRaw = String(formData.get("comentario") ?? "").trim()
  const comentario = comentarioRaw || null
  const file = formData.get("archivo") as File | null
  const tieneArchivo = file && file instanceof File && file.size > 0

  if (!tieneArchivo && !comentario) {
    return NextResponse.json(
      { error: "Adjuntá un archivo o escribí un comentario" },
      { status: 400 },
    )
  }

  const supabase = await createClient()

  let archivoPath: string | null = null
  let archivoNombre: string | null = null
  if (tieneArchivo) {
    const cleanName = cleanFileName(file.name)
    const path = `revisiones-pc/${id}/v${Date.now()}-${cleanName}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })
    if (upErr) {
      return NextResponse.json({ error: `Subiendo archivo: ${upErr.message}` }, { status: 500 })
    }
    archivoPath = path
    archivoNombre = file.name
  }

  const { data, error } = await supabase
    .from("pc_revision_evidencias")
    .insert({
      revision_id: id,
      comentario,
      archivo_path: archivoPath,
      archivo_nombre: archivoNombre,
      archivo_mime: tieneArchivo ? file.type || null : null,
      archivo_bytes: tieneArchivo ? file.size : null,
      autor_id: profile.id,
    })
    .select("*")
    .single()

  if (error) {
    if (archivoPath) await supabase.storage.from(BUCKET).remove([archivoPath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ evidencia: data })
}
