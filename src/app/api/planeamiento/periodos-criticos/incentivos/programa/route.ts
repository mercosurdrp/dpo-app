import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const dynamic = "force-dynamic"

const BUCKET = "reuniones"
const PREFIJO = "incentivos-pc"

const cleanFileName = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)

// Bucket privado → URL firmada temporal (se regenera en cada GET, así no expira para el usuario).
const SIGNED_TTL = 60 * 60 * 24 * 7 // 7 días
async function signed(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null) {
  if (!path) return null
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL)
  return data?.signedUrl ?? null
}

// GET → programa de incentivos (singleton) con URLs públicas resueltas
export async function GET() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase.from("pc_incentivos_programa").select("*").eq("id", 1).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    programa: {
      ...data,
      archivo_url: await signed(supabase, data.archivo_path),
      comunicado_url: await signed(supabase, data.comunicado_path),
    },
  })
}

// POST → genera una URL firmada para subir un archivo DIRECTO a Storage desde el
// navegador (bypass del límite de 4.5MB de las funciones serverless). Body JSON:
// { slot: "programa" | "comunicado", nombre }. Devuelve { bucket, path, token }.
export async function POST(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const slot = body?.slot
  if (slot !== "programa" && slot !== "comunicado") {
    return NextResponse.json({ error: "slot inválido" }, { status: 400 })
  }
  const supabase = await createClient()
  const path = `${PREFIJO}/${slot}-${Date.now()}-${cleanFileName(String(body?.nombre || "archivo"))}`
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "No se pudo preparar la subida" }, { status: 500 })
  }
  return NextResponse.json({ bucket: BUCKET, path, token: data.token })
}

// PUT (FormData) → edita el programa, sube PPT y/o evidencia de comunicación.
// Campos: descripcion, periodo, comunicado(bool), comunicado_fecha, comunicado_nota,
//         archivo_programa (File), archivo_comunicado (File). Solo admin/supervisor.
export async function PUT(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const fd = await req.formData()
  const supabase = await createClient()
  const patch: Record<string, unknown> = {}

  if (fd.has("descripcion")) patch.descripcion = String(fd.get("descripcion") ?? "")
  if (fd.has("periodo")) patch.periodo = String(fd.get("periodo") ?? "").trim() || "Diciembre – Febrero"
  if (fd.has("comunicado")) patch.comunicado = String(fd.get("comunicado")) === "true"
  if (fd.has("comunicado_fecha")) {
    const f = String(fd.get("comunicado_fecha") ?? "").trim()
    patch.comunicado_fecha = /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null
  }
  if (fd.has("comunicado_nota")) patch.comunicado_nota = String(fd.get("comunicado_nota") ?? "") || null
  if (fd.has("comunicado_link")) patch.comunicado_link = String(fd.get("comunicado_link") ?? "").trim() || null

  async function subir(file: File, sufijo: string) {
    const path = `${PREFIJO}/${sufijo}-${Date.now()}-${cleanFileName(file.name)}`
    const buf = await file.arrayBuffer()
    const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || "application/octet-stream", upsert: false,
    })
    if (error) throw new Error(`Subiendo ${sufijo}: ${error.message}`)
    return path
  }

  try {
    // Subida directa (bypass 4.5MB): el navegador ya subió a Storage y manda el path.
    const pathProg = fd.get("archivo_path")
    if (typeof pathProg === "string" && pathProg) {
      patch.archivo_path = pathProg
      patch.archivo_nombre = String(fd.get("archivo_nombre") ?? "") || null
    }
    const pathCom = fd.get("comunicado_path")
    if (typeof pathCom === "string" && pathCom) {
      patch.comunicado_path = pathCom
      patch.comunicado_nombre = String(fd.get("comunicado_nombre") ?? "") || null
    }
    // Retrocompat: archivos chicos (<4.5MB) enviados como File en el FormData.
    const fProg = fd.get("archivo_programa")
    if (fProg instanceof File && fProg.size > 0) {
      patch.archivo_path = await subir(fProg, "programa")
      patch.archivo_nombre = fProg.name
    }
    const fCom = fd.get("archivo_comunicado")
    if (fCom instanceof File && fCom.size > 0) {
      patch.comunicado_path = await subir(fCom, "comunicado")
      patch.comunicado_nombre = fCom.name
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error subiendo" }, { status: 500 })
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("pc_incentivos_programa").update(patch).eq("id", 1).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    programa: { ...data, archivo_url: await signed(supabase, data.archivo_path), comunicado_url: await signed(supabase, data.comunicado_path) },
  })
}
