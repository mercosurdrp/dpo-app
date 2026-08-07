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

/** Rango de presión aceptable, en PSI. */
export const PRESION_MIN_PSI = 90
export const PRESION_MAX_PSI = 120

/**
 * Alcance del control mensual, por `catalogo_vehiculos.tipo`.
 *
 * Igual que en el CIL: camiones y autoelevadores. Las camionetas y el acoplado
 * se ven en el módulo de Neumáticos del supervisor, pero no entran en el
 * porcentaje mensual del chofer.
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
