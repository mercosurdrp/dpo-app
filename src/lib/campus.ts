// Campus de Capacitaciones: constantes y helpers puros.
//
// ⚠️ El Campus NO es el módulo /capacitaciones. Aquél es un evento dictado
// (fecha, instructor, asistencia, examen); éste es una biblioteca de consulta
// libre organizada por pilar, sin registro de quién vio qué.
//
// Los 7 pilares viven acá y no en la tabla `pilares` a propósito: sus UUID
// difieren entre Pampeana y Misiones, sus colores hex no son los de DESIGN.md,
// y el Campus tiene que mostrar las 7 secciones aunque la base esté vacía.
// Mismo criterio que `dpo_archivos.pilar_codigo`.

export type CampusPilarCodigo =
  | "seguridad"
  | "gente"
  | "entrega"
  | "flota"
  | "almacen"
  | "gestion"
  | "planeamiento"

export interface CampusPilar {
  codigo: CampusPilarCodigo
  nombre: string
  emoji: string
  /** Clases Tailwind LITERALES: v4 no ve las que se arman por concatenación. */
  dot: string
  texto: string
  borde: string
  fondoSuave: string
}

// El orden es el de la auditoría DPO y el color el de DESIGN.md.
export const CAMPUS_PILARES: readonly CampusPilar[] = [
  {
    codigo: "seguridad",
    nombre: "Seguridad",
    emoji: "🦺",
    dot: "bg-red-500",
    texto: "text-red-600",
    borde: "border-red-200",
    fondoSuave: "bg-red-50",
  },
  {
    codigo: "gente",
    nombre: "Gente",
    emoji: "👥",
    dot: "bg-amber-500",
    texto: "text-amber-600",
    borde: "border-amber-200",
    fondoSuave: "bg-amber-50",
  },
  {
    codigo: "entrega",
    nombre: "Entrega",
    emoji: "🚚",
    dot: "bg-blue-500",
    texto: "text-blue-600",
    borde: "border-blue-200",
    fondoSuave: "bg-blue-50",
  },
  {
    codigo: "flota",
    nombre: "Flota",
    emoji: "🚛",
    dot: "bg-orange-500",
    texto: "text-orange-600",
    borde: "border-orange-200",
    fondoSuave: "bg-orange-50",
  },
  {
    codigo: "almacen",
    nombre: "Almacén",
    emoji: "📦",
    dot: "bg-emerald-500",
    texto: "text-emerald-600",
    borde: "border-emerald-200",
    fondoSuave: "bg-emerald-50",
  },
  {
    codigo: "gestion",
    nombre: "Gestión",
    emoji: "📊",
    dot: "bg-violet-500",
    texto: "text-violet-600",
    borde: "border-violet-200",
    fondoSuave: "bg-violet-50",
  },
  {
    codigo: "planeamiento",
    nombre: "Planeamiento",
    emoji: "📅",
    dot: "bg-cyan-500",
    texto: "text-cyan-600",
    borde: "border-cyan-200",
    fondoSuave: "bg-cyan-50",
  },
] as const

export function esPilarValido(slug: string): slug is CampusPilarCodigo {
  return CAMPUS_PILARES.some((p) => p.codigo === slug)
}

export function pilarPorCodigo(codigo: string): CampusPilar | null {
  return CAMPUS_PILARES.find((p) => p.codigo === codigo) ?? null
}

// ── Materiales ──────────────────────────────────────────────────────────────

export type CampusMaterialTipo = "video" | "ppt" | "sop" | "pdf" | "flyer" | "otro"
export type CampusMaterialOrigen = "archivo" | "link"

export const CAMPUS_TIPOS: readonly { valor: CampusMaterialTipo; label: string; emoji: string }[] = [
  { valor: "video", label: "Video", emoji: "🎥" },
  { valor: "ppt", label: "Presentación (PPT)", emoji: "📊" },
  { valor: "sop", label: "SOP / Procedimiento", emoji: "📄" },
  { valor: "pdf", label: "PDF", emoji: "📕" },
  { valor: "flyer", label: "Flyer", emoji: "🖼️" },
  { valor: "otro", label: "Otro material", emoji: "📎" },
] as const

export function labelTipo(tipo: string): string {
  return CAMPUS_TIPOS.find((t) => t.valor === tipo)?.label ?? "Otro material"
}

export function emojiTipo(tipo: string): string {
  return CAMPUS_TIPOS.find((t) => t.valor === tipo)?.emoji ?? "📎"
}

/** Bucket de Storage donde vive el material subido. */
export const CAMPUS_BUCKET = "campus"

/** Tope de subida: más que esto va por link (YouTube / Drive). */
export const CAMPUS_MAX_BYTES = 200 * 1024 * 1024

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function extension(nombre: string): string {
  const limpio = nombre.split("?")[0]
  const m = limpio.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ""
}

/**
 * El navegador no siempre completa `file.type` (pasa con .mov y .mp4 en
 * Windows). Si el objeto queda en el bucket como application/octet-stream, el
 * <video> no reproduce: por eso adivinamos el MIME por extensión.
 */
export function mimePorExtension(nombre: string): string {
  const MIMES: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    pdf: "application/pdf",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  }
  return MIMES[extension(nombre)] ?? "application/octet-stream"
}

/** Tipo sugerido al elegir un archivo o pegar un link, para no tipear de más. */
export function tipoSugerido(nombreOUrl: string): CampusMaterialTipo {
  const v = nombreOUrl.toLowerCase()
  if (/youtu\.?be|vimeo|drive\.google\.com\/file/.test(v)) return "video"
  const ext = extension(v)
  if (["mp4", "webm", "mov", "m4v", "avi", "mkv"].includes(ext)) return "video"
  if (["ppt", "pptx"].includes(ext)) return "ppt"
  if (ext === "pdf") return "pdf"
  if (["doc", "docx"].includes(ext)) return "sop"
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "flyer"
  return "otro"
}

/** ID de un video de YouTube en cualquiera de sus formas de link. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, "")
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0]
      return id || null
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v")
      if (v) return v
      const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?]+)/)
      if (m) return m[2]
    }
    return null
  } catch {
    return null
  }
}

/** Un archivo de Google Drive se puede embeber con /preview. */
export function driveEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.endsWith("drive.google.com")) return null
    const m = u.pathname.match(/\/file\/d\/([^/]+)/)
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`
    const id = u.searchParams.get("id")
    if (id) return `https://drive.google.com/file/d/${id}/preview`
    return null
  } catch {
    return null
  }
}

export function esUrlValida(url: string): boolean {
  return /^https?:\/\/.+/i.test(url.trim())
}
