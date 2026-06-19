import type { MejorSi } from "./arbol-config"

export type EstadoSemaforo = "verde" | "amarillo" | "rojo" | "sin_dato"

/**
 * Semáforo del Árbol del Sueño. Replica la semántica meta + gatillo + polaridad
 * ya usada en reuniones (ver migración 078_reuniones_indicadores_gatillo.sql):
 *
 *  - mejorSi 'mayor': v ≥ meta → verde · gatillo ≤ v < meta → amarillo · v < gatillo → rojo
 *  - mejorSi 'menor': v ≤ meta → verde · meta < v ≤ gatillo → amarillo · v > gatillo → rojo
 *
 * Sin gatillo definido: solo verde/rojo según la meta.
 * Sin valor o sin meta: 'sin_dato' (gris).
 */
export function estadoSemaforo(
  valor: number | null | undefined,
  meta: number | null | undefined,
  gatillo: number | null | undefined,
  mejorSi: MejorSi,
): EstadoSemaforo {
  if (valor == null || meta == null) return "sin_dato"

  if (mejorSi === "mayor") {
    if (valor >= meta) return "verde"
    if (gatillo != null) return valor >= gatillo ? "amarillo" : "rojo"
    return "rojo"
  }

  // mejorSi === "menor"
  if (valor <= meta) return "verde"
  if (gatillo != null) return valor <= gatillo ? "amarillo" : "rojo"
  return "rojo"
}

export const SEMAFORO_COLOR: Record<EstadoSemaforo, string> = {
  verde: "#10B981",
  amarillo: "#F59E0B",
  rojo: "#EF4444",
  sin_dato: "#94A3B8",
}

export const SEMAFORO_LABEL: Record<EstadoSemaforo, string> = {
  verde: "En meta",
  amarillo: "Atención",
  rojo: "Fuera de meta",
  sin_dato: "Sin dato",
}
