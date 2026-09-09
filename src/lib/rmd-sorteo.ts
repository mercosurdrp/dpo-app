/** Campaña vigente del folleto (una fila por PDV por campaña). */
export const RMD_SORTEO_CAMPANIA = "folleto-2026-09"

/** URL pública que va en el QR del folleto. */
export const RMD_SORTEO_URL = "https://dpo-app-self.vercel.app/sorteo-rmd"

/** Cuándo se sortea (ISO). Se muestra en la página del QR y en Cobertura. */
export const RMD_SORTEO_FECHA = "2026-11-05"

/** La fecha del sorteo en formato largo, ej. «jueves 5 de noviembre». */
export function fechaSorteoLarga(): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(RMD_SORTEO_FECHA + "T12:00:00-03:00"))
}

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
  /** Horario en que puede recibir el pedido (HH:MM). */
  ventana_desde: string
  ventana_hasta: string
  ventana_obs?: string
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
