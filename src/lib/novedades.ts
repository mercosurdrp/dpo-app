// Tipos y constantes de la cartelera de Novedades (sin "use server": se
// importan desde componentes cliente).

export const NOVEDADES_BUCKET = "novedades"
/** Vercel corta el body de una request en ~4,5 MB: dejamos margen. */
export const NOVEDAD_IMAGEN_MAX_BYTES = 4 * 1024 * 1024

export interface Novedad {
  id: string
  titulo: string
  texto: string | null
  imagen_url: string | null
  vigente_hasta: string | null
  fijada: boolean
  created_at: string
  autor: string | null
}
