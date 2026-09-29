import type { SkapEstadoAccion } from "@/types/database"

// Avance por persona del plan de acción SKAP + los PDP de Desempeño.
// Client-safe (sin "server-only").
//
// Los PDP (Planes de Desarrollo Personal) los cargan los líderes en la
// plataforma de la compañía y rrhh-app los importa a `app_config`
// `des:pdp:<año>` en ESTA misma base (ver rrhh-app lib/desempeno/pdp.ts).
// Acá sólo se leen: se cruzan por DNI (`empleados.numero_id`).

/** Regla de RRHH (23/09/2026): cada evaluado tiene que tener al menos 2 PDP. */
export const MIN_PDP = 2

/** Mismo formato que guarda rrhh-app (`ObjetivoPDP`). */
export interface ObjetivoPdp {
  dni: string
  nombre: string
  sector: string
  jefe: { dni: string; nombre: string }
  objetivo: string
  descripcion: string
  metodo: string
  meta: number | null
  obtenido: number | null
}

export const clavePdp = (anio: number) => `des:pdp:${anio}`

/** Mismo criterio que rrhh-app: obtenido/meta topeado en 100; sin meta ⇒ null. */
export function avanceObjetivo(o: Pick<ObjetivoPdp, "meta" | "obtenido">): number | null {
  if (!o.meta) return null
  return Math.min(100, (100 * (o.obtenido ?? 0)) / o.meta)
}

/** «realizada» (cumplida en el PAC) y «cerrada» (reevaluada) cuentan como hechas. */
export const accionHecha = (estado: SkapEstadoAccion) => estado === "realizada" || estado === "cerrada"

export const normalizarDni = (d: string | null | undefined) => (d ?? "").replace(/\D/g, "").replace(/^0+/, "")

export interface AvanceAccionSkap {
  id: string
  habilidad: string
  criticidad: string
  estado: SkapEstadoAccion
  fecha_programada: string | null
  fecha_realizada: string | null
  vencida: boolean
}

export interface AvancePdp {
  objetivo: string
  descripcion: string
  jefe: string
  meta: number | null
  obtenido: number | null
  avance: number | null
}

export interface AvancePersona {
  empleado_id: string
  nombre: string
  legajo: number
  acciones: AvanceAccionSkap[]
  pdp: AvancePdp[]
  /** % de acciones SKAP hechas; null si no tiene acciones. */
  avance_skap: number | null
  /** Promedio del avance de sus objetivos PDP; null si no tiene PDP con meta. */
  avance_pdp: number | null
  /** Promedio de los dos planes que tenga (cada plan pesa lo mismo); null si no tiene ninguno. */
  avance_total: number | null
}

const promedio = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

export function calcularAvance(
  p: Omit<AvancePersona, "avance_skap" | "avance_pdp" | "avance_total">,
): AvancePersona {
  const avance_skap = p.acciones.length
    ? (100 * p.acciones.filter((a) => accionHecha(a.estado)).length) / p.acciones.length
    : null
  const avance_pdp = promedio(p.pdp.map((o) => o.avance).filter((x): x is number => x !== null))
  const avance_total = promedio([avance_skap, avance_pdp].filter((x): x is number => x !== null))
  return { ...p, avance_skap, avance_pdp, avance_total }
}
