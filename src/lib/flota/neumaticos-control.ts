/**
 * Control mensual de neumáticos (DPO Flota 3.4).
 *
 * Una vez por mes, cada camión y cada autoelevador tiene que tener medidas
 * TODAS sus cubiertas instaladas: profundidad de dibujo y presión.
 *
 * 🚨 Los umbrales son los mismos que usa el KPI `neumaticos_conformidad`. Viven
 * acá para que exista un solo lugar donde cambiarlos: cuando el catálogo de
 * tareas del CIL estuvo duplicado en dos archivos, la copia siguió ofreciendo
 * una opción que la base rechazaba y todos los registros fallaban en silencio.
 */

/** Por debajo de esto la cubierta está para cambio. */
export const PROF_MIN_MM = 3

/**
 * Desde acá para abajo la cubierta entra en alerta: todavía es legal, pero hay
 * que empezar a programar el cambio. Nivel acordado con Francisco el 07/08/2026:
 * crítico por debajo de 3 mm, alerta entre 3 y 5 mm.
 *
 * 🚨 El crítico NO se movió de 3 mm a propósito: es el mismo que usa el KPI
 * `neumaticos_conformidad` desde que existe. Subirlo habría hecho caer el
 * indicador de un mes al otro sin que ninguna cubierta se hubiera gastado.
 */
export const PROF_ALERTA_MM = 5

export type NivelProfundidad = "ok" | "alerta" | "critico"

export function nivelProfundidad(mm: number | null): NivelProfundidad | null {
  if (mm == null) return null
  if (mm < PROF_MIN_MM) return "critico"
  if (mm <= PROF_ALERTA_MM) return "alerta"
  return "ok"
}

/**
 * Máximo que se acepta como dibujo. Una cubierta de camión nueva ronda los 15-16
 * mm; 30 deja margen de sobra y ataja el error de tipeo grande.
 */
export const PROF_MAX_MM = 30

/**
 * 🚨 La profundidad se carga SIEMPRE con decimal: "11.5", y "12" hay que
 * escribirlo "12.0".
 *
 * No es capricho de formato. Sin el punto, el que mide 11,5 mm escribe "115" y
 * la cubierta queda con un dibujo diez veces mayor que el real: pasa de estar
 * para cambio a figurar impecable, y nadie lo detecta hasta que revienta. Exigir
 * el punto obliga a mirar el número antes de guardarlo (pedido de Francisco,
 * 07/08/2026).
 *
 * Devuelve el motivo del rechazo, o null si el valor sirve.
 */
export function validarProfundidad(texto: string): string | null {
  const t = (texto ?? "").trim()
  if (!t) return null // vacío es válido: esa cubierta no se mide y se saltea
  if (!/[.,]/.test(t)) {
    return "Escribí la profundidad con punto y un decimal: 11.5 · 8.0 · 12.0"
  }
  const n = Number(t.replace(",", "."))
  if (!Number.isFinite(n)) return "Ese valor no es un número."
  if (n <= 0) return "La profundidad tiene que ser mayor a 0."
  if (n > PROF_MAX_MM) return `Revisá el valor: ${PROF_MAX_MM} mm es el máximo.`
  return null
}

/** Rango de presión aceptable, en PSI. */
export const PRESION_MIN_PSI = 90
export const PRESION_MAX_PSI = 120

/**
 * Alcance del control mensual, por `catalogo_vehiculos.tipo`.
 *
 * Camiones y autoelevadores. Las camionetas y el acoplado se ven en el módulo
 * de Neumáticos del supervisor, pero no entran en el porcentaje mensual del
 * chofer.
 *
 * 🚨 Ya NO coincide con el alcance del CIL: ahí las camionetas entraron el
 * 11/08/2026 y acá quedaron afuera. Si alguna vez tienen que volver a ir
 * juntas, es una decisión explícita, no un descuido de este comentario.
 */
export const TIPOS_NEUMATICOS_OBLIGATORIOS = ["camion", "autoelevador"] as const

/** Una medición sirve si trae al menos uno de los dos valores. */
export function medicionCompleta(
  profundidad_mm: number | null,
  presion_psi: number | null,
): boolean {
  return profundidad_mm != null || presion_psi != null
}

/** Si la cubierta está dentro de norma con los valores medidos. */
export function cubiertaConforme(
  profundidad_mm: number | null,
  presion_psi: number | null,
): boolean {
  const profOk = profundidad_mm == null || profundidad_mm >= PROF_MIN_MM
  const psiOk =
    presion_psi == null ||
    (presion_psi >= PRESION_MIN_PSI && presion_psi <= PRESION_MAX_PSI)
  return profOk && psiOk
}

/**
 * Texto de por qué una cubierta quedó fuera de norma, para mostrárselo al
 * chofer en el momento en que carga el valor y no un mes después.
 */
export function motivoDesvio(
  profundidad_mm: number | null,
  presion_psi: number | null,
): string | null {
  if (profundidad_mm != null && profundidad_mm < PROF_MIN_MM) {
    return `Dibujo por debajo de ${PROF_MIN_MM} mm: la cubierta está para cambio.`
  }
  if (presion_psi != null && presion_psi < PRESION_MIN_PSI) {
    return `Presión baja (mínimo ${PRESION_MIN_PSI} psi).`
  }
  if (presion_psi != null && presion_psi > PRESION_MAX_PSI) {
    return `Presión alta (máximo ${PRESION_MAX_PSI} psi).`
  }
  return null
}
