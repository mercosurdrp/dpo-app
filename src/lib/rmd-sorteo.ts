/** Campaña vigente del folleto (una fila por PDV por campaña). */
export const RMD_SORTEO_CAMPANIA = "folleto-2026-09"

/** URL pública que va en el QR del folleto. */
export const RMD_SORTEO_URL = "https://dpo-app.vercel.app/sorteo-rmd"

/** Qué se sortea (va en la página del QR y en el folleto). */
export const RMD_SORTEO_PREMIO = {
  titulo: "1 bulto de Stella Artois + merchandising",
  items: [
    { nombre: "Stella Artois", detalle: "1 bulto" },
    { nombre: "Merchandising", detalle: "+ regalos" },
  ],
}

export interface InscripcionSorteoInput {
  nombre_pdv: string
  cod_cliente?: string
  direccion: string
  localidad: string
  nombre_contacto: string
  telefono: string
  declara_califico: boolean
  /** Honeypot: los bots lo completan, las personas no lo ven. */
  web?: string
}

/** Normaliza un nombre de cliente para compararlo (tildes, puntuación, espacios). */
export function normalizarNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}
