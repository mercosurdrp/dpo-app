import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { urlVisorOffice } from "@/lib/abrir-archivo"
import { SOP_PUESTOS, rutaPdfSop } from "@/lib/sop-puestos"

export const dynamic = "force-dynamic"

const BUCKET = "dpo-evidencia"
const OFFICE = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"])
// Lo que dura el link firmado. El operario escanea y abre en el momento.
const VIGENCIA_S = 60 * 10

// Ruta pública (está en PUBLIC_PATHS del middleware): es lo que abre el QR
// pegado en cada puesto. No expone el bucket: firma un link corto a la
// versión vigente del SOP y redirige. Si hay PDF generado para esa versión,
// va al PDF (se ve directo en el celular); si no, al visor de Office con el
// docx.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  const puesto = SOP_PUESTOS.find((p) => p.slug === slug)
  if (!puesto) {
    return new NextResponse("Puesto desconocido", { status: 404 })
  }

  const supabase = createAdminClient()
  const { data: filas, error } = await supabase
    .from("dpo_archivos")
    .select("id, titulo, current_version, current_file_path, file_ext")
    .eq("categoria", "SOP")
    .eq("archivado", false)
    .eq("pilar_codigo", puesto.pilar_codigo)
    .eq("punto_codigo", puesto.punto_codigo)
    .ilike("titulo", `%${puesto.titulo_contiene}%`)
    .order("updated_at", { ascending: false })
    .limit(1)

  const archivo = filas?.[0]
  if (error || !archivo) {
    return new NextResponse(
      `No hay SOP cargado para ${puesto.nombre} (${puesto.pilar_codigo} ${puesto.punto_codigo}).`,
      { status: 404 },
    )
  }

  const storage = supabase.storage.from(BUCKET)

  const pdf = await storage.createSignedUrl(
    rutaPdfSop(archivo.id, archivo.current_version),
    VIGENCIA_S,
  )
  if (pdf.data?.signedUrl) {
    return NextResponse.redirect(pdf.data.signedUrl)
  }

  const original = await storage.createSignedUrl(archivo.current_file_path, VIGENCIA_S)
  if (original.error || !original.data) {
    return new NextResponse("No se pudo abrir el SOP.", { status: 500 })
  }

  const ext = String(archivo.file_ext ?? "").toLowerCase()
  const destino = OFFICE.has(ext)
    ? urlVisorOffice(original.data.signedUrl)
    : original.data.signedUrl
  return NextResponse.redirect(destino)
}
