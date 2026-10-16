// Helper único para abrir archivos subidos desde cualquier módulo.
//
// JPG/PNG/GIF/WEBP/PDF de nuestro Storage se abren a través del visor
// /api/archivos/ver, que los sirve con el Content-Type correcto y
// Content-Disposition inline → se visualizan en el navegador en vez de
// descargarse (los archivos suelen quedar guardados como
// application/octet-stream, que el navegador siempre descarga).
//
// Word/Excel de nuestro Storage se convierten a HTML en el servidor
// (/api/archivos/office, con SheetJS y mammoth) y se ven en el navegador sin
// descargar. Antes iban al visor web de Microsoft (view.officeapps.live.com),
// que el 16/10/2026 dejó de abrir nuestros archivos; queda sólo para URLs
// externas y como alternativa para PowerPoint. Es solo lectura: para editar
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

/** URL final con la que se abre un archivo: visor propio, visor de Office o directa. */
export function urlParaAbrir(url: string, nombre?: string): string {
  const ext = extensionDe(nombre || url)
  if (VISUALIZABLE.has(ext) && esDeNuestroStorage(url)) {
    return `/api/archivos/ver?src=${encodeURIComponent(url)}`
  }
  if (OFFICE.has(ext)) {
    // Los Office de nuestro Storage se convierten a HTML en /api/archivos/office
    // (el visor de Microsoft dejó de abrirlos, 16/10/2026). Los externos siguen
    // yendo al visor de Microsoft.
    if (esDeNuestroStorage(url)) {
      const qs = new URLSearchParams({ src: url })
      if (nombre) qs.set("nombre", nombre)
      return `/api/archivos/office?${qs.toString()}`
    }
    return urlVisorOffice(url)
  }
  return url
}

/**
 * Abre un archivo en una pestaña nueva. Si es una imagen o PDF guardado en
 * nuestro Storage, lo enruta por el visor para que se vea inline; en cualquier
 * otro caso lo abre directo (el navegador decide, normalmente descargar).
 *
 * OJO: si antes de llamar hubo un `await` (p. ej. pedir la URL firmada al
 * servidor), el bloqueador de popups puede comerse la pestaña. En ese caso
 * usar `abrirVentanaPrevia()` ANTES del await y `abrirArchivoEn()` después.
 *
 * @param url    URL del archivo (signed URL o pública de Supabase, o externa).
 * @param nombre Nombre original del archivo (opcional). Mejora la detección de
 *               la extensión cuando la URL no la trae en el path.
 */
export function abrirArchivo(url: string, nombre?: string): void {
  if (typeof window === "undefined" || !url) return
  window.open(urlParaAbrir(url, nombre), "_blank", "noopener,noreferrer")
}

/**
 * Abre una pestaña vacía de forma SINCRÓNICA (dentro del click del usuario),
 * para que el bloqueador de popups no la frene. Devuelve la ventana o null si
 * igual la bloquearon. Después de resolver la URL, completar con
 * `abrirArchivoEn(ventana, url, nombre)`.
 */
export function abrirVentanaPrevia(): Window | null {
  if (typeof window === "undefined") return null
  const w = window.open("about:blank", "_blank")
  if (w) {
    try {
      w.opener = null
      w.document.title = "Abriendo archivo…"
      w.document.body.innerHTML =
        '<p style="font-family:sans-serif;color:#444;padding:24px">Abriendo archivo…</p>'
    } catch {
      // Si no se puede escribir en la pestaña, no pasa nada.
    }
  }
  return w
}

/**
 * Navega una pestaña abierta con `abrirVentanaPrevia()` al archivo. Si la
 * pestaña no existe (bloqueada), cae a `abrirArchivo` como último recurso.
 */
export function abrirArchivoEn(
  ventana: Window | null,
  url: string,
  nombre?: string,
): void {
  if (!url) {
    cerrarVentanaPrevia(ventana)
    return
  }
  const destino = urlParaAbrir(url, nombre)
  if (ventana && !ventana.closed) {
    ventana.location.href = destino
    return
  }
  abrirArchivo(url, nombre)
}

/** Cierra la pestaña previa si la operación falló. */
export function cerrarVentanaPrevia(ventana: Window | null): void {
  try {
    if (ventana && !ventana.closed) ventana.close()
  } catch {
    // ignorar
  }
}

/**
 * Descarga un archivo (lo guarda en la PC en vez de abrirlo). Usar con la
 * `urlDescarga` de getDownloadUrl, que ya trae Content-Disposition: attachment.
 * Se navega con un <a> clickeado en vez de window.open: después de un await,
 * window.open queda bloqueado por el bloqueador de popups de la mayoría de
 * los navegadores.
 */
export function descargarArchivo(url: string): void {
  if (typeof document === "undefined" || !url) return
  const a = document.createElement("a")
  a.href = url
  a.target = "_blank"
  a.rel = "noopener noreferrer"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** URL del visor web de Microsoft Office para un archivo accesible por URL. */
export function urlVisorOffice(url: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
}
