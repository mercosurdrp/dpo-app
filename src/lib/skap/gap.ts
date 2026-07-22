import type { SkapCelda, SkapEstadoGap, SkapHabilidad } from "@/types/database"

// 🚨 Vive acá y NO en `actions/skap-habilidades.ts`: un archivo "use server"
// solo puede exportar funciones async. Además así la regla del semáforo queda
// en UN solo lugar, compartida por la matriz del supervisor y la vista del
// empleado (/visibilidad-resultados).

/** Escala del instructivo: qué significa cada nivel. */
export const ESCALA_SKAP: Record<number, string> = {
  0: "No conoce. No recibió instrucción.",
  1: "Opera con limitaciones, necesita ayuda o supervisión frecuente.",
  2: "Opera sin ayuda, pero no domina los fundamentos teóricos.",
  3: "Aplica teoría y práctica. Trabaja sin errores en cualquier momento y lugar.",
  4: "Puede instruir a otros. Es un experto.",
}

export const COLOR_GAP: Record<SkapEstadoGap, string> = {
  critico: "bg-red-500 text-white",
  brecha: "bg-amber-400 text-amber-950",
  cumple: "bg-emerald-500 text-white",
  sin_evaluar: "bg-slate-100 text-slate-400",
  no_aplica: "bg-slate-200 text-slate-500",
}

export const LABEL_GAP: Record<SkapEstadoGap, string> = {
  critico: "Gap crítico (2 o más niveles por debajo)",
  brecha: "Brecha (1 nivel por debajo)",
  cumple: "Cumple el estándar",
  sin_evaluar: "Sin evaluar",
  no_aplica: "No aplica",
}

type EvaluacionMinima = {
  nivel: number | null
  estandar_individual: number | null
  fecha_evaluacion: string
}

/**
 * Semáforo del gap, tal cual el instructivo del Excel:
 *   gap <= -2  crítico | gap == -1  brecha | gap >= 0  cumple
 * El estándar individual (si existe) le gana al general de la habilidad.
 */
export function calcularCelda(
  habilidad: SkapHabilidad,
  evaluacion: EvaluacionMinima | undefined,
): SkapCelda {
  const estandar = evaluacion?.estandar_individual ?? habilidad.estandar

  if (!evaluacion) {
    return {
      habilidad_id: habilidad.id,
      nivel: null,
      estandar,
      gap: null,
      estado: "sin_evaluar",
      fecha_evaluacion: null,
    }
  }
  if (evaluacion.nivel === null) {
    return {
      habilidad_id: habilidad.id,
      nivel: null,
      estandar,
      gap: null,
      estado: "no_aplica",
      fecha_evaluacion: evaluacion.fecha_evaluacion,
    }
  }

  const gap = evaluacion.nivel - estandar
  let estado: SkapEstadoGap
  if (gap >= 0) estado = "cumple"
  else if (gap === -1) estado = "brecha"
  else estado = "critico"

  return {
    habilidad_id: habilidad.id,
    nivel: evaluacion.nivel,
    estandar,
    gap,
    estado,
    fecha_evaluacion: evaluacion.fecha_evaluacion,
  }
}
