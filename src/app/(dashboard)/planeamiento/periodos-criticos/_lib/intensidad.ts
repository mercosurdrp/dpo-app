// Escala del calendario de Períodos Críticos (DPO 3.4), en tres colores.
//
// La decide el VOLUMEN del día contra la capacidad de distribución, y nada más:
//   ROJO     CRITICO — el volumen supera la capacidad.
//   AMARILLO LIMITE  — no la supera, pero llega al 90% o más: la semana aprieta.
//   VERDE    NORMAL  — el resto.
//
// Clientes, rechazo y ausentismo nunca cambian el color: se ven en el detalle
// del día como contexto. La banda "al límite" existe para que un período se lea
// como semana y no como celdas rojas sueltas: la previa de Navidad 2025 fue
// 96% · 113% · 102% · 94% en cuatro días hábiles seguidos.
//
// Este archivo no tiene "use client": lo importan la pantalla, la API del mes
// siguiente y la sección de la reunión Ventas-Logística.

export type Intensidad = "CRITICO" | "LIMITE" | "NORMAL"

/** Desde qué fracción de la capacidad un día cuenta como "al límite". */
export const PCT_LIMITE = 0.9

/** Lo mínimo que hace falta saber de un día para clasificarlo. */
export type DiaClasificable = {
  trigger_vol: boolean
  /** hl / capacidad (1 = justo la capacidad). */
  pct_capacidad: number
}

export function intensidadDia(d: DiaClasificable): Intensidad {
  if (d.trigger_vol) return "CRITICO"
  if (Number(d.pct_capacidad) >= PCT_LIMITE) return "LIMITE"
  return "NORMAL"
}

// De menor a mayor, para poder pedir "la peor del bloque".
const ESCALA: Intensidad[] = ["NORMAL", "LIMITE", "CRITICO"]

export function intensidadMax(dias: DiaClasificable[]): Intensidad {
  let peor = 0
  for (const d of dias) peor = Math.max(peor, ESCALA.indexOf(intensidadDia(d)))
  return ESCALA[peor]
}

export const INTENSIDAD_LABEL: Record<Intensidad, string> = {
  CRITICO: "CRÍTICO",
  LIMITE: "AL LÍMITE",
  NORMAL: "NORMAL",
}

/** Descripción corta de cada escalón (planes de acción, leyendas). */
export const INTENSIDAD_DESC: Record<Intensidad, string> = {
  CRITICO: "El volumen supera la capacidad de distribución",
  LIMITE: `Entre el ${Math.round(PCT_LIMITE * 100)}% y el 100% de la capacidad`,
  NORMAL: "Día normal",
}

// Color de fondo por intensidad (celdas del calendario / badges).
export const INTENSIDAD_BG: Record<Intensidad, string> = {
  CRITICO: "bg-red-600 text-white font-semibold",
  LIMITE:  "bg-amber-300 text-amber-950 font-medium",
  NORMAL:  "bg-emerald-500/80 text-white",
}
