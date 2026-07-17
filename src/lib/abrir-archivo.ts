// Helper único para abrir archivos subidos desde cualquier módulo.
//
// JPG/PNG/GIF/WEBP/PDF de nuestro Storage se abren a través del visor
// /api/archivos/ver, que los sirve con el Content-Type correcto y
// Content-Disposition inline → se visualizan en el navegador en vez de
// descargarse (los archivos suelen quedar guardados como
// application/octet-stream, que el navegador siempre descarga).
//
// Word/Excel/PowerPoint se abren en el visor web de Microsoft Office
// (view.officeapps.live.com), que renderiza el documento en el navegador a
// partir de la URL firmada — sin descargar. Es solo lectura: para editar
// sigue el flujo descargar → editar → "Nueva versión".
//
// El resto (CSV, ZIP, etc.) y cualquier URL externa se abren directo,
// manteniendo el comportamiento actual: el navegador los descarga.

const VISUALIZABLE = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "pdf",
])

const OFFICE = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"])

function extensionDe(valor: string): string {
  let pathname = valor
  try {
    if (valor.includes("://")) pathname = new URL(valor).pathname
  } catch {
    // no es una URL válida; uso el string tal cual
  }
  pathname = pathname.split("?")[0]
  const m = pathname.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ""
}

function esDeNuestroStorage(url: string): boolean {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!base) return false
    return new URL(url).host === new URL(base).host
  } catch {
    return false
  }
}

/**
 * Abre un archivo en una pestaña nueva. Si es una imagen o PDF guardado en
 * nuestro Storage, lo enruta por el visor para que se vea inline; en cualquier
 * otro caso lo abre directo (el navegador decide, normalmente descargar).
 *
 * @param url    URL del archivo (signed URL o pública de Supabase, o externa).
 * @param nombre Nombre original del archivo (opcional). Mejora la detección de
 *               la extensión cuando la URL no la trae en el path.
 */
export function abrirArchivo(url: string, nombre?: string): void {
  if (typeof window === "undefined" || !url) return
  const ext = extensionDe(nombre || url)
  if (VISUALIZABLE.has(ext) && esDeNuestroStorage(url)) {
    window.open(
      `/api/archivos/ver?src=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer",
    )
    return
  }
  if (OFFICE.has(ext)) {
    window.open(urlVisorOffice(url), "_blank", "noopener,noreferrer")
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}

/** URL del visor web de Microsoft Office para un archivo accesible por URL. */
export function urlVisorOffice(url: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
}
