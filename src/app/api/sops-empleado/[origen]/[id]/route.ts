import { NextRequest, NextResponse } from "next/server"
import { getProfile } from "@/lib/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { urlVisorOffice } from "@/lib/abrir-archivo"
import { rutaPdfSop } from "@/lib/sop-puestos"

export const dynamic = "force-dynamic"

const OFFICE = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"])
const VIGENCIA_S = 60 * 10

function extDe(nombre: string | null | undefined): string {
  const m = (nombre ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ""
}

/**
 * Abre un SOP de la biblioteca del portal (/sops) para cualquier usuario
 * logueado. Mismo criterio que /sop/[slug] (el QR de los puestos): si hay PDF
 * generado de la versión vigente va al PDF; si no, Word/PowerPoint al visor
 * de Office y PDF al visor propio, para que se lean en el celular sin
 * descargar nada.
 *
 * origen "a" = dpo_archivos (bucket privado, link firmado corto);
 * origen "s" = tabla sops (bucket público `sops`).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ origen: string; id: string }> },
) {
  const profile = await getProfile()
  if (!profile) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const { origen, id } = await ctx.params
  const supabase = createAdminClient()

  let url: string
  let ext: string

  if (origen === "a") {
    const { data: archivo } = await supabase
      .from("dpo_archivos")
      .select("id, current_version, current_file_path, file_ext, file_name, archivado, deleted_at")
      .eq("id", id)
      .maybeSingle()
    if (!archivo || archivo.archivado || archivo.deleted_at) {
      return new NextResponse("SOP no encontrado.", { status: 404 })
    }

    const storage = supabase.storage.from("dpo-evidencia")
    const pdf = await storage.createSignedUrl(rutaPdfSop(archivo.id, archivo.current_version), VIGENCIA_S)
    if (pdf.data?.signedUrl) {
      return NextResponse.redirect(pdf.data.signedUrl)
    }

    const original = await storage.createSignedUrl(archivo.current_file_path, VIGENCIA_S)
    if (original.error || !original.data) {
      return new NextResponse("No se pudo abrir el SOP.", { status: 500 })
    }
    url = original.data.signedUrl
    ext = String(archivo.file_ext ?? extDe(archivo.file_name)).toLowerCase()
  } else if (origen === "s") {
    const { data: sop } = await supabase
      .from("sops")
      .select("file_path, file_name")
      .eq("id", id)
      .maybeSingle()
    if (!sop) {
      return new NextResponse("SOP no encontrado.", { status: 404 })
    }
    url = supabase.storage.from("sops").getPublicUrl(sop.file_path).data.publicUrl
    ext = extDe(sop.file_name) || extDe(sop.file_path)
  } else {
    return new NextResponse("SOP no encontrado.", { status: 404 })
  }

  if (OFFICE.has(ext)) {
    return NextResponse.redirect(urlVisorOffice(url))
  }
  if (ext === "pdf") {
    return NextResponse.redirect(new URL(`/api/archivos/ver?src=${encodeURIComponent(url)}`, req.url))
  }
  return NextResponse.redirect(url)
}
