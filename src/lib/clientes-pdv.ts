// ─────────────────────────────────────────────────────────────────────────────
// Buscador de clientes del chofer (DPO Entrega 4.1): ventana horaria del PDV,
// teléfono del cliente y celular de su vendedor, para que en la calle sepa
// cuándo lo recibe y a quién llamar antes de volverse con un rechazo.
//
// Tipos y helpers puros: lo importa el componente de cliente, así que nada de
// server-only acá. La consulta vive en `@/actions/clientes-pdv`.
// ─────────────────────────────────────────────────────────────────────────────

export type DiaSemana = "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom"

export const DIAS_SEMANA: { id: DiaSemana; label: string }[] = [
  { id: "lun", label: "Lunes" },
  { id: "mar", label: "Martes" },
  { id: "mie", label: "Miércoles" },
  { id: "jue", label: "Jueves" },
  { id: "vie", label: "Viernes" },
  { id: "sab", label: "Sábado" },
  { id: "dom", label: "Domingo" },
]

/** Un día del relevamiento: hasta dos turnos ["HH:MM", "HH:MM"]. */
export interface HorarioDia {
  abre: boolean
  t1: [string, string] | null
  t2: [string, string] | null
}

/** `clientes.horario` del dashboard Mercosur (lo carga el promotor en /horarios-pdv). */
export type HorarioPdv = Partial<Record<DiaSemana, HorarioDia>>

export interface VendedorPdv {
  nombre: string
  /** E.164 sin "+", de `bot_vendedores_wa`. null = no está cargado. */
  telefono: string | null
}

export interface ClientePdv {
  id_cliente: number
  razon_social: string
  nombre_fantasia: string | null
  direccion: string | null
  localidad: string | null
  lat: number | null
  lng: number | null
  anulado: boolean
  /** Ventana relevada por el promotor. null = el PDV no se relevó nunca. */
  horario: HorarioPdv | null
  horario_ciclo: string | null
  /** YYYY-MM-DD */
  horario_actualizado: string | null
  /** Texto libre de Chess ("8 A 13 / 16 A 20"): sólo de referencia. */
  horario_chess: string | null
  comentario_entrega: string | null
  telefonos: string[]
  vendedores: VendedorPdv[]
}

/** Día de hoy en Argentina, en las claves del relevamiento. */
export function diaDeHoy(): DiaSemana {
  const d = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date())
  const map: Record<string, DiaSemana> = {
    Mon: "lun",
    Tue: "mar",
    Wed: "mie",
    Thu: "jue",
    Fri: "vie",
    Sat: "sab",
    Sun: "dom",
  }
  return map[d] ?? "lun"
}

/** "08:00 a 12:30 · 16:00 a 20:00", "Cerrado" o null si el día no tiene dato. */
export function textoDia(dia: HorarioDia | undefined): string | null {
  if (!dia) return null
  if (!dia.abre) return "Cerrado"
  const turnos = [dia.t1, dia.t2]
    .filter((t): t is [string, string] => !!t && !!t[0] && !!t[1])
    .map(([a, b]) => `${a} a ${b}`)
  return turnos.length > 0 ? turnos.join(" · ") : "Abre (sin horario)"
}

/**
 * Teléfono argentino como lo carga Chess ("3364359193", "03364-15359193",
 * "+54 9 336...") → E.164 sin "+" para wa.me. null si no parece un número.
 */
export function telefonoWhatsapp(tel: string): string | null {
  let d = tel.replace(/\D/g, "")
  if (d.startsWith("549") && d.length === 13) return d
  if (d.startsWith("54") && d.length === 12) return `549${d.slice(2)}`
  if (d.startsWith("0")) d = d.slice(1)
  // Celular viejo con 15 en el medio: 3364-15-359193 → 3364359193.
  const con15 = d.match(/^(\d{2,4})15(\d{6,8})$/)
  if (con15 && con15[1].length + con15[2].length === 10) d = con15[1] + con15[2]
  return d.length === 10 ? `549${d}` : null
}

/** Para mostrar: "336 4359193" queda como lo cargaron, salvo los E.164 del bot. */
export function telefonoLegible(tel: string): string {
  const d = tel.replace(/\D/g, "")
  if (d.startsWith("549") && d.length === 13) return d.slice(3)
  return tel.trim()
}
