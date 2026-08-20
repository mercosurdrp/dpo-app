"use server"

// Lectura del estado de la inspección edilicia mensual, que vive en la app
// externa "Plan de Mantenimiento Edilicio".
//
// A diferencia del resto de la integración (ver mantenimiento-edilicio.ts),
// esto es sólo lectura y el endpoint no pide token, así que alcanza con la URL
// pública y no hace falta configurar nada para que la reunión muestre el dato.

const URL_POR_DEFECTO = "https://plan-mantenimiento-edilicio.vercel.app"

const TIMEOUT_MS = 4000

export interface SeccionInspeccion {
  seccion_num: number
  seccion_titulo: string
  adherencia_pct: number
  items: number
}

export interface EstadoInspeccion {
  periodo: string
  existe: boolean
  /** no_generada | pendiente | en_curso | cerrada */
  estado: string
  revision_id?: number
  fecha?: string
  responsable?: string | null
  items_total?: number
  items_respondidos?: number
  anomalias?: number
  adherencia_pct?: number
  secciones?: SeccionInspeccion[]
  url: string
}

function baseUrl(): string {
  const u = process.env.MANTENIMIENTO_API_URL || URL_POR_DEFECTO
  return u.replace(/\/$/, "")
}

/** "YYYY-MM" del mes de la reunión: la recorrida que le corresponde. */
export async function periodoDeReunion(fechaISO: string): Promise<string> {
  return fechaISO.slice(0, 7)
}

/**
 * Estado de la inspección de un mes. Devuelve null si la app externa no
 * responde: la reunión no se rompe por una integración caída.
 */
export async function obtenerEstadoInspeccion(
  periodo: string,
): Promise<EstadoInspeccion | null> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(
      `${baseUrl()}/api/inspecciones/estado?periodo=${encodeURIComponent(periodo)}`,
      { signal: controller.signal, cache: "no-store" },
    )
    if (!r.ok) return null
    return (await r.json()) as EstadoInspeccion
  } catch {
    return null
  } finally {
    clearTimeout(id)
  }
}
