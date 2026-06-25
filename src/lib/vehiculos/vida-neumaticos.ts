import type { VehiculoTipo } from "@/types/database"
import {
  PROFUNDIDAD_CRITICA_MM,
  type Neumatico,
  type NeumaticoTipo,
} from "@/lib/vehiculos/neumaticos-tipos"

// ====== Parámetros estimativos (editables en código) ======

// Km objetivo de vida útil por defecto, según tipo de cubierta. Por cubierta se
// puede sobrescribir con vida_util_km.
export const VIDA_UTIL_DEFAULT_KM: Record<NeumaticoTipo, number> = {
  nuevo: 100_000,
  recapado: 50_000,
}

// Km entre rotaciones de neumáticos.
export const ROTACION_KM = 20_000

// Umbrales para marcar "próximo" (a cambiar / a rotar pronto).
const PROXIMO_PCT = 0.9 // 90% de la vida consumida
const PROXIMO_KM = 2_000 // o quedan ≤ 2.000 km
const PROXIMO_DIAS = 15 // o quedan ≤ 15 días

export type EstadoVida = "ok" | "proximo" | "cambiar" | "sin_datos"
export type EstadoRotacion = "ok" | "proximo" | "vencido" | "sin_datos"

export interface VidaNeumatico {
  vidaKm: number
  kmRodados: number | null
  kmRestante: number | null
  pct: number | null
  diasRestantes: number | null
  estado: EstadoVida
}

/**
 * Estima la vida útil restante de una cubierta instalada.
 * @param n cubierta
 * @param kmActual odómetro actual de la unidad (de las lecturas diarias)
 * @param kmDia tasa de km/día de la unidad (para estimar días restantes)
 */
export function vidaNeumatico(
  n: Neumatico,
  kmActual: number | null,
  kmDia: number | null
): VidaNeumatico {
  const vidaKm = n.vida_util_km ?? VIDA_UTIL_DEFAULT_KM[n.tipo] ?? 100_000
  const profCritica =
    n.profundidad_actual_mm != null && n.profundidad_actual_mm <= PROFUNDIDAD_CRITICA_MM

  if (kmActual == null || n.km_instalacion == null) {
    return {
      vidaKm,
      kmRodados: null,
      kmRestante: null,
      pct: null,
      diasRestantes: null,
      estado: profCritica ? "cambiar" : "sin_datos",
    }
  }

  const kmRodados = Math.max(0, Math.round(kmActual - n.km_instalacion))
  const kmRestante = Math.round(vidaKm - kmRodados)
  const pct = vidaKm > 0 ? kmRodados / vidaKm : null
  const diasRestantes =
    kmDia && kmDia > 0 ? Math.round(kmRestante / kmDia) : null

  let estado: EstadoVida
  if (profCritica || kmRestante <= 0) {
    estado = "cambiar"
  } else if (
    (pct != null && pct >= PROXIMO_PCT) ||
    kmRestante <= PROXIMO_KM ||
    (diasRestantes != null && diasRestantes <= PROXIMO_DIAS)
  ) {
    estado = "proximo"
  } else {
    estado = "ok"
  }

  return { vidaKm, kmRodados, kmRestante, pct, diasRestantes, estado }
}

export interface RotacionEstado {
  proximaKm: number | null
  kmRestante: number | null
  diasRestantes: number | null
  estado: EstadoRotacion
}

/**
 * Estima cuánto falta para la próxima rotación.
 * @param baseKm km de la última rotación (o km base desde el cual contar)
 * @param kmActual odómetro actual
 * @param kmDia tasa km/día
 */
export function rotacionEstado(
  baseKm: number | null,
  kmActual: number | null,
  kmDia: number | null
): RotacionEstado {
  if (baseKm == null || kmActual == null) {
    return { proximaKm: null, kmRestante: null, diasRestantes: null, estado: "sin_datos" }
  }
  const proximaKm = Math.round(baseKm + ROTACION_KM)
  const kmRestante = Math.round(proximaKm - kmActual)
  const diasRestantes = kmDia && kmDia > 0 ? Math.round(kmRestante / kmDia) : null
  let estado: EstadoRotacion
  if (kmRestante <= 0) estado = "vencido"
  else if (kmRestante <= PROXIMO_KM || (diasRestantes != null && diasRestantes <= PROXIMO_DIAS))
    estado = "proximo"
  else estado = "ok"
  return { proximaKm, kmRestante, diasRestantes, estado }
}

// ====== Rotación sugerida por tipo de vehículo ======
// Mapa posición-origen → posición-destino. Es una sugerencia de cruce para
// emparejar el desgaste; el operador puede ajustarla.
export const ROTACION_SUGERIDA: Partial<Record<VehiculoTipo, Record<string, string>>> = {
  camion: {
    "1I": "2DE",
    "1D": "2IE",
    "2IE": "1D",
    "2DE": "1I",
    "2II": "2DI",
    "2DI": "2II",
  },
  camioneta: {
    "1I": "2I",
    "1D": "2D",
    "2I": "1D",
    "2D": "1I",
  },
  utilitario: {
    "1I": "2I",
    "1D": "2D",
    "2I": "1D",
    "2D": "1I",
  },
  autoelevador: {
    "1I": "2D",
    "2D": "1I",
    "1D": "2I",
    "2I": "1D",
  },
  acoplado: {
    "1IE": "1II",
    "1II": "1IE",
    "1DI": "1DE",
    "1DE": "1DI",
    "2IE": "2II",
    "2II": "2IE",
    "2DI": "2DE",
    "2DE": "2DI",
    "3IE": "3II",
    "3II": "3IE",
    "3DI": "3DE",
    "3DE": "3DI",
  },
}

export function rotacionSugerida(tipo: VehiculoTipo | null): Record<string, string> {
  return ROTACION_SUGERIDA[tipo ?? "camion"] ?? {}
}

export const VIDA_BADGE: Record<EstadoVida, { label: string; clase: string }> = {
  ok: { label: "OK", clase: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  proximo: { label: "Próximo", clase: "border-amber-200 bg-amber-50 text-amber-700" },
  cambiar: { label: "Cambiar", clase: "border-red-200 bg-red-50 text-red-700" },
  sin_datos: { label: "Sin datos", clase: "border-slate-200 bg-slate-50 text-slate-500" },
}
